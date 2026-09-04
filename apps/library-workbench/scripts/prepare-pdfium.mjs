/**
 * Stage the platform PDFium shared library into src-tauri/pdfium/ so Tauri can
 * bundle it (macOS `bundle.macOS.frameworks`, Windows/Linux `bundle.resources`).
 *
 * liteparse dlopens PDFium at runtime. Its build script bakes an absolute path
 * into the binary that only exists on the build machine, so a packaged app on a
 * user machine finds nothing and panics. See docs/backend/paper-import.md.
 *
 * PDFIUM_RELEASE_TAG must match liteparse-pdfium-sys's build.rs — bump it when
 * upgrading the `liteparse` dependency in src-tauri/Cargo.toml.
 *
 * Usage:
 *   node scripts/prepare-pdfium.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PDFIUM_RELEASE_TAG = "chromium/7897";
const PDFIUM_RELEASE_URL =
	"https://github.com/run-llama/pdfium-binaries/releases/download";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "src-tauri", "pdfium");

fs.mkdirSync(outDir, { recursive: true });

function hostTriple() {
	try {
		return execFileSync("rustc", ["--print", "host-tuple"], {
			encoding: "utf8",
		}).trim();
	} catch {
		const out = execFileSync("rustc", ["-Vv"], { encoding: "utf8" });
		const line = out.split("\n").find((l) => l.startsWith("host:"));
		if (!line) throw new Error("could not determine host triple");
		return line.split(/\s+/)[1];
	}
}

const triple = process.env.TAURI_ENV_TARGET_TRIPLE || hostTriple();
const tauriPlatform = process.env.TAURI_ENV_PLATFORM || "";

// Mobile parses PDFs on the paired desktop Host; src-tauri/Cargo.toml gates
// liteparse out of iOS/Android builds entirely.
if (
	tauriPlatform === "android" ||
	tauriPlatform === "ios" ||
	/-android|-ios\b/.test(triple)
) {
	console.log(
		`[prepare-pdfium] mobile (${tauriPlatform || triple}): nothing to stage`,
	);
	process.exit(0);
}

/** Mirrors `pdfium_asset_stem` in liteparse-pdfium-sys/build.rs. */
const ASSETS = {
	"aarch64-apple-darwin": "pdfium-mac-arm64",
	"x86_64-apple-darwin": "pdfium-mac-x64",
	"x86_64-unknown-linux-gnu": "pdfium-linux-x64",
	"x86_64-unknown-linux-musl": "pdfium-linux-musl-x64",
	"aarch64-unknown-linux-gnu": "pdfium-linux-arm64",
	"aarch64-unknown-linux-musl": "pdfium-linux-arm64",
	"armv7-unknown-linux-gnueabihf": "pdfium-linux-arm",
	"x86_64-pc-windows-msvc": "pdfium-win-x64",
	"x86_64-pc-windows-gnu": "pdfium-win-x64",
	"aarch64-pc-windows-msvc": "pdfium-win-arm64",
	"i686-pc-windows-msvc": "pdfium-win-x86",
	"i686-pc-windows-gnu": "pdfium-win-x86",
};

const asset = ASSETS[triple];
if (!asset) {
	console.error(`[prepare-pdfium] unsupported target: ${triple}`);
	process.exit(1);
}

const isWin = triple.includes("windows");
const isMac = triple.includes("apple-darwin");
const libName = isWin
	? "pdfium.dll"
	: isMac
		? "libpdfium.dylib"
		: "libpdfium.so";
const dest = path.join(outDir, libName);

/** Mirrors `dirs_cache` in liteparse-pdfium-sys/build.rs. */
function cacheRoot() {
	if (process.env.XDG_CACHE_HOME) return process.env.XDG_CACHE_HOME;
	if (isWin) {
		return (
			process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local")
		);
	}
	return isMac
		? path.join(os.homedir(), "Library", "Caches")
		: path.join(os.homedir(), ".cache");
}

const cacheDir = path.join(
	cacheRoot(),
	"pdfium-rs",
	PDFIUM_RELEASE_TAG.replace("/", "_"),
	asset,
);
// pdfium-binaries puts the Windows DLL in bin/, the Unix shared library in lib/.
const cacheLibDir = path.join(cacheDir, isWin ? "bin" : "lib");

function candidateDirs() {
	const dirs = [];
	if (process.env.PDFIUM_LIB_PATH) dirs.push(process.env.PDFIUM_LIB_PATH);
	dirs.push(cacheLibDir);
	return dirs;
}

function findStaged() {
	for (const dir of candidateDirs()) {
		const candidate = path.join(dir, libName);
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}

async function download() {
	const tag = PDFIUM_RELEASE_TAG.replace("/", "%2F");
	const url = `${PDFIUM_RELEASE_URL}/${tag}/${asset}.tgz`;
	console.log(`[prepare-pdfium] GET ${url}`);
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`download failed: ${response.status} ${url}`);
	}
	const tmp = `${cacheDir}.tmp`;
	fs.rmSync(tmp, { recursive: true, force: true });
	fs.mkdirSync(tmp, { recursive: true });
	const archive = path.join(tmp, "pdfium.tgz");
	fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
	execFileSync("tar", ["-xzf", archive, "-C", tmp], { stdio: "inherit" });
	fs.rmSync(archive, { force: true });
	fs.rmSync(cacheDir, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
	fs.renameSync(tmp, cacheDir);
	console.log(`[prepare-pdfium] cached at ${cacheDir}`);
}

let src = findStaged();
if (!src) {
	await download();
	src = findStaged();
}
if (!src) {
	console.error(`[prepare-pdfium] ${libName} not found after download`);
	process.exit(1);
}

// A truncated dylib would ship a broken installer, so refuse implausible sizes.
const size = fs.statSync(src).size;
if (size < 1024 * 1024) {
	console.error(`[prepare-pdfium] ${src} is only ${size} bytes; refusing`);
	process.exit(1);
}

fs.copyFileSync(src, dest);

// pdfium-binaries ships an install name of `./libpdfium.dylib`; codesign and
// @rpath resolution inside Contents/Frameworks need the @rpath form.
if (isMac) {
	try {
		execFileSync("install_name_tool", ["-id", "@rpath/libpdfium.dylib", dest]);
	} catch (error) {
		console.warn(`[prepare-pdfium] install_name_tool failed: ${error}`);
	}
}

console.log(`[prepare-pdfium] ${src} → ${dest} (${size} bytes)`);
