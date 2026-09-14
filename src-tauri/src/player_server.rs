//! Loopback HTTP server that hosts the YouTube embed.
//!
//! The embedded player needs an HTTP Referer or YouTube shows its blocked
//! playback screen (error 153), and the app window is served from a custom
//! `tauri://` scheme that cannot provide one. Serving the embed's host page
//! from `127.0.0.1` gives it a real http origin, and the app window drives it
//! over `postMessage`.
//!
//! The server answers exactly one path and binds to the loopback interface
//! only. The path includes a per-run random token so other local processes
//! cannot drive the player.

use std::sync::Mutex;
use std::thread;

use tiny_http::{Header, Response, Server};
use uuid::Uuid;

const PLAYER_HTML: &str = include_str!("player.html");

pub struct PlayerServerState(pub Mutex<Option<PlayerServer>>);

impl Default for PlayerServerState {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

#[derive(Clone)]
pub struct PlayerServer {
    pub port: u16,
    pub token: String,
}

impl PlayerServer {
    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}/player/{}", self.port, self.token)
    }
}

/// Binds the server on a free loopback port and serves the player page.
pub fn start() -> Result<PlayerServer, String> {
    let server =
        Server::http("127.0.0.1:0").map_err(|e| format!("cannot start the player server: {e}"))?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| "player server did not bind to an IP port".to_string())?
        .port();

    let token = Uuid::new_v4().to_string();
    let expected_path = format!("/player/{token}");

    thread::spawn(move || {
        let html = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
            .expect("static header");
        // YouTube needs a Referer; this policy sends the origin without the
        // token, which is both enough for YouTube and less than it could leak.
        let referrer = Header::from_bytes(
            &b"Referrer-Policy"[..],
            &b"strict-origin-when-cross-origin"[..],
        )
        .expect("static header");

        for request in server.incoming_requests() {
            if request.url() == expected_path {
                let response = Response::from_string(PLAYER_HTML)
                    .with_header(html.clone())
                    .with_header(referrer.clone());
                let _ = request.respond(response);
            } else {
                let _ = request.respond(Response::from_string("not found").with_status_code(404));
            }
        }
    });

    Ok(PlayerServer { port, token })
}

/// URL of the embed host page, starting the server on first use so a failure
/// only affects the Watch page rather than app startup.
#[tauri::command]
pub fn player_page_url(state: tauri::State<'_, PlayerServerState>) -> Result<String, String> {
    let mut guard = state.0.lock().unwrap();
    if guard.is_none() {
        *guard = Some(start()?);
    }
    Ok(guard.as_ref().expect("just started").url())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpStream;

    /// Raw request, so the test exercises the wire format the webview will see.
    fn get(port: u16, path: &str) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect");
        write!(
            stream,
            "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
        )
        .expect("write");
        let mut response = String::new();
        stream.read_to_string(&mut response).expect("read");
        response
    }

    #[test]
    fn serves_the_player_page_only_on_its_token_path() {
        let server = start().expect("server starts");

        let response = get(server.port, &format!("/player/{}", server.token));
        assert!(response.starts_with("HTTP/1.1 200"), "{response}");
        assert!(response.contains("text/html"));
        // The page is useless without the IFrame API and the host protocol.
        assert!(response.contains("youtube.com/iframe_api"));
        assert!(response.contains("freetubium-player"));

        // An unguessable path is the only thing keeping other local processes
        // from driving the player.
        for path in ["/", "/player/", "/player/wrong-token"] {
            let response = get(server.port, path);
            assert!(response.starts_with("HTTP/1.1 404"), "{path}: {response}");
        }
    }

    #[test]
    fn each_server_gets_its_own_port_and_token() {
        let a = start().expect("first server");
        let b = start().expect("second server");
        assert_ne!(a.port, b.port);
        assert_ne!(a.token, b.token);
    }
}
