#!/usr/bin/env node
// Usage: node scripts/release-downloads.mjs [--assets]
// Requires GitHub CLI (`gh`) with auth.
// Excludes CLI assets, signatures/checksums, and latest.json.

import { execFileSync } from "node:child_process";

const REPO = "poco-ai/Agentero";
const showAssets = process.argv.includes("--assets");

const releases = JSON.parse(
	execFileSync("gh", ["api", `repos/${REPO}/releases`, "--paginate"], {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	}),
);

if (releases.length === 0) {
	console.log("No releases found.");
	process.exit(0);
}

const EXCLUDE = /(^agentero-cli-|\.sig$|\.sha256$|^latest\.json$)/i;

function platformOf(name) {
	const n = name.toLowerCase();
	if (n.endsWith(".dmg") || n.endsWith(".app.tar.gz") || n.endsWith(".ipa"))
		return "Apple";
	if (n.endsWith(".exe") || n.endsWith(".msi")) return "Windows";
	return "Other";
}

const PLATFORMS = ["Apple", "Windows", "Other"];
const rows = [];

for (const rel of releases) {
	const counts = Object.fromEntries(PLATFORMS.map((p) => [p, 0]));
	const kept = rel.assets.filter((a) => !EXCLUDE.test(a.name));
	for (const a of kept) counts[platformOf(a.name)] += a.download_count;
	rows.push({ tag: rel.tag_name, counts });

	if (showAssets) {
		console.log(`\n${rel.tag_name}`);
		for (const a of kept) {
			console.log(
				`  ${String(a.download_count).padStart(8)}  [${platformOf(a.name)}] ${a.name}`,
			);
		}
	}
}

const activePlatforms = PLATFORMS.filter((p) =>
	rows.some((r) => r.counts[p] > 0),
);

const tagW = Math.max(3, ...rows.map((r) => r.tag.length));
const colW = Math.max(9, ...activePlatforms.map((p) => p.length));

if (showAssets) console.log("");
console.log(
	[
		"Tag".padEnd(tagW),
		...activePlatforms.map((p) => p.padStart(colW)),
		"Total".padStart(colW),
	].join("  "),
);
const totals = Object.fromEntries(activePlatforms.map((p) => [p, 0]));
let grand = 0;
for (const r of rows) {
	const rowTotal = activePlatforms.reduce((s, p) => s + r.counts[p], 0);
	grand += rowTotal;
	for (const p of activePlatforms) totals[p] += r.counts[p];
	console.log(
		[
			r.tag.padEnd(tagW),
			...activePlatforms.map((p) => String(r.counts[p]).padStart(colW)),
			String(rowTotal).padStart(colW),
		].join("  "),
	);
}
console.log(
	[
		"Total".padEnd(tagW),
		...activePlatforms.map((p) => String(totals[p]).padStart(colW)),
		String(grand).padStart(colW),
	].join("  "),
);
