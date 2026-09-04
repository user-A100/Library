import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
	"src-tauri/tauri.ios.conf.json",
	"src-tauri/Info.ios.plist",
	"src-tauri/ios-project.yml",
	"src-tauri/icons/ios/AppIcon-512@2x.png",
];
const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length > 0) {
	console.error(`Missing iOS release files: ${missing.join(", ")}`);
	process.exit(1);
}

const iosConfig = JSON.parse(
	readFileSync("src-tauri/tauri.ios.conf.json", "utf8"),
);
const minimumVersion = iosConfig.bundle?.iOS?.minimumSystemVersion;
if (!minimumVersion || Number(minimumVersion) < 15) {
	console.error("iOS minimumSystemVersion must be 15.0 or newer");
	process.exit(1);
}

const plist = readFileSync("src-tauri/Info.ios.plist", "utf8");
if (
	!plist.includes("NSCameraUsageDescription") ||
	!plist.includes("scan a pairing QR code")
) {
	console.error(
		"Info.ios.plist must declare NSCameraUsageDescription for QR pairing",
	);
	process.exit(1);
}

const template = readFileSync("src-tauri/ios-project.yml", "utf8");
if (
	!template.includes("NSCameraUsageDescription") ||
	!template.includes("Assets.xcassets")
) {
	console.error(
		"iOS project template must include camera disclosure and app icon assets",
	);
	process.exit(1);
}

const tauriConfig = JSON.parse(
	readFileSync("src-tauri/tauri.conf.json", "utf8"),
);
if (!tauriConfig.bundle?.icon?.includes("icons/ios/AppIcon-512@2x.png")) {
	console.error(
		"tauri.conf.json must include the iOS 1024px Agentero app icon",
	);
	process.exit(1);
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+/.test(packageJson.version)) {
	console.error("package.json must use a semantic release version");
	process.exit(1);
}

console.log(
	`iOS release preflight passed for Agentero ${packageJson.version} (minimum iOS ${minimumVersion}).`,
);
