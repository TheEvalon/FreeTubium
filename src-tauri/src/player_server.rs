//! Loopback HTTP server behind both Watch players.
//!
//! It exists twice over. The embedded YouTube player needs an HTTP Referer or
//! YouTube shows its blocked-playback screen (error 153), and the app window is
//! served from a custom `tauri://` scheme that cannot provide one; serving the
//! embed's host page from `127.0.0.1` gives it a real http origin, and the app
//! window drives it over `postMessage`.
//!
//! The local player needs it for a harder reason. Tauri's asset protocol serves
//! files to the webview correctly, but WebKitGTK routes media playback through
//! GStreamer, which refuses every scheme outside a fixed list — `blob`, `data`,
//! `file`, `http`, `https` — so `asset://` can never feed a `<video>` on Linux
//! (WebKit bug 146351). `http` is on that list on every platform, so prepared
//! files go out over this server with byte-range support, which is what makes
//! seeking work.
//!
//! Every route carries a per-run random token, so other local processes can
//! neither drive the player nor read what the user is watching.

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;

use tiny_http::{Header, Request, Response, Server, StatusCode};
use uuid::Uuid;

const PLAYER_HTML: &str = include_str!("player.html");

/// Enough to keep a range request from waiting behind the embed's host page.
const WORKERS: usize = 4;

#[derive(Default)]
pub struct PlayerServerState(pub Mutex<Option<PlayerServer>>);

/// Prepared files the server may serve, keyed by watch session id.
type Files = Arc<Mutex<HashMap<String, PathBuf>>>;

#[derive(Clone)]
pub struct PlayerServer {
    pub port: u16,
    pub token: String,
    files: Files,
}

impl PlayerServer {
    /// Host page for the YouTube embed.
    pub fn player_url(&self) -> String {
        format!("http://127.0.0.1:{}/player/{}", self.port, self.token)
    }

    /// Playback URL for a registered session.
    pub fn media_url(&self, session_id: &str) -> String {
        format!(
            "http://127.0.0.1:{}/media/{}/{}",
            self.port, self.token, session_id
        )
    }

    pub fn register(&self, session_id: &str, path: PathBuf) {
        self.files
            .lock()
            .unwrap()
            .insert(session_id.to_string(), path);
    }

    pub fn unregister(&self, session_id: &str) {
        self.files.lock().unwrap().remove(session_id);
    }
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn text_response(status: u16, body: &str) -> Response<Box<dyn Read + Send>> {
    let bytes = body.as_bytes().to_vec();
    let length = bytes.len();
    Response::new(
        StatusCode(status),
        vec![header("Content-Type", "text/plain; charset=utf-8")],
        Box::new(std::io::Cursor::new(bytes)) as Box<dyn Read + Send>,
        Some(length),
        None,
    )
}

/// What a `Range` header asks for, once checked against the real file size.
#[derive(Debug, PartialEq, Eq)]
enum Requested {
    /// No range header, or one this server does not implement.
    Whole,
    /// Inclusive first and last byte, both known to be inside the file.
    Part(u64, u64),
    /// A range that starts past the end of the file.
    Unsatisfiable,
}

/// Parses a single byte range, which is all a `<video>` element ever sends.
///
/// Multipart ranges are legal HTTP but no media element asks for them, so they
/// fall back to the whole file rather than growing a multipart encoder.
fn parse_range(header: Option<&str>, size: u64) -> Requested {
    let Some(spec) = header.and_then(|h| h.trim().strip_prefix("bytes=")) else {
        return Requested::Whole;
    };
    if spec.contains(',') || size == 0 {
        return Requested::Whole;
    }

    let (raw_start, raw_end) = match spec.split_once('-') {
        Some(parts) => parts,
        None => return Requested::Whole,
    };
    let last = size - 1;

    // "-N" asks for the final N bytes, which is how players read an MP4's
    // trailing index when it was not written at the front.
    if raw_start.is_empty() {
        return match raw_end.parse::<u64>() {
            Ok(0) => Requested::Unsatisfiable,
            Ok(suffix) => Requested::Part(size.saturating_sub(suffix), last),
            Err(_) => Requested::Whole,
        };
    }

    let Ok(start) = raw_start.parse::<u64>() else {
        return Requested::Whole;
    };
    if start > last {
        return Requested::Unsatisfiable;
    }
    let end = match raw_end {
        "" => last,
        value => match value.parse::<u64>() {
            Ok(end) => end.min(last),
            Err(_) => return Requested::Whole,
        },
    };
    if end < start {
        return Requested::Unsatisfiable;
    }
    Requested::Part(start, end)
}

/// Content type for a served file, from its extension.
///
/// Prepared streams are always remuxed to MP4, but the Watch page also plays
/// finished downloads, which keep whichever container the user asked for. A
/// webview told `video/mp4` for a WebM or an MP3 may refuse to play it.
fn content_type(path: &Path) -> &'static str {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("webm") => "video/webm",
        Some("mkv") => "video/x-matroska",
        Some("ogv") => "video/ogg",
        Some("mov") => "video/quicktime",
        Some("avi") => "video/x-msvideo",
        Some("m4a") => "audio/mp4",
        Some("mp3") => "audio/mpeg",
        Some("ogg") | Some("opus") => "audio/ogg",
        Some("flac") => "audio/flac",
        Some("wav") => "audio/wav",
        // Covers mp4 and m4v, and is the safest guess for anything unknown
        // because everything this server prepares itself is an MP4.
        _ => "video/mp4",
    }
}

