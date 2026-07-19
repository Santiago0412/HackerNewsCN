const SYSTEM_PROMPT = `你是专业的科技新闻翻译。将输入的英文内容准确、自然地翻译成简体中文。保留人名、产品名、公司名、代码和 URL；不要添加解释、序号或 Markdown。你会收到 JSON 字符串数组，必须只返回等长的 JSON 字符串数组。`;

export const PROMPT_VERSION = "zh-cn-tech-v1";

export async function translateBatch(texts, settings, fetchImpl = fetch) {
  if (!settings.apiKey) throw new Error("请先在插件设置中填写 API Token");
  if (!/^[\x21-\x7E]+$/.test(settings.apiKey)) {
    throw new Error("API Key 包含中文、空格或全角符号，请重新复制服务商提供的原始 Key");
  }
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
  if (provider === "anthropic") {
    return jsonRequest("https://api.anthropic.com/v1/messages", {
      model: settings.model, max_tokens: 4096, system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: bodyText }]
    }, { "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01" });
  }
  if (provider === "gemini") {
    const model = encodeURIComponent(settings.model);
    return jsonRequest(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`, {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: bodyText }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
    });
  }
  const endpoint = provider === "deepseek"
    ? "https://api.deepseek.com/chat/completions"
    : provider === "custom" ? settings.customEndpoint : "https://api.openai.com/v1/chat/completions";
  if (!endpoint) throw new Error("请填写兼容接口地址");
  return jsonRequest(endpoint, {
    model: provider === "custom" ? settings.customModel : settings.model,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: bodyText }]
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
  try {
    const parsed = JSON.parse(raw);
    message = parsed.error?.message || parsed.error?.type || raw;
  } catch { /* keep raw */ }
  if (status === 401 || status === 403) return `Token 无效或无权访问（HTTP ${status}）`;
  if (status === 429) return "请求过于频繁或账户余额不足（HTTP 429）";
  return `模型接口请求失败（HTTP ${status}）：${String(message).slice(0, 240)}`;
}
