import { HOSTED_GATEWAY_URL, normalizeCustomEndpoint, resolveTargetLanguage, usesHostedGateway } from "./settings.js";
import { ensureInstallId, isInstallId } from "./install-id.js";

export const PROMPT_VERSION = "multilingual-tech-v2";

function translationSystemPrompt(settings) {
  const target = resolveTargetLanguage(settings).prompt;
  return `You are a professional technology-news translator. Translate every input accurately and naturally into ${target}. Preserve names, product names, company names, code, and URLs. Do not add explanations, numbering, or Markdown. You will receive a JSON array of strings and must return only a JSON array with exactly the same number of strings.`;
}

function chatSystemPrompt(settings) {
  const target = resolveTargetLanguage(settings).prompt;
  return `You are the reading assistant embedded in a Hacker News reader. Always answer in ${target}. Be concise, accurate, and natural; use short lists when helpful. Base your answer primarily on the supplied reading context. If the context does not contain the answer, say so clearly. You may add relevant background knowledge, but never invent facts, numbers, or quotations.`;
}

export function assertApiKey(settings) {
  if (usesHostedGateway(settings)) return;
  if (!settings.apiKey) throw new Error("请先在插件设置中填写 API Token");
  if (!/^[\x21-\x7E]+$/.test(settings.apiKey)) {
    throw new Error("API Key 包含中文、空格或全角符号，请重新复制服务商提供的原始 Key");
  }
}