/// Serves a prepared file, honouring the range the player asked for.
///
/// Every response opts out of tiny_http's chunked encoding, which it otherwise
/// applies to anything over 32 KB. Chunked responses carry no `Content-Length`,
/// and without one the player cannot know the duration or issue range requests,
/// so it treats the video as a live stream and offers no seek bar at all.
fn media_response(path: &PathBuf, range: Option<&str>) -> Response<Box<dyn Read + Send>> {
    let Ok(mut file) = File::open(path) else {
        return text_response(404, "not found");
    };
    let size = match file.metadata() {
        Ok(meta) => meta.len(),
        Err(_) => return text_response(500, "cannot read the prepared file"),
    };

    let mut headers = vec![
        header("Content-Type", content_type(path)),
        header("Accept-Ranges", "bytes"),
        // The file only lives as long as the session, and a stale cached copy
        // would outlive it.
        header("Cache-Control", "no-store"),
    ];

    match parse_range(range, size) {
        Requested::Whole => Response::new(
            StatusCode(200),
            headers,
            Box::new(file) as Box<dyn Read + Send>,
            Some(size as usize),
            None,
        )
        .with_chunked_threshold(usize::MAX),
        Requested::Part(start, end) => {
            if file.seek(SeekFrom::Start(start)).is_err() {
                return text_response(500, "cannot seek the prepared file");
            }
            let length = end - start + 1;
            headers.push(header(
                "Content-Range",
                &format!("bytes {start}-{end}/{size}"),
            ));
            Response::new(
                StatusCode(206),
                headers,
                Box::new(file.take(length)) as Box<dyn Read + Send>,
                Some(length as usize),
                None,
            )
            .with_chunked_threshold(usize::MAX)
        }
        Requested::Unsatisfiable => {
            let mut response = text_response(416, "range not satisfiable");
            response.add_header(header("Content-Range", &format!("bytes */{size}")));
            response
        }
    }
}

fn handle(request: Request, token: &str, files: &Files) {
    let range = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .map(|h| h.value.as_str().to_string());

    let url = request.url().to_string();
    let response = if url == format!("/player/{token}") {
        let bytes = PLAYER_HTML.as_bytes().to_vec();
        let length = bytes.len();
        Response::new(
            StatusCode(200),
            vec![
                header("Content-Type", "text/html; charset=utf-8"),
                // YouTube needs a Referer; this policy sends the origin without
                // the token, which is enough for YouTube and less than it could
                // otherwise leak.
                header("Referrer-Policy", "strict-origin-when-cross-origin"),
            ],
            Box::new(std::io::Cursor::new(bytes)) as Box<dyn Read + Send>,
            Some(length),
            None,
        )
    } else if let Some(session_id) = url.strip_prefix(&format!("/media/{token}/")) {
        let path = files.lock().unwrap().get(session_id).cloned();
        match path {
            Some(path) => media_response(&path, range.as_deref()),
            None => text_response(404, "not found"),
        }
    } else {
        text_response(404, "not found")
    };

    let _ = request.respond(response);
}

