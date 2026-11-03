import test from "node:test";
import assert from "node:assert/strict";
import { ensureInstallId, isInstallId } from "../src/lib/install-id.js";

test("install id is created once and stored locally", async () => {
  const mem = {};
  const storage = {
    async get(key) { return { [key]: mem[key] }; },
    async set(value) { Object.assign(mem, value); }
  };
  const first = await ensureInstallId(storage);
  const second = await ensureInstallId(storage);
  assert.equal(first, second);
  assert.equal(isInstallId(first), true);
  assert.equal(isInstallId("not-a-uuid"), false);
  assert.equal(isInstallId(""), false);
});
