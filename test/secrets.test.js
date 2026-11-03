import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SKIP = new Set(["node_modules", ".git", "assets", ".wrangler"]);
const TEXT = /\.(js|mjs|json|md|toml|html|css|example|txt)$/;

async function filesUnder(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await filesUnder(path, out);
    else if (TEXT.test(entry.name) || entry.name === ".dev.vars" || entry.name.startsWith(".env")) out.push(path);
  }
  return out;
}

test("the tree has no API key material and no real gateway secret", async () => {
  const files = await filesUnder(fileURLToPath(new URL("..", import.meta.url)));
  assert.equal(files.some((path) => path.endsWith(".dev.vars") || path.endsWith(".env")), false);
  const hits = [];
  for (const path of files) {
    const text = await readFile(path, "utf8");
    if (/sk-[A-Za-z0-9]{12,}/.test(text) || /AKIA[0-9A-Z]{16}/.test(text)) hits.push(path);
    const assigned = text.match(/DEEPSEEK_API_KEY\s*=\s*["']?([^\s#"']*)/g) || [];
    for (const item of assigned) {
      const value = item.split("=")[1]?.replace(/^["']|["']$/g, "").trim();
      if (value) hits.push(`${path} (${item})`);
    }
  }
  assert.deepEqual(hits, []);
});
