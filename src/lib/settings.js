// Placeholder origin only. Not a live gateway. After `wrangler deploy`, replace
// this and the matching manifest.json host_permissions entry with the real host.
// Never put an API key here.
export const HOSTED_GATEWAY_URL = "https://hncn-gateway.example.workers.dev";

export const DEFAULT_SETTINGS = Object.freeze({
  targetLanguage: "zh-CN",
  customTargetLanguage: "",
  provider: "deepseek",
  apiKey: "",
  model: "deepseek-v4-flash",
  useHostedGateway: true,
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
  { provider: "gemini", model: "gemini-3.1-flash-lite", label: "Google · Gemini 3.1 Flash-Lite", keyUrl: "https://aistudio.google.com/app/apikey", keySite: "Google AI Studio" },
  { provider: "custom", model: "", label: "其他 · OpenAI 兼容接口", keyUrl: "", keySite: "" }
]);

export const LANGUAGE_CHOICES = Object.freeze([
  { value: "zh-CN", label: "简体中文", prompt: "Simplified Chinese" },
  { value: "zh-TW", label: "繁體中文", prompt: "Traditional Chinese" },
  { value: "en", label: "English", prompt: "English" },
  { value: "ja", label: "日本語", prompt: "Japanese" },
  { value: "ko", label: "한국어", prompt: "Korean" },
  { value: "es", label: "Español", prompt: "Spanish" },
  { value: "fr", label: "Français", prompt: "French" },
  { value: "de", label: "Deutsch", prompt: "German" },
  { value: "pt-BR", label: "Português", prompt: "Brazilian Portuguese" },
  { value: "ru", label: "Русский", prompt: "Russian" },
  { value: "ar", label: "العربية", prompt: "Arabic" },
  { value: "custom", label: "Other language…", prompt: "" }
]);

export function normalizeSettings(value = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...value };
  if (!LANGUAGE_CHOICES.some((item) => item.value === merged.targetLanguage)) merged.targetLanguage = DEFAULT_SETTINGS.targetLanguage;
  merged.customTargetLanguage = cleanText(merged.customTargetLanguage).slice(0, 80);
  merged.customEndpoint = cleanText(merged.customEndpoint);
  merged.customModel = cleanText(merged.customModel).slice(0, 200);
  merged.apiKey = cleanText(merged.apiKey);
  merged.useHostedGateway = merged.useHostedGateway !== false;
  merged.topics = Array.isArray(merged.topics) ? [...new Set(merged.topics)] : [];
  merged.cacheDays = clampNumber(merged.cacheDays, 1, 365, DEFAULT_SETTINGS.cacheDays);
  merged.maxCacheEntries = clampNumber(merged.maxCacheEntries, 100, 20000, DEFAULT_SETTINGS.maxCacheEntries);
  if (!PROVIDERS[merged.provider]) merged.provider = DEFAULT_SETTINGS.provider;
  if (merged.provider === "deepseek" && !merged.model) merged.model = PROVIDERS.deepseek.model;
  return merged;
}

export function usesHostedGateway(value = {}) {
  const settings = normalizeSettings(value);
  return settings.useHostedGateway && settings.provider === "deepseek" && !settings.apiKey;
}

export function hasModelAccess(value = {}) {
  const settings = normalizeSettings(value);
  return usesHostedGateway(settings) || Boolean(settings.apiKey);
}

export function validateConfiguration(value = {}) {
  const settings = normalizeSettings(value);
  const t = createTranslator(settings);
  if (settings.targetLanguage === "custom" && !settings.customTargetLanguage) {
    throw new Error(t("customLanguage"));
  }
  if (settings.provider === "custom") {
    settings.customEndpoint = normalizeCustomEndpoint(settings.customEndpoint, settings);
    if (!settings.customModel) throw new Error(t("modelName"));
  }
  return settings;
}

export function resolveTargetLanguage(value = {}) {
  const settings = normalizeSettings(value);
  if (settings.targetLanguage === "custom") {
    return { value: "custom", label: settings.customTargetLanguage, prompt: settings.customTargetLanguage };
  }
  return LANGUAGE_CHOICES.find((item) => item.value === settings.targetLanguage) || LANGUAGE_CHOICES[0];
}

export function selectedModelIndex(settings = {}) {
  const index = MODEL_CHOICES.findIndex((item) => item.provider === settings.provider && (item.provider === "custom" || item.model === settings.model));
  return index >= 0 ? index : 0;
}

export function normalizeCustomEndpoint(value, localeValue = "zh-CN") {
  const t = createTranslator(localeValue);
  let url;
  try { url = new URL(cleanText(value)); } catch { throw new Error(t("endpointInvalid")); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(t("endpointProtocol"));
  if (url.username || url.password) throw new Error(t("endpointCredentials"));
  return url.href;
}

export function customEndpointPermission(value) {
  const url = new URL(normalizeCustomEndpoint(value));
  return `${url.protocol}//${url.host}/*`;
}

export function toContentSettings(value = {}) {
  const settings = normalizeSettings(value);
  const target = resolveTargetLanguage(settings);
  return {
    targetLanguage: target.value,
    targetLanguageLabel: target.label,
    topics: settings.topics,
    topicMode: settings.topicMode,
    autoTranslateTitles: settings.autoTranslateTitles,
    showOriginal: settings.showOriginal
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}
import { createTranslator } from "./ui-i18n.js";
