/**
 * Fails if any checked text file is not plain UTF-8: a UTF-16/UTF-32 byte order
 * mark, a stray NUL byte, a UTF-8 BOM, or an invalid UTF-8 sequence.
 *
 * Windows PowerShell 5.1 writes UTF-16LE by default (`>`, `>>`, `Out-File`,
 * `Set-Content`), which is how scripts/fetch-binaries.mjs and the v0.1.0 release
 * notes both ended up NUL-interleaved. Consumers vary in how they cope: Git and
 * the GitHub web UI mostly hide it, while the GitHub mobile app renders the NULs
 * and the text looks like gibberish.
 *
 * Usage:
 *   node scripts/check-encoding.mjs           # every tracked text file
 *   node scripts/check-encoding.mjs FILE...   # only the given files
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".icns",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".zip",
  ".gz",
  ".xz",
  ".pdf",
]);

function trackedTextFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], { encoding: "buffer" });
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((file) => !BINARY_EXTENSIONS.has(path.extname(file).toLowerCase()));
}

/** @returns {string|null} a description of the problem, or null when the file is clean UTF-8. */
function inspect(file) {
  const buf = fs.readFileSync(file);

  if (buf.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) return "UTF-16LE byte order mark";
  if (buf.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) return "UTF-16BE byte order mark";
  if (buf.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) return "UTF-8 byte order mark";

  const nul = buf.indexOf(0);
  if (nul !== -1) {
    // UTF-16LE without a BOM: ASCII text becomes "T\0e\0x\0t\0".
    const looksUtf16 = buf.length > 1 && buf[1] === 0 && buf[0] !== 0;
    const hint = looksUtf16 ? " (looks like BOM-less UTF-16LE)" : "";
    return `NUL byte at offset ${nul}${hint}`;
  }

  // TextDecoder with fatal:true is the only strict UTF-8 validator in core Node.
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return "not valid UTF-8";
  }

  return null;
}

const files = process.argv.slice(2);
const targets = files.length > 0 ? files : trackedTextFiles();

const problems = [];
for (const file of targets) {
  const problem = inspect(file);
  if (problem) problems.push(`${file}: ${problem}`);
}

if (problems.length > 0) {
  console.error(`Encoding check failed for ${problems.length} file(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("\nRe-save these as UTF-8 without a BOM. In PowerShell, prefer");
  console.error("`Set-Content -Encoding utf8NoBOM` (pwsh 7+) over `>` or `Out-File`.");
  process.exit(1);
}

console.log(`Encoding check passed (${targets.length} file(s) are plain UTF-8).`);
