import {
  DAILY_CAP_CNY,
  MAX_MESSAGE_CHARS,
  UPSTREAM_MODEL,
  capMaxTokens,
  quotaExceeded,
  roundCny,
  spendFromExchange,
  utcDay
} from "./pricing.js";

const DEFAULT_UPSTREAM = "https://api.deepseek.com/chat/completions";
const INSTALL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USAGE_TTL_SECONDS = 72 * 60 * 60;

export function isInstallId(value) {
  return typeof value === "string" && INSTALL_ID_RE.test(value);
}

export function extensionOriginAllowed(origin) {
  if (!origin || origin === "null") return true;
  return origin.startsWith("chrome-extension://");
}

export function usageKey(installId, day) {
  return `v1:${day}:${installId}`;
}

export function emptyUsage() {
  return { spendCny: 0, requests: 0, promptTokens: 0, completionTokens: 0 };
}

export async function readUsage(kv, installId, day) {
  const raw = await kv.get(usageKey(installId, day));
  if (!raw) return emptyUsage();
  try {
    const parsed = JSON.parse(raw);
    return {
      spendCny: roundCny(parsed.spendCny || 0),
      requests: Number(parsed.requests) || 0,
      promptTokens: Number(parsed.promptTokens) || 0,
      completionTokens: Number(parsed.completionTokens) || 0
    };
  } catch {
    return emptyUsage();
  }
}

export async function writeUsage(kv, installId, day, usage) {
  await kv.put(usageKey(installId, day), JSON.stringify({ ...usage, day }), { expirationTtl: USAGE_TTL_SECONDS });
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Install-Id",
    "Access-Control-Expose-Headers": "X-Quota-Limit-Cny, X-Quota-Spent-Cny",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
  if (origin && origin.startsWith("chrome-extension://")) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(payload, status, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin), ...extraHeaders }
  });
}

function quotaPayload(spentCny) {
  return {
    error: {
      message: `Daily free quota exceeded (¥${DAILY_CAP_CNY.toFixed(2)} CNY). Use your own API key or wait until 00:00 UTC.`,
      type: "quota_exceeded",
      code: "daily_quota_exceeded",
      dailyCapCny: DAILY_CAP_CNY,
      spentCny: roundCny(spentCny)
    }
  };
}

export function validateChatBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "Body must be a JSON object" };
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 32) {
    return { ok: false, message: "messages must be an array of 1 to 32 items" };
  }
  let chars = 0;
  for (const message of body.messages) {
    if (!message || typeof message.role !== "string" || typeof message.content !== "string") {
      return { ok: false, message: "Each message needs a string role and string content" };
    }
    if (!["system", "user", "assistant"].includes(message.role)) return { ok: false, message: "Unsupported message role" };
    chars += message.content.length;
  }
  if (chars > MAX_MESSAGE_CHARS) return { ok: false, message: "Message content is too large" };
  return { ok: true, body };
}

function upstreamUrl(env) {
  const configured = String(env?.DEEPSEEK_API_URL || "");
  if (configured.startsWith("https://api.deepseek.com/")) return configured;
  return DEFAULT_UPSTREAM;
}

function upstreamBody(body) {
  const payload = {
    model: UPSTREAM_MODEL,
    messages: body.messages.map((message) => ({ role: message.role, content: message.content })),
    stream: false,
    max_tokens: capMaxTokens(body.max_tokens)
  };
  if (body.response_format && body.response_format.type === "json_object") payload.response_format = { type: "json_object" };
  return payload;
}

function quotaHeaders(spentCny) {
  return {
    "X-Quota-Limit-Cny": DAILY_CAP_CNY.toFixed(2),
    "X-Quota-Spent-Cny": roundCny(spentCny).toFixed(6)
  };
}

function authorize(request) {
  const installId = request.headers.get("X-Install-Id");
  if (!isInstallId(installId)) {
    return { ok: false, status: 401, message: "X-Install-Id must be a UUID", type: "unauthorized" };
  }
  const origin = request.headers.get("Origin");
  if (!extensionOriginAllowed(origin)) {
    return { ok: false, status: 403, message: "Origin is not allowed", type: "forbidden" };
  }
  return { ok: true, installId, origin };
}

export async function handleRequest(request, env, fetchImpl = fetch) {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    if (!extensionOriginAllowed(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const url = new URL(request.url);
  if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/v1/health")) {
    return json({ ok: true, service: "hncn-gateway" }, 200, origin);
  }
  if (request.method !== "POST" || (url.pathname !== "/v1/chat/completions" && url.pathname !== "/chat/completions")) {
    return json({ error: { message: "Not found", type: "not_found" } }, 404, origin);
  }

  const auth = authorize(request);
  if (!auth.ok) return json({ error: { message: auth.message, type: auth.type } }, auth.status, origin);
  if (!env?.DEEPSEEK_API_KEY) {
    return json({ error: { message: "Gateway secret DEEPSEEK_API_KEY is not configured", type: "gateway_unconfigured" } }, 503, origin);
  }
  if (!env.USAGE_KV?.get || !env.USAGE_KV?.put) {
    return json({ error: { message: "USAGE_KV binding is not configured", type: "gateway_unconfigured" } }, 503, origin);
  }

  let raw = "";
  try { raw = await request.text(); } catch { raw = ""; }
  if (raw.length > MAX_MESSAGE_CHARS * 2) {
    return json({ error: { message: "Request body is too large", type: "invalid_request" } }, 413, origin);
  }
  let parsedBody;
  try { parsedBody = JSON.parse(raw); } catch {
    return json({ error: { message: "Invalid JSON", type: "invalid_request" } }, 400, origin);
  }
  const validated = validateChatBody(parsedBody);
  if (!validated.ok) return json({ error: { message: validated.message, type: "invalid_request" } }, 400, origin);

  const day = utcDay();
  const current = await readUsage(env.USAGE_KV, auth.installId, day);
  if (quotaExceeded(current.spendCny)) return json(quotaPayload(current.spendCny), 429, origin, quotaHeaders(current.spendCny));

  const outbound = upstreamBody(validated.body);
  let upstream;
  try {
    upstream = await fetchImpl(upstreamUrl(env), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(outbound)
    });
  } catch {
    return json({ error: { message: "Upstream DeepSeek request failed", type: "upstream_error" } }, 502, origin);
  }

  const upstreamText = await upstream.text();
  let upstreamJson = null;
  try { upstreamJson = JSON.parse(upstreamText); } catch { upstreamJson = null; }

  let spent = current.spendCny;
  if (upstream.ok && upstreamJson) {
    const delta = spendFromExchange(outbound, upstreamJson);
    const next = {
      spendCny: roundCny(current.spendCny + delta.spendCny),
      requests: current.requests + 1,
      promptTokens: current.promptTokens + delta.promptTokens,
      completionTokens: current.completionTokens + delta.completionTokens
    };
    await writeUsage(env.USAGE_KV, auth.installId, day, next);
    spent = next.spendCny;
  }

  return new Response(upstreamText || "{}", {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
      ...quotaHeaders(spent)
    }
  });
}
