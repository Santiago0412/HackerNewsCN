export const DEFAULT_SETTINGS = Object.freeze({
  provider: "openai",
  apiKey: "",
  model: "gpt-5-mini",
  customEndpoint: "",
  customModel: "",
  autoTranslateTitles: true,
  showOriginal: true,
  topicMode: "highlight",
  topics: [],
  cacheDays: 30,
  maxCacheEntries: 5000
});

export const PROVIDERS = Object.freeze({
  openai: { label: "OpenAI", model: "gpt-5-mini" },
  anthropic: { label: "Anthropic", model: "claude-haiku-4-5" },
  deepseek: { label: "DeepSeek", model: "deepseek-v4-flash" },
  gemini: { label: "Google Gemini", model: "gemini-3.1-flash-lite" },
  custom: { label: "OpenAI 兼容接口", model: "" }
});

export const MODEL_CHOICES = Object.freeze([
  { provider: "openai", model: "gpt-5-mini", label: "OpenAI · GPT-5 mini", keyUrl: "https://platform.openai.com/api-keys", keySite: "OpenAI Platform" },
  { provider: "anthropic", model: "claude-haiku-4-5", label: "Anthropic · Claude Haiku 4.5", keyUrl: "https://console.anthropic.com/settings/keys", keySite: "Claude Console" },
  { provider: "deepseek", model: "deepseek-v4-flash", label: "DeepSeek · V4 Flash", keyUrl: "https://platform.deepseek.com/api_keys", keySite: "DeepSeek 开放平台" },
  { provider: "gemini", model: "gemini-3.1-flash-lite", label: "Google · Gemini 3.1 Flash-Lite", keyUrl: "https://aistudio.google.com/app/apikey", keySite: "Google AI Studio" }
]);

export function normalizeSettings(value = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...value };
  merged.topics = Array.isArray(merged.topics) ? [...new Set(merged.topics)] : [];
  merged.cacheDays = clampNumber(merged.cacheDays, 1, 365, DEFAULT_SETTINGS.cacheDays);
  merged.maxCacheEntries = clampNumber(merged.maxCacheEntries, 100, 20000, DEFAULT_SETTINGS.maxCacheEntries);
  if (!PROVIDERS[merged.provider]) merged.provider = DEFAULT_SETTINGS.provider;
  return merged;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}
