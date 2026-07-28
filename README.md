<div align="center">

# FreeTubium

**A fast, modern desktop app for downloading video and audio from YouTube and ~1800 other sites.**

Built on [Tauri 2](https://tauri.app) with a React front end and [yt-dlp](https://github.com/yt-dlp/yt-dlp) + [ffmpeg](https://ffmpeg.org) bundled in — no Python, no command line, no separate installs.

[![CI](https://github.com/TheEvalon/FreeTubium/actions/workflows/ci.yml/badge.svg)](https://github.com/TheEvalon/FreeTubium/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## What it is

FreeTubium is a desktop front end for `yt-dlp`. Paste a link and it fetches the
metadata, shows you the formats that link actually offers, and downloads it with
a live progress bar. Everything runs locally: there is no server, no account,
and no telemetry. Because the download engine is `yt-dlp`, anything it supports
works here too — YouTube videos and playlists, Vimeo, Twitch, SoundCloud, and
roughly 1800 other sites.

The whole app is a ~10 MB native binary that starts instantly and uses the
operating system's own webview instead of shipping a browser.

## Features

**Downloading**
- Paste a URL and get title, channel, duration, view count, thumbnail, and an estimated file size before committing
- Quality picker built from the formats the video *really* has — Best, 8K, 4K, 1440p, 1080p, 720p, 480p
- Choose the output container: MP4, MKV, or WebM
- Audio-only extraction to MP3, M4A, or Opus, with a bitrate choice
- Subtitles: download as separate files and/or embed them, with language patterns
- Embed thumbnail as cover art and write metadata into the file's tags

**Playlists**
- Full playlist analysis in one pass, with every entry listed
- Per-item checkboxes, select-all / clear / invert, and shift-click range selection
- Playlist numbering preserved in filenames
- One bulk quality/format choice applied to the whole selection

**Queue & history**
- Configurable concurrency (1–10 simultaneous downloads)
- Live progress, transfer speed, and ETA per download
- Pause, resume, cancel, and retry — pausing resumes from the partial file instead of starting over
- Optional per-download speed limit
- Searchable history that survives restarts, with re-download and reveal-in-folder

**Comfort**
- Dark and light themes
- Optional clipboard watcher that offers to analyze links as you copy them
- Custom output folder and `yt-dlp` filename templates
- Shows the bundled `yt-dlp` version, with a one-click self-update when a site changes and breaks extraction

## Screenshots

### Analyze a link
Paste a URL and pick exactly what you want before downloading.

![FreeTubium home screen showing an analyzed video with quality and container pickers](docs/screenshots/home.png)

### Download queue
Live progress, speed, and ETA, with pause and cancel per item.

![FreeTubium download queue showing downloads in progress with progress bars, speeds and ETAs](docs/screenshots/queue.png)

### Playlist selection
Pick individual entries, or grab the whole playlist at once.

![FreeTubium playlist picker listing playlist entries with checkboxes, thumbnails and durations](docs/screenshots/playlist.png)

### Settings
Output folder, filename template, defaults, concurrency, and the bundled engine.

![FreeTubium settings screen showing performance options, theme toggle and the bundled yt-dlp version](docs/screenshots/settings.png)

## Supported platforms

| Platform | Requirement | Installer |
| --- | --- | --- |
| Windows 10 / 11 (x64) | WebView2 (preinstalled on Windows 11 and current Windows 10) | `.exe` (NSIS) or `.msi` |
| macOS 11+ (Apple Silicon & Intel) | none | `.dmg` |
| Linux (x64) | `webkit2gtk-4.1` | `.AppImage` or `.deb` |

## Install

Grab the installer for your platform from the
[Releases page](https://github.com/TheEvalon/FreeTubium/releases) and run it.

- **Windows** — run the `.exe` (or `.msi`) and follow the installer.
- **macOS** — open the `.dmg` and drag FreeTubium to Applications.
- **Linux** — `chmod +x` the `.AppImage` and run it, or install the `.deb` with
  `sudo apt install ./FreeTubium_*.deb`.

### A note on the security warnings

The release builds are **not code-signed**, because certificates cost money and
this is a free project. Your operating system will therefore warn you the first
time you launch it:

- **Windows SmartScreen** shows "Windows protected your PC". Click
  **More info → Run anyway**.
- **macOS Gatekeeper** says the app "cannot be opened because the developer
  cannot be verified". Right-click the app → **Open**, then confirm; or run
  `xattr -dr com.apple.quarantine /Applications/FreeTubium.app`.

Nothing is wrong with the download — the OS simply cannot tell who built it. If
you would rather not trust a prebuilt binary, build it yourself from source with
the steps below.

## Development

### Prerequisites

- **Node.js 20+** and npm
- **Rust** (stable) via [rustup](https://rustup.rs)
- Platform build dependencies:
  - **Windows** — [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload, plus [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (already present on Windows 10/11)
  - **macOS** — Xcode Command Line Tools (`xcode-select --install`)
  - **Linux** — the WebKitGTK and related packages:
    ```bash
    sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
      libgtk-3-dev libxdo-dev libssl-dev build-essential patchelf file wget
    ```

See the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/) if
something is missing.

### Run it

```bash
git clone https://github.com/TheEvalon/FreeTubium.git
cd FreeTubium

npm install            # JS dependencies
npm run fetch-binaries # download the yt-dlp + ffmpeg sidecars for your platform
npm run tauri dev      # start the app (first Rust build takes a few minutes)
```

`npm run fetch-binaries` is required before the first build — `tauri-build`
verifies the sidecars exist at compile time and will fail without them.

### Build installers

```bash
npm run tauri build
```

Bundles land in `src-tauri/target/release/bundle/`.

### Other useful commands

| Command | What it does |
| --- | --- |
| `npm run build` | Typecheck (`tsc`) and build the front end |
| `npm run dev` | Vite dev server alone, without the Tauri shell |
| `npm run fetch-binaries -- --force` | Re-download the sidecars (e.g. to update `yt-dlp`) |
| `cargo fmt` / `cargo clippy --all-targets` | Format and lint the Rust core (run inside `src-tauri/`) |

## How the sidecars work

FreeTubium does not require you to install `yt-dlp` or `ffmpeg`; it ships them as
Tauri **sidecars** — external executables bundled next to the app binary.

`scripts/fetch-binaries.mjs` downloads the right build for your machine and names
it with your Rust host target triple, which is the convention Tauri expects:

```
src-tauri/binaries/
  yt-dlp-x86_64-pc-windows-msvc.exe
  ffmpeg-x86_64-pc-windows-msvc.exe
```

They are listed under `bundle.externalBin` in `src-tauri/tauri.conf.json`, so
Tauri copies them next to the executable during builds (and into the target
directory during `tauri dev`), stripping the triple from the name. At runtime the
Rust core spawns `yt-dlp` through the shell plugin and passes it
`--ffmpeg-location` pointing at the bundled `ffmpeg`, so merging and audio
conversion never depend on anything installed system-wide.

The binaries are deliberately **not** committed to git — they are large and
platform-specific, so `src-tauri/binaries/` is in `.gitignore` and CI fetches
them on every run.

Because `yt-dlp` needs regular updates to keep up with site changes, Settings has
a **Update yt-dlp** button that runs the bundled binary's own self-update.

## Architecture

```
React UI  ──invoke──▶  Rust core  ──spawn──▶  yt-dlp  ──▶  ffmpeg
    ◀────── events ─────── (progress / done / error)
```

- **`src/`** — React front end. `src/lib/api.ts` is the single typed contract for
  every command and event; UI code never calls `invoke` directly.
- **`src-tauri/src/`** — the Rust core:
  - `analyze.rs` — metadata via `yt-dlp -J`
  - `downloads.rs` — the download queue, concurrency, progress parsing, cancellation
  - `store.rs` — settings and history persisted as JSON in the app config directory
  - `ytdlp.rs` — sidecar plumbing

Progress is parsed from `yt-dlp`'s stdout using a custom `--progress-template` and
streamed to the UI as Tauri events.

### Tech stack

| Layer | Choice |
| --- | --- |
| Shell | Tauri 2 (Rust) |
| UI | React 18 + TypeScript |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 |
| Animation | Framer Motion |
| Icons | Lucide |
| Download engine | yt-dlp + ffmpeg (bundled sidecars) |

## Legal & responsible use

FreeTubium is a front end for `yt-dlp`; it does not host, provide, or circumvent
access to any content.

**Only download content you have the right to download.** That means material
you own, content released under a permissive licence (Creative Commons, public
domain), or media you have the copyright holder's permission to save. Respect the
terms of service of the sites you use, and respect copyright law in your
jurisdiction — in many places downloading copyrighted material without
permission is illegal, and a site's terms may prohibit downloading regardless.

You are responsible for how you use this tool. The authors accept no liability
for misuse.

## Contributing

Issues and pull requests are welcome. Please make sure `npm run build` and
`cargo clippy --all-targets` both pass before opening a PR — CI runs both.

## License

[MIT](LICENSE) © FreeTubium contributors.

`yt-dlp` (Unlicense) and `ffmpeg` (GPL/LGPL) are bundled as separate,
unmodified executables and remain under their own licences.
