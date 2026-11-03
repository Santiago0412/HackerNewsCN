import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest, usageKey } from "../worker/src/gateway.js";
import { DAILY_CAP_CNY, estimateSpendCny, utcDay } from "../worker/src/pricing.js";

const INSTALL_ID = "123e4567-e89b-42d3-a456-426614174000";
const SECRET = "test-secret-not-a-real-key";

function memoryKv(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, String(value)); }
  };
}

function envWith(kv, extra = {}) {
  return { DEEPSEEK_API_KEY: SECRET, USAGE_KV: kv, ...extra };
}

function chatRequest({ origin, installId = INSTALL_ID, body = {} } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (origin) headers.Origin = origin;
  if (installId) headers["X-Install-Id"] = installId;
  headers.Authorization = "Bearer client-must-not-be-forwarded";
  return new Request("https://gateway.example/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "deepseek-v4-pro",
      stream: true,
      tools: [{ type: "function", function: { name: "search" } }],
      messages: [{ role: "user", content: "Hello" }],
      ...body
    })
  });
}

test("daily cap constant and peak flash estimate stay explicit", () => {
  assert.equal(DAILY_CAP_CNY, 0.10);
  assert.equal(estimateSpendCny({ prompt_cache_miss_tokens: 1_000_000, completion_tokens: 0 }), 2);
  assert.equal(estimateSpendCny({ prompt_cache_hit_tokens: 1_000_000, completion_tokens: 0 }), 0.04);
  assert.equal(estimateSpendCny({ prompt_cache_miss_tokens: 50_000 }), 0.10);
  assert.equal(estimateSpendCny({ completion_tokens: 12_500 }), 0.10);
});

test("health and extension preflight do not require a key", async () => {
  const health = await handleRequest(new Request("https://gateway.example/health"), {});
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: "hncn-gateway" });
  const preflight = await handleRequest(new Request("https://gateway.example/v1/chat/completions", {
    method: "OPTIONS",
    headers: { Origin: "chrome-extension://abcdefghijklmnop" }
  }), {});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "chrome-extension://abcdefghijklmnop");
});

test("rejects missing install ids and website origins", async () => {
  const kv = memoryKv();
  const missing = await handleRequest(chatRequest({ installId: "" }), envWith(kv), async () => { throw new Error("upstream should not be called"); });
  assert.equal(missing.status, 401);
  const website = await handleRequest(chatRequest({ origin: "https://evil.example" }), envWith(kv), async () => { throw new Error("upstream should not be called"); });
  assert.equal(website.status, 403);
  const browserPreflight = await handleRequest(new Request("https://gateway.example/v1/chat/completions", {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example" }
  }), {});
  assert.equal(browserPreflight.status, 403);
});

test("proxies flash chat completions, injects the server key, and records spend", async () => {
  const kv = memoryKv();
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({
      choices: [{ message: { content: "你好" } }],
      usage: { prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 1000, prompt_tokens: 1000, completion_tokens: 1000 }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const response = await handleRequest(chatRequest({ origin: "chrome-extension://abcdefghijklmnop" }), envWith(kv, {
    DEEPSEEK_API_URL: "https://evil.example/steal"
  }), fetchImpl);
  assert.equal(response.status, 200);
  assert.equal(captured.url, "https://api.deepseek.com/chat/completions");
  assert.equal(captured.options.headers.Authorization, `Bearer ${SECRET}`);
  assert.equal(captured.options.headers["X-Install-Id"], undefined);
  const outbound = JSON.parse(captured.options.body);
  assert.equal(outbound.model, "deepseek-v4-flash");
  assert.equal(outbound.stream, false);
  assert.equal(outbound.tools, undefined);
  assert.equal(outbound.messages[0].content, "Hello");
  const text = await response.text();
  assert.equal(text.includes(SECRET), false);
  assert.equal(response.headers.get("X-Quota-Limit-Cny"), "0.10");
  const stored = JSON.parse(kv.map.get(usageKey(INSTALL_ID, utcDay())));
  assert.equal(stored.spendCny, 0.01);
  assert.equal(stored.requests, 1);
  assert.equal(stored.promptTokens, 1000);
  assert.equal(stored.completionTokens, 1000);
});

test("returns 429 when the UTC-day spend is already at the cap", async () => {
  const kv = memoryKv({
    [usageKey(INSTALL_ID, utcDay())]: JSON.stringify({ spendCny: DAILY_CAP_CNY, requests: 2, promptTokens: 10, completionTokens: 10 })
  });
  let called = false;
  const response = await handleRequest(chatRequest(), envWith(kv), async () => { called = true; return new Response("{}"); });
  assert.equal(called, false);
  assert.equal(response.status, 429);
  const payload = await response.json();
  assert.equal(payload.error.code, "daily_quota_exceeded");
  assert.equal(payload.error.dailyCapCny, 0.10);
  assert.match(payload.error.message, /¥0\.10/);
});

test("does not call DeepSeek when the gateway secret or KV binding is missing", async () => {
  const response = await handleRequest(chatRequest(), { USAGE_KV: memoryKv() }, async () => { throw new Error("upstream should not be called"); });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.type, "gateway_unconfigured");
  assert.equal(JSON.stringify(body).includes("sk-"), false);
});
