import { readFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
if (manifest.manifest_version !== 3) throw new Error("manifest must use version 3");
const referenced = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.side_panel?.default_path,
  manifest.options_page,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action.default_icon || {}),
  ...manifest.content_scripts.flatMap((item) => [...item.js, ...item.css])
].filter(Boolean);
await Promise.all(referenced.map((path) => access(path)));

const files = [
  "src/background.js", "src/content.js", "src/options.js", "src/popup.js",
  "src/lib/cache.js", "src/lib/providers.js", "src/lib/settings.js", "src/lib/article.js"
];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${file} syntax error:\n${result.stderr}`);
}
console.log(`Extension check passed: ${referenced.length} referenced assets, ${files.length} JavaScript files.`);
