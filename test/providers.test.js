import test from "node:test";
import assert from "node:assert/strict";
import { buildRequest, buildChatRequest, askQuestion, parseTranslations, translateBatch, translateBatchResilient } from "../src/lib/providers.js";

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

test("uses the selected target language for translation and chat", () => {
  const settings = { provider: "openai", apiKey: "secret", model: "example", targetLanguage: "ja" };
  const translation = JSON.parse(buildRequest(["Hello"], settings).options.body);
  assert.match(translation.messages[0].content, /Japanese/);
  assert.doesNotMatch(translation.messages[0].content, /Simplified Chinese/);
  const chat = JSON.parse(buildChatRequest("READING_CONTEXT", [{ role: "user", content: "summary" }], settings).options.body);
  assert.match(chat.messages[0].content, /Always answer in Japanese/);
  assert.match(chat.messages[0].content, /READING_CONTEXT/);
});

test("uses a custom language name and validates custom API URLs", () => {
  const settings = {
    provider: "custom", apiKey: "secret", customModel: "local-model",
    customEndpoint: "https://llm.example/v1/chat/completions", targetLanguage: "custom", customTargetLanguage: "Italiano"
  };
  const request = buildRequest(["Hello"], settings);
  assert.equal(request.url, "https://llm.example/v1/chat/completions");
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, "local-model");
  assert.match(body.messages[0].content, /Italiano/);
  assert.throws(() => buildRequest(["Hello"], { ...settings, customEndpoint: "file:///tmp/model" }), /https:\/\/|http:\/\//);
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

test("builds chat request payloads per provider and injects reading context", () => {
  const history = [{ role: "user", content: "这篇讲了什么？" }, { role: "assistant", content: "讲了 X。" }, { role: "user", content: "再详细点" }];
  const common = { apiKey: "secret", model: "example" };

  const openai = buildChatRequest("READING_CONTEXT", history, { ...common, provider: "openai" });
  const openaiBody = JSON.parse(openai.options.body);
  assert.equal(openai.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(openaiBody.messages[0].role, "system");
  assert.match(openaiBody.messages[0].content, /READING_CONTEXT/);
  assert.equal(openaiBody.messages.length, 4);
  assert.equal(openaiBody.messages.at(-1).content, "再详细点");

  const anthropic = buildChatRequest("READING_CONTEXT", history, { ...common, provider: "anthropic" });
  const anthropicBody = JSON.parse(anthropic.options.body);
  assert.match(anthropicBody.system, /READING_CONTEXT/);
  assert.equal(anthropicBody.max_tokens, 1024);
  assert.equal(anthropicBody.messages.length, 3);
  assert.equal(anthropicBody.messages[0].role, "user");

  const gemini = buildChatRequest("READING_CONTEXT", history, { ...common, provider: "gemini" });
  const geminiBody = JSON.parse(gemini.options.body);
  assert.match(geminiBody.systemInstruction.parts[0].text, /READING_CONTEXT/);
  assert.equal(geminiBody.contents[1].role, "model");
  assert.equal(geminiBody.generationConfig.responseMimeType, undefined);
});

test("bounds chat history so the floating assistant cannot grow requests forever", () => {
  const history = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `turn-${index}` }));
  const request = buildChatRequest("context", history, { provider: "openai", apiKey: "secret", model: "example" });
  const body = JSON.parse(request.options.body);
  assert.equal(body.messages.length, 13);
  assert.equal(body.messages[1].content, "turn-8");
  assert.equal(body.messages.at(-1).content, "turn-19");
});

test("askQuestion returns the model answer and surfaces API errors", async () => {
  const settings = { provider: "openai", apiKey: "secret", model: "example" };
  const history = [{ role: "user", content: "总结一下" }];
  const okFetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: "这是回答。" } }] }), { status: 200 });
  assert.equal(await askQuestion("正文", history, settings, okFetch), "这是回答。");
  const errFetch = async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 429 });
  await assert.rejects(() => askQuestion("正文", history, settings, errFetch), /频繁|429/);
});

test("askQuestion rejects empty history and non-ASCII keys before fetch", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return new Response(); };
  await assert.rejects(() => askQuestion("正文", [], { provider: "openai", apiKey: "secret", model: "x" }, fetchImpl), /请输入你的问题/);
  await assert.rejects(() => askQuestion("正文", [{ role: "user", content: "hi" }], { provider: "openai", apiKey: "中文错误", model: "x" }, fetchImpl), /中文、空格或全角符号/);
  assert.equal(called, false);
});
