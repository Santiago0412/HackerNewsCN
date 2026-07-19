import test from "node:test";
import assert from "node:assert/strict";
import { cacheKey, TranslationCache } from "../src/lib/cache.js";

class MemoryStorage {
  constructor() { this.data = {}; }
  async get(key) {
    if (key === null) return structuredClone(this.data);
    if (typeof key === "string") return key in this.data ? { [key]: structuredClone(this.data[key]) } : {};
    return {};
  }
  async set(values) { Object.assign(this.data, structuredClone(values)); }
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key]; }
}

test("cache key changes with provider, model, prompt or text", async () => {
  const base = { text: "Hello", provider: "openai", model: "small", promptVersion: "v1" };
  const first = await cacheKey(base);
  assert.equal(first, await cacheKey(base));
  for (const changed of [
    { ...base, text: "World" }, { ...base, provider: "deepseek" },
    { ...base, model: "large" }, { ...base, promptVersion: "v2" }
  ]) assert.notEqual(first, await cacheKey(changed));
});

test("cache reads, expires and removes stale entries", async () => {
  let now = 1000;
  const storage = new MemoryStorage();
  const cache = new TranslationCache(storage, { now: () => now });
  await cache.set("translation:a", "你好");
  assert.equal(await cache.get("translation:a", 1), "你好");
  now += 86400001;
  assert.equal(await cache.get("translation:a", 1), null);
  assert.deepEqual(await storage.get(null), {});
});

test("cache prunes least recently used entries", async () => {
  let now = 1;
  const storage = new MemoryStorage();
  const cache = new TranslationCache(storage, { now: () => now++ });
  await cache.set("translation:a", "A");
  await cache.set("translation:b", "B");
  await cache.set("translation:c", "C");
  await cache.get("translation:a", 30);
  assert.equal(await cache.prune(2), 1);
  const all = await storage.get(null);
  assert.ok(all["translation:a"]);
  assert.ok(!all["translation:b"]);
  assert.ok(all["translation:c"]);
});
