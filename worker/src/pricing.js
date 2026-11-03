// Official DeepSeek Flash prices, CNY per 1,000,000 tokens.
// Source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing
// Checked 2026-11-03.
//
// deepseek-v4-flash is a legacy model id. DeepSeek still accepts it and bills
// it as deepseek-flash (DeepSeek-V4.1-Flash). Peak is Beijing weekdays
// 09:00–12:00 and 14:00–18:00, excluding Chinese public holidays. All other
// hours are off-peak at half the peak price.
//
// The gateway always estimates at PEAK rates and treats input without an
// explicit cache-hit count as a cache miss. That overestimates off-peak and
// cache-hit traffic, so a user runs out of the ¥0.10 cap slightly early
// instead of the shared key running past it.
//
// | Item                         | Off-peak | Peak (used here) |
// | ---------------------------- | -------: | ---------------: |
// | Input cache hit              |     ¥0.02 |            ¥0.04 |
// | Input cache miss             |     ¥1    |            ¥2    |
// | Output                       |     ¥4    |            ¥8    |
//
// ¥0.10 is about $0.014 at 7 CNY per USD. DeepSeek publishes a separate USD
// schedule; this worker does not convert currencies. At the peak rates above,
// ¥0.10 covers about 50,000 cache-miss input tokens, or about 12,500 output
// tokens, before the next request is rejected.

export const DAILY_CAP_CNY = 0.10;

export const PRICE_PER_MILLION_CNY = Object.freeze({
  model: "deepseek-v4-flash",
  billedAs: "deepseek-flash",
  inputCacheHit: 0.04,
  inputCacheMiss: 2,
  output: 8
});

export const UPSTREAM_MODEL = "deepseek-v4-flash";
export const MAX_OUTPUT_TOKENS = 4096;
export const MAX_MESSAGE_CHARS = 64000;

export function roundCny(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}

function nonNegative(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number;
}

export function estimateSpendCny(usage = {}) {
  const hit = nonNegative(usage.prompt_cache_hit_tokens);
  const miss = usage.prompt_cache_miss_tokens != null
    ? nonNegative(usage.prompt_cache_miss_tokens)
    : Math.max(0, nonNegative(usage.prompt_tokens) - hit);
  const output = nonNegative(usage.completion_tokens);
  const { inputCacheHit, inputCacheMiss, output: outputPrice } = PRICE_PER_MILLION_CNY;
  return roundCny((hit * inputCacheHit + miss * inputCacheMiss + output * outputPrice) / 1_000_000);
}

export function spendFromExchange(requestBody, data) {
  const usage = data?.usage;
  const hasReportedUsage = usage && (
    usage.prompt_tokens != null
    || usage.completion_tokens != null
    || usage.prompt_cache_hit_tokens != null
    || usage.prompt_cache_miss_tokens != null
  );
  if (hasReportedUsage) {
    return {
      spendCny: estimateSpendCny(usage),
      promptTokens: nonNegative(usage.prompt_tokens),
      completionTokens: nonNegative(usage.completion_tokens),
      estimated: false
    };
  }
  const input = (requestBody?.messages || []).map((message) => message.content || "").join("\n");
  const output = typeof data?.choices?.[0]?.message?.content === "string" ? data.choices[0].message.content : "";
  const estimatedUsage = {
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: Math.max(1, input.length),
    prompt_tokens: Math.max(1, input.length),
    completion_tokens: Math.max(1, output.length)
  };
  return {
    spendCny: estimateSpendCny(estimatedUsage),
    promptTokens: estimatedUsage.prompt_tokens,
    completionTokens: estimatedUsage.completion_tokens,
    estimated: true
  };
}

export function capMaxTokens(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return MAX_OUTPUT_TOKENS;
  return Math.min(MAX_OUTPUT_TOKENS, Math.floor(number));
}

export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function quotaExceeded(spentCny) {
  return roundCny(spentCny) >= DAILY_CAP_CNY;
}
