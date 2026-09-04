import { rm } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const buildArtifacts = ["dist", "target", "src-tauri/target", "target-ios"];

await Promise.all(
	buildArtifacts.map(async (artifact) => {
		await rm(new URL(artifact, projectRoot), {
			recursive: true,
			force: true,
		});
		console.log(`Removed ${artifact}`);
	}),
);
