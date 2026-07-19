import test from "node:test";
import assert from "node:assert/strict";
import { buildRequest, parseTranslations, translateBatch, translateBatchResilient } from "../src/lib/providers.js";

test("builds provider-specific request formats", () => {
  const common = { apiKey: "secret", model: "example" };
  const openai = buildRequest(["Hello"], { ...common, provider: "openai" });
  assert.equal(openai.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(openai.options.headers.Authorization, "Bearer secret");
  const anthropic = buildRequest(["Hello"], { ...common, provider: "anthropic" });
  assert.equal(anthropic.options.headers["x-api-key"], "secret");
  assert.equal(JSON.parse(anthropic.options.body).max_tokens, 4096);
  const gemini = buildRequest(["Hello"], { ...common, provider: "gemini" });
  assert.match(gemini.url, /generateContent\?key=secret$/);
  const custom = buildRequest(["Hello"], { ...common, provider: "custom", customEndpoint: "https://llm.example/v1/chat/completions", customModel: "local" });
  assert.equal(custom.url, "https://llm.example/v1/chat/completions");
  assert.equal(JSON.parse(custom.options.body).model, "local");
});

test("parses plain and fenced JSON without accepting malformed counts", () => {
  assert.deepEqual(parseTranslations('["你好","世界"]', 2), ["你好", "世界"]);
  assert.deepEqual(parseTranslations('```json\n["你好"]\n```', 1), ["你好"]);
  assert.deepEqual(parseTranslations('{"translations":["你好"]}', 1), ["你好"]);
  assert.deepEqual(parseTranslations('{"translation":"你好"}', 1), ["你好"]);
  assert.deepEqual(parseTranslations('翻译结果：你好', 1), ["你好"]);
  assert.deepEqual(parseTranslations('[{"translation":"你好"}]', 1), ["你好"]);
  assert.deepEqual(parseTranslations('["第一段","第二段"]', 1), ["第一段\n\n第二段"]);
  assert.throws(() => parseTranslations('["only one"]', 2), /数量/);
  assert.deepEqual(parseTranslations("not json", 1), ["not json"]);
  assert.throws(() => parseTranslations("[broken", 1), /翻译数组/);
});

test("translates an OpenAI response and presents safe API errors", async () => {
  const settings = { provider: "openai", apiKey: "secret", model: "example" };
  const okFetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '["你好"]' } }] }), { status: 200 });
  assert.deepEqual(await translateBatch(["Hello"], settings, okFetch), ["你好"]);
  const deniedFetch = async () => new Response(JSON.stringify({ error: { message: "do not leak details" } }), { status: 401 });
  await assert.rejects(() => translateBatch(["Hello"], settings, deniedFetch), /Token 无效/);
});

test("rejects a copied key containing non-ASCII text before fetch", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return new Response(); };
  await assert.rejects(
    () => translateBatch(["Hello"], { provider: "openai", apiKey: "API Key：错误", model: "example" }, fetchImpl),
    /中文、空格或全角符号/
  );
  assert.equal(called, false);
});

test("automatically splits a batch when the model returns the wrong count", async () => {
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    const input = JSON.parse(body.messages.at(-1).content);
    const output = input.length > 1 ? ["数量错误"] : [`译：${input[0]}`];
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 });
  };
  const result = await translateBatchResilient(["one", "two", "three"], { provider: "openai", apiKey: "secret", model: "example" }, fetchImpl);
  assert.deepEqual(result, ["译：one", "译：two", "译：three"]);
  assert.equal(calls, 5);
});
