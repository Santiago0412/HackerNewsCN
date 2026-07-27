import test from "node:test";
import assert from "node:assert/strict";
import {
  customEndpointPermission,
  normalizeSettings,
  resolveTargetLanguage,
  selectedModelIndex,
  toContentSettings,
  validateConfiguration
} from "../src/lib/settings.js";

test("only exposes non-sensitive preferences to the HN content script", () => {
  const value = toContentSettings({
    apiKey: "must-not-leak",
    customEndpoint: "https://private.example/v1",
    topics: ["ai", "ai", "security"],
    topicMode: "filter",
    autoTranslateTitles: false,
    showOriginal: false
  });
  assert.deepEqual(value, {
    targetLanguage: "zh-CN",
    targetLanguageLabel: "简体中文",
    topics: ["ai", "security"],
    topicMode: "filter",
    autoTranslateTitles: false,
    showOriginal: false
  });
  assert.equal("apiKey" in value, false);
  assert.equal("customEndpoint" in value, false);
});

test("migrates existing users to Simplified Chinese without losing settings", () => {
  const settings = normalizeSettings({ provider: "deepseek", apiKey: "secret", topics: ["ai"] });
  assert.equal(settings.targetLanguage, "zh-CN");
  assert.equal(resolveTargetLanguage(settings).label, "简体中文");
  assert.equal(settings.provider, "deepseek");
  assert.deepEqual(settings.topics, ["ai"]);
});

test("supports custom target languages and OpenAI-compatible providers", () => {
  const settings = validateConfiguration({
    targetLanguage: "custom",
    customTargetLanguage: "Italiano",
    provider: "custom",
    customEndpoint: "https://llm.example/v1/chat/completions",
    customModel: "qwen-local"
  });
  assert.equal(resolveTargetLanguage(settings).prompt, "Italiano");
  assert.equal(settings.customEndpoint, "https://llm.example/v1/chat/completions");
  assert.equal(customEndpointPermission(settings.customEndpoint), "https://llm.example/*");
  assert.ok(selectedModelIndex(settings) > 0);
});

test("requires complete custom language and provider fields", () => {
  assert.throws(() => validateConfiguration({ targetLanguage: "custom", customTargetLanguage: "" }), /Target language|目标语言/);
  assert.throws(() => validateConfiguration({ provider: "custom", customEndpoint: "not-a-url", customModel: "x" }), /完整的 API 地址/);
  assert.throws(() => validateConfiguration({ provider: "custom", customEndpoint: "https://llm.example/v1", customModel: "" }), /模型名称/);
  assert.throws(() => validateConfiguration({ provider: "custom", customEndpoint: "https://user:pass@llm.example/v1", customModel: "x" }), /账号或密码/);
});