export function hostedChatCompletionsUrl(gatewayUrl = HOSTED_GATEWAY_URL) {
  const base = String(gatewayUrl || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(base)) throw new Error("托管网关地址无效");
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${base}/v1/chat/completions`;
}

async function withInstallId(settings) {
  if (!usesHostedGateway(settings)) return settings;
  if (isInstallId(settings.installId)) return settings;
  return { ...settings, installId: await ensureInstallId() };
}

function hostedHeaders(settings) {
  if (!isInstallId(settings.installId)) throw new Error("缺少本机安装标识，请重试");
  return { "X-Install-Id": settings.installId };
}

export async function translateBatch(texts, settings, fetchImpl = fetch) {
  settings = await withInstallId(settings);
  assertApiKey(settings);
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const request = buildRequest(texts, settings);
  const response = await fetchImpl(request.url, request.options);
  const raw = await response.text();
  if (!response.ok) throw new Error(apiError(response.status, raw));
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("模型接口返回了无效 JSON"); }
  const content = extractContent(data, settings.provider);
  return parseTranslations(content, texts.length);
}

export async function translateBatchResilient(texts, settings, fetchImpl = fetch) {
  try {
    return await translateBatch(texts, settings, fetchImpl);
  } catch (error) {
    if (!/模型未按要求|翻译数量与原文不一致|模型返回内容为空/.test(error.message)) throw error;
    if (texts.length > 1) {
      const middle = Math.ceil(texts.length / 2);
      const left = await translateBatchResilient(texts.slice(0, middle), settings, fetchImpl);
      const right = await translateBatchResilient(texts.slice(middle), settings, fetchImpl);
      return [...left, ...right];
    }
    return translateBatch(texts, settings, fetchImpl);
  }
}

export function buildRequest(texts, settings) {
  const provider = settings.provider;
  const bodyText = JSON.stringify(texts);
  const system = translationSystemPrompt(settings);
  if (usesHostedGateway(settings)) {
    return jsonRequest(hostedChatCompletionsUrl(), {
      model: settings.model || "deepseek-v4-flash",
      messages: [{ role: "system", content: system }, { role: "user", content: bodyText }]
    }, hostedHeaders(settings));
  }
  if (provider === "anthropic") {
    return jsonRequest("https://api.anthropic.com/v1/messages", {
      model: settings.model, max_tokens: 4096, system,
      messages: [{ role: "user", content: bodyText }]
    }, { "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01" });
  }
  if (provider === "gemini") {
    const model = encodeURIComponent(settings.model);
    return jsonRequest(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: bodyText }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    });
  }
  const endpoint = provider === "deepseek"
    ? "https://api.deepseek.com/chat/completions"
    : provider === "custom" ? normalizeCustomEndpoint(settings.customEndpoint) : "https://api.openai.com/v1/chat/completions";
  if (!endpoint) throw new Error("请填写兼容接口地址");
  return jsonRequest(endpoint, {
    model: provider === "custom" ? settings.customModel : settings.model,
    messages: [{ role: "system", content: system }, { role: "user", content: bodyText }]
  }, { Authorization: `Bearer ${settings.apiKey}` });
}

function jsonRequest(url, body, headers = {}) {
  return { url, options: { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) } };
}

function extractContent(data, provider) {
  if (provider === "anthropic") return data.content?.[0]?.text;
  if (provider === "gemini") return data.candidates?.[0]?.content?.parts?.[0]?.text;
  return data.choices?.[0]?.message?.content;
}

export function parseTranslations(content, expectedLength) {
  if (typeof content !== "string") throw new Error("模型返回内容为空");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    if (expectedLength === 1 && cleaned && !/^[\[{]/.test(cleaned)) return [cleaned.replace(/^翻译(?:结果)?[：:]\s*/, "")];
    throw new Error("模型未按要求返回翻译数组，请重试");
  }
  if (!Array.isArray(parsed) && Array.isArray(parsed?.translations)) parsed = parsed.translations;
  if (!Array.isArray(parsed) && expectedLength === 1 && typeof parsed?.translation === "string") parsed = [parsed.translation];
  if (Array.isArray(parsed)) {
    parsed = parsed.map((item) => typeof item === "object" && typeof item?.translation === "string" ? item.translation : item);
  }
  if (expectedLength === 1 && Array.isArray(parsed) && parsed.length > 1 && parsed.every((item) => typeof item === "string")) {
    parsed = [parsed.join("\n\n")];
  }
  if (!Array.isArray(parsed) || parsed.length !== expectedLength || parsed.some((item) => typeof item !== "string")) {
    throw new Error("模型返回的翻译数量与原文不一致，请重试");
  }
  return parsed;
}

function apiError(status, raw) {
  let message = raw;
  let code = "";
  try {
    const parsed = JSON.parse(raw);
    message = parsed.error?.message || parsed.error?.type || raw;
    code = parsed.error?.code || parsed.error?.type || "";
  } catch { /* keep raw */ }
  if (status === 429 && /daily_quota_exceeded|quota_exceeded|quota exceeded/i.test(`${code} ${message}`)) {
    return "今日免费额度已用完（约 ¥0.10）。请在设置中改用自己的 API Key，或等到明天（UTC 0 点）再试。";
  }
  if (status === 401 || status === 403) {
    if (/install-id|origin is not allowed/i.test(String(message))) return `托管网关拒绝了这次请求（HTTP ${status}）。请重试；若仍失败，请改用自己的 API Key。`;
    return `Token 无效或无权访问（HTTP ${status}）`;
  }
  if (status === 429) return "请求过于频繁或账户余额不足（HTTP 429）";
  return `模型接口请求失败（HTTP ${status}）：${String(message).slice(0, 240)}`;
}

export async function askQuestion(context, history, settings, fetchImpl = fetch) {
  if (!Array.isArray(history) || history.length === 0) throw new Error("请输入你的问题");
  settings = await withInstallId(settings);
  assertApiKey(settings);
  const request = buildChatRequest(context, history, settings);
  const response = await fetchImpl(request.url, request.options);
  const raw = await response.text();
  if (!response.ok) throw new Error(apiError(response.status, raw));
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("模型接口返回了无效 JSON"); }
  const content = extractContent(data, settings.provider);
  if (typeof content !== "string" || !content.trim()) throw new Error("模型没有返回有效回答，请重试");
  return content.trim();
}

export function buildChatRequest(context, history, settings) {
  const provider = settings.provider;
  const system = `${chatSystemPrompt(settings)}\n\nREADING CONTEXT:\n${String(context || "").slice(0, 12000)}`;
  const turns = history.slice(-12).map((turn) => ({ role: turn.role, content: String(turn.content ?? "") }));
  if (usesHostedGateway(settings)) {
    return jsonRequest(hostedChatCompletionsUrl(), {
      model: settings.model || "deepseek-v4-flash",
      messages: [{ role: "system", content: system }, ...turns]
    }, hostedHeaders(settings));
  }
  if (provider === "anthropic") {
    return jsonRequest("https://api.anthropic.com/v1/messages", {
      model: settings.model, max_tokens: 1024, system, messages: turns
    }, { "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01" });
  }
  if (provider === "gemini") {
    const model = encodeURIComponent(settings.model);
    return jsonRequest(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`, {
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((turn) => ({ role: turn.role === "assistant" ? "model" : "user", parts: [{ text: turn.content }] })),
      generationConfig: { temperature: 0.3 }
    });
  }
  const endpoint = provider === "deepseek"
    ? "https://api.deepseek.com/chat/completions"
    : provider === "custom" ? normalizeCustomEndpoint(settings.customEndpoint) : "https://api.openai.com/v1/chat/completions";
  if (!endpoint) throw new Error("请填写兼容接口地址");
  return jsonRequest(endpoint, {
    model: provider === "custom" ? settings.customModel : settings.model,
    messages: [{ role: "system", content: system }, ...turns]
  }, { Authorization: `Bearer ${settings.apiKey}` });
}
