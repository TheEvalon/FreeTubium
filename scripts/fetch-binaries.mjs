/**
 * Downloads platform-specific yt-dlp and ffmpeg binaries into src-tauri/binaries/
 * using the Tauri sidecar target-triple naming convention, e.g.
 *   src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe
 *   src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe
 *
 * Usage: node scripts/fetch-binaries.mjs [--force]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FORCE = process.argv.includes("--force");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN_DIR = path.join(ROOT, "src-tauri", "binaries");
const IS_WINDOWS = process.platform === "win32";
const EXE = IS_WINDOWS ? ".exe" : "";

const ATTEMPTS_PER_URL = 3;
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

function detectTargetTriple() {
  // Prefer rustc's host triple so it always matches what Tauri expects.
  try {
    const out = execSync("rustc -vV", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const m = out.match(/host:\s*(\S+)/);
    if (m) return m[1];
  } catch {
    /* rustc not on PATH; fall back to node's platform/arch */
  }
  const arch = { x64: "x86_64", arm64: "aarch64" }[process.arch];
  const platform = {
    win32: "pc-windows-msvc",
    darwin: "apple-darwin",
    linux: "unknown-linux-gnu",
  }[process.platform];
  if (!arch || !platform) {
    throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`);
  }
  return `${arch}-${platform}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A 404 means the URL is wrong, so retrying it only wastes time; 408/429 are worth another go. */
function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function downloadOnce(url, dest) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.retryable = isRetryableStatus(res.status);
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`  saved ${dest} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}

/**
 * Downloads with exponential backoff. These hosts are third-party and go down
 * or throttle without warning, which otherwise fails CI and release builds on
 * a step that has nothing to do with the change being built.
 */
async function download(url, dest, attempts = ATTEMPTS_PER_URL) {
  for (let attempt = 1; ; attempt++) {
    console.log(`  downloading ${url}${attempt > 1 ? ` (attempt ${attempt}/${attempts})` : ""}`);
    try {
      await downloadOnce(url, dest);
      return;
    } catch (err) {
      fs.rmSync(dest, { force: true });
      if (attempt >= attempts || err.retryable === false) throw err;
      const delay = 2 ** (attempt - 1) * 3000;
      console.log(`  failed: ${err.message}; retrying in ${delay / 1000}s`);
      await sleep(delay);
    }
  }
}

/** Tries each URL in turn, so one host being down does not break the build. */
async function downloadFromFirstWorking(urls, dest) {
  const failures = [];
  for (const url of urls) {
    try {
      await download(url, dest);
      return;
    } catch (err) {
      console.log(`  giving up on ${url}: ${err.message}`);
      failures.push(`${url}: ${err.message}`);
    }
  }
  throw new Error(`All download sources failed:\n  ${failures.join("\n  ")}`);
}

/** Extract an archive (.zip / .tar.xz) using the system `tar` (bsdtar handles zip on Windows/macOS). */
function extract(archive, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execSync(`tar -xf "${archive}" -C "${destDir}"`, { stdio: "inherit" });
}

/** Recursively find a file by name inside dir. */
function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

function ytDlpAssetUrl() {
  const base = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
  if (process.platform === "win32") return `${base}/yt-dlp.exe`;
  if (process.platform === "darwin") return `${base}/yt-dlp_macos`;
  if (process.platform === "linux") {
    return process.arch === "arm64"
      ? `${base}/yt-dlp_linux_aarch64`
      : `${base}/yt-dlp_linux`;
  }
  throw new Error(`Unsupported platform for yt-dlp: ${process.platform}`);
}

async function fetchYtDlp(triple) {
  const dest = path.join(BIN_DIR, `yt-dlp-${triple}${EXE}`);
  if (fs.existsSync(dest) && !FORCE) {
    console.log(`yt-dlp: ${dest} already exists, skipping (use --force to re-download)`);
    return;
  }
  console.log("yt-dlp:");
  await download(ytDlpAssetUrl(), dest);
  if (!IS_WINDOWS) fs.chmodSync(dest, 0o755);
}

/**
 * Candidate ffmpeg archives for this host, in preference order. All entries for
 * a platform must share one archive format so the extractor stays simple.
 */
function ffmpegSources() {
  const btbn = (flavor) =>
    `https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-${flavor}-gpl`;

  if (process.platform === "win32") {
    const flavor = process.arch === "arm64" ? "winarm64" : "win64";
    return { urls: [`${btbn(flavor)}.zip`], archiveName: "ffmpeg-archive.zip" };
  }

  if (process.platform === "darwin") {
    // Universal-enough static build (x86_64; runs under Rosetta on Apple Silicon).
    return {
      urls: ["https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip"],
      archiveName: "ffmpeg-archive.zip",
    };
  }

  if (process.platform === "linux") {
    // johnvansickle's builds are fully static (no glibc dependency), which is
    // what we want in the .deb/.AppImage, but the host is frequently
    // unreachable -- so fall back to the GitHub-hosted BtbN build.
    const arch = process.arch === "arm64" ? "arm64" : "amd64";
    const flavor = process.arch === "arm64" ? "linuxarm64" : "linux64";
    return {
      urls: [
        `https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${arch}-static.tar.xz`,
        `${btbn(flavor)}.tar.xz`,
      ],
      archiveName: "ffmpeg-archive.tar.xz",
    };
  }

  throw new Error(`Unsupported platform for ffmpeg: ${process.platform}`);
}

async function fetchFfmpeg(triple) {
  const dest = path.join(BIN_DIR, `ffmpeg-${triple}${EXE}`);
  if (fs.existsSync(dest) && !FORCE) {
    console.log(`ffmpeg: ${dest} already exists, skipping (use --force to re-download)`);
    return;
  }
  console.log("ffmpeg:");

  const { urls, archiveName } = ffmpegSources();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "freetubium-ffmpeg-"));
  try {
    const archivePath = path.join(tmp, archiveName);
    await downloadFromFirstWorking(urls, archivePath);

    console.log("  extracting...");
    const extractDir = path.join(tmp, "extracted");
    extract(archivePath, extractDir);

    const binary = findFile(extractDir, `ffmpeg${EXE}`);
    if (!binary) throw new Error("ffmpeg binary not found inside downloaded archive");
    fs.copyFileSync(binary, dest);
    if (!IS_WINDOWS) fs.chmodSync(dest, 0o755);
    console.log(`  saved ${dest}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const triple = detectTargetTriple();
console.log(`Target triple: ${triple}`);
fs.mkdirSync(BIN_DIR, { recursive: true });

await fetchYtDlp(triple);
await fetchFfmpeg(triple);

console.log("Done. Binaries are in src-tauri/binaries/");
