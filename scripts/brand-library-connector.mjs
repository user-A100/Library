import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const buildRoots = [
  path.join(root, "connector", "library-connector", "build", "browserExt"),
  path.join(root, "connector", "library-connector", "build", "manifestv3"),
  path.join(root, "connector", "library-connector", "build", "firefox"),
];

function brandMessage(value) {
  return value
    .replaceAll("Zotero Connector", "Library Connector")
    .replaceAll("Zotero", "Library")
    .replaceAll("zotero.org", "Library");
}

for (const buildRoot of buildRoots) {
  const localeRoot = path.join(buildRoot, "_locales");
  if (!fs.existsSync(localeRoot)) continue;
  for (const locale of fs.readdirSync(localeRoot)) {
    const file = path.join(localeRoot, locale, "messages.json");
    if (!fs.existsSync(file)) continue;
    const messages = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const entry of Object.values(messages)) {
      if (typeof entry?.message === "string") entry.message = brandMessage(entry.message);
    }
    fs.writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
  }
}

console.log("Library Connector user-facing locale branding applied.");