/// Binds the server on a free loopback port and starts serving.
pub fn start() -> Result<PlayerServer, String> {
    let server = Arc::new(
        Server::http("127.0.0.1:0").map_err(|e| format!("cannot start the player server: {e}"))?,
    );
    let port = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| "player server did not bind to an IP port".to_string())?
        .port();

    let token = Uuid::new_v4().to_string();
    let files: Files = Arc::new(Mutex::new(HashMap::new()));

    for _ in 0..WORKERS {
        let server = Arc::clone(&server);
        let token = token.clone();
        let files = Arc::clone(&files);
        thread::spawn(move || {
            while let Ok(request) = server.recv() {
                handle(request, &token, &files);
            }
        });
    }

    Ok(PlayerServer { port, token, files })
}

/// Returns the running server, starting it on first use so a failure only
/// affects the Watch page rather than app startup.
pub fn ensure(state: &PlayerServerState) -> Result<PlayerServer, String> {
    let mut guard = state.0.lock().unwrap();
    if guard.is_none() {
        *guard = Some(start()?);
    }
    Ok(guard.as_ref().expect("just started").clone())
}

/// URL of the embed host page.
#[tauri::command]
pub fn player_page_url(state: tauri::State<'_, PlayerServerState>) -> Result<String, String> {
    Ok(ensure(&state)?.player_url())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::TcpStream;

    /// Raw request, so the tests exercise the wire format the webview sees.
    fn get(port: u16, path: &str, range: Option<&str>) -> (String, Vec<u8>) {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect");
        let range = range
            .map(|r| format!("Range: {r}\r\n"))
            .unwrap_or_default();
        write!(
            stream,
            "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n{range}Connection: close\r\n\r\n"
        )
        .expect("write");
        let mut raw = Vec::new();
        stream.read_to_end(&mut raw).expect("read");

        let split = raw
            .windows(4)
            .position(|w| w == b"\r\n\r\n")
            .expect("headers end");
        (
            String::from_utf8_lossy(&raw[..split]).to_string(),
            raw[split + 4..].to_vec(),
        )
    }

    fn temp_file_named(extension: &str, contents: &[u8]) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("ft-media-{}.{extension}", Uuid::new_v4()));
        File::create(&path)
            .expect("create")
            .write_all(contents)
            .expect("write");
        path
    }

    fn temp_file(contents: &[u8]) -> PathBuf {
        temp_file_named("mp4", contents)
    }

    #[test]
    fn serves_the_player_page_only_on_its_token_path() {
        let server = start().expect("server starts");

        let (headers, body) = get(server.port, &format!("/player/{}", server.token), None);
        assert!(headers.starts_with("HTTP/1.1 200"), "{headers}");
        assert!(headers.contains("text/html"));
        // The page is useless without the IFrame API and the host protocol.
        let body = String::from_utf8_lossy(&body);
        assert!(body.contains("youtube.com/iframe_api"));
        assert!(body.contains("freetubium-player"));

        // An unguessable path is the only thing keeping other local processes
        // from driving the player.
        for path in ["/", "/player/", "/player/wrong-token"] {
            let (headers, _) = get(server.port, path, None);
            assert!(headers.starts_with("HTTP/1.1 404"), "{path}: {headers}");
        }
    }

    /// Finished downloads keep the container the user asked for, so the type has
    /// to come from the file rather than from what preparation happens to make.
    #[test]
    fn content_type_follows_the_container() {
        for (name, expected) in [
            ("clip.mp4", "video/mp4"),
            ("clip.webm", "video/webm"),
            ("clip.mkv", "video/x-matroska"),
            ("clip.MP3", "audio/mpeg"),
            ("clip.m4a", "audio/mp4"),
            ("clip.opus", "audio/ogg"),
            // Unknown and missing extensions fall back to the prepared format.
            ("clip.xyz", "video/mp4"),
            ("clip", "video/mp4"),
        ] {
            assert_eq!(content_type(Path::new(name)), expected, "{name}");
        }
    }

    #[test]
    fn a_download_is_served_as_its_own_type() {
        let server = start().expect("server starts");
        server.register("session", temp_file_named("webm", b"0123456789"));

        let (headers, _) = get(server.port, &server.media_url_path("session"), None);
        assert!(headers.contains("video/webm"), "{headers}");
    }

    #[test]
    fn each_server_gets_its_own_port_and_token() {
        let a = start().expect("first server");
        let b = start().expect("second server");
        assert_ne!(a.port, b.port);
        assert_ne!(a.token, b.token);
    }

    #[test]
    fn media_is_served_whole_and_in_ranges() {
        let server = start().expect("server starts");
        let path = temp_file(b"0123456789");
        server.register("session", path.clone());

        let (headers, body) = get(server.port, &server.media_url_path("session"), None);
        assert!(headers.starts_with("HTTP/1.1 200"), "{headers}");
        assert!(headers.contains("video/mp4"), "{headers}");
        // Without this the player has no reason to believe seeking will work.
        assert!(headers.contains("Accept-Ranges: bytes"), "{headers}");
        assert_eq!(body, b"0123456789");

        for (range, status, expected, content_range) in [
            ("bytes=2-5", 206, &b"2345"[..], "bytes 2-5/10"),
            ("bytes=8-", 206, &b"89"[..], "bytes 8-9/10"),
            // An open-ended request past the end must still be clamped.
            ("bytes=5-999", 206, &b"56789"[..], "bytes 5-9/10"),
            // Players read a trailing MP4 index with a suffix range.
            ("bytes=-3", 206, &b"789"[..], "bytes 7-9/10"),
        ] {
            let (headers, body) = get(server.port, &server.media_url_path("session"), Some(range));
            assert!(
                headers.starts_with(&format!("HTTP/1.1 {status}")),
                "{range}: {headers}"
            );
            assert!(headers.contains(content_range), "{range}: {headers}");
            assert_eq!(body, expected, "{range}");
        }

        std::fs::remove_file(path).ok();
    }

    /// tiny_http sends anything over 32 KB chunked by default, and a chunked
    /// response has no `Content-Length`. Without one the player cannot tell how
    /// long the video is or ask for a range, so it shows a live-stream UI with
    /// no seek bar — which is the whole point of serving the file over http.
    #[test]
    fn a_large_file_is_sent_with_a_content_length_not_chunked() {
        let server = start().expect("server starts");
        let contents = vec![b'x'; 200_000];
        let path = temp_file(&contents);
        server.register("session", path.clone());

        let (headers, body) = get(server.port, &server.media_url_path("session"), None);
        assert!(
            headers.contains("Content-Length: 200000"),
            "no Content-Length: {headers}"
        );
        assert!(
            !headers.to_lowercase().contains("chunked"),
            "chunked: {headers}"
        );
        assert_eq!(body.len(), contents.len());

        std::fs::remove_file(path).ok();
    }

    #[test]
    fn a_range_past_the_end_is_refused_rather_than_answered_with_the_whole_file() {
        let server = start().expect("server starts");
        let path = temp_file(b"0123456789");
        server.register("session", path.clone());

        let (headers, _) = get(
            server.port,
            &server.media_url_path("session"),
            Some("bytes=50-60"),
        );
        assert!(headers.starts_with("HTTP/1.1 416"), "{headers}");
        assert!(headers.contains("bytes */10"), "{headers}");

        std::fs::remove_file(path).ok();
    }

    #[test]
    fn media_needs_the_token_and_a_registered_session() {
        let server = start().expect("server starts");
        let path = temp_file(b"0123456789");
        server.register("session", path.clone());

        for url in [
            "/media/wrong-token/session".to_string(),
            format!("/media/{}/unknown", server.token),
        ] {
            let (headers, _) = get(server.port, &url, None);
            assert!(headers.starts_with("HTTP/1.1 404"), "{url}: {headers}");
        }

        // Sessions stop being readable the moment they are cleaned up.
        server.unregister("session");
        let (headers, _) = get(server.port, &server.media_url_path("session"), None);
        assert!(headers.starts_with("HTTP/1.1 404"), "{headers}");

        std::fs::remove_file(path).ok();
    }

    impl PlayerServer {
        fn media_url_path(&self, session_id: &str) -> String {
            format!("/media/{}/{}", self.token, session_id)
        }
    }
}
