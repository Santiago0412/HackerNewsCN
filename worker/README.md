# HackerNewsCN hosted DeepSeek gateway

Cloudflare Worker that proxies OpenAI-compatible chat completions to DeepSeek. The extension's default hosted mode calls this Worker. The DeepSeek API key lives only in a Wrangler secret. The extension zip, this repo, and the store listing must not contain it.

`https://hncn-gateway.example.workers.dev` in the extension is a **placeholder**. It is not a live service. Do not tell users that URL works until you deploy and point `HOSTED_GATEWAY_URL` at the real host.

## What it does

- `POST /v1/chat/completions` (and `POST /chat/completions`) forwards to `https://api.deepseek.com/chat/completions`.
- Requires header `X-Install-Id` (UUID). The extension generates one UUID per install and stores it in `chrome.storage.local`. `chrome.runtime.id` is not used, because every install of a store build shares it.
- Allows `Origin: chrome-extension://…`, a missing `Origin`, or `Origin: null`. Any other origin is rejected. That covers MV3 extension pages and the service worker without accepting ordinary websites.
- Injects `Authorization: Bearer $DEEPSEEK_API_KEY` on the upstream call. Client `Authorization` headers are ignored.
- Forces the model to `deepseek-v4-flash`, `stream: false`, and `max_tokens` ≤ 4096. Tool calls are dropped so the shared key cannot be pointed at a more expensive model or at DeepSeek's Search/Fetch tools.
- Records estimated spend per install id per UTC day in KV. The cap is the single constant `DAILY_CAP_CNY = 0.10` in `src/pricing.js`. Over the cap, the Worker returns HTTP 429:

```json
{
  "error": {
    "message": "Daily free quota exceeded (¥0.10 CNY). Use your own API key or wait until 00:00 UTC.",
    "type": "quota_exceeded",
    "code": "daily_quota_exceeded",
    "dailyCapCny": 0.10
  }
}
```

- `GET /health` returns `{ "ok": true, "service": "hncn-gateway" }` and does not touch the key or KV.

KV stores only the day's spend, request count, and token totals. Prompt text is not written to KV and is not logged by this Worker. The Worker does see the prompt in memory long enough to forward it to DeepSeek.

Concurrent requests can slightly pass the cap: KV writes are not a transaction. The next request after the stored spend reaches ¥0.10 is rejected. One in-flight request may finish after the cap is crossed.

The install id is chosen by the client. The cap is per id, not a global account system. Someone who forges many UUIDs can spend more than ¥0.10 in total. That is the limit of a keyless quota.

## Price table used for the estimate

Source: [DeepSeek 模型 & 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing), checked 2026-11-03.

`deepseek-v4-flash` is a legacy id. DeepSeek still accepts it and bills it as `deepseek-flash` (DeepSeek-V4.1-Flash). Prices are CNY per 1,000,000 tokens.

| Item | Off-peak | Peak |
|---|---:|---:|
| Input, cache hit | ¥0.02 | ¥0.04 |
| Input, cache miss | ¥1 | ¥2 |
| Output | ¥4 | ¥8 |

Peak hours are Beijing time Monday–Friday 09:00–12:00 and 14:00–18:00, excluding Chinese public holidays. Every other hour, including weekends and Chinese public holidays, is off-peak at half the peak price.

The Worker **always uses the peak column**. If the response has no cache-hit split, all input tokens are priced as cache misses. Both choices overestimate off-peak and cache-hit traffic, so the ¥0.10 ceiling is reached early rather than late.

At those peak rates, ¥0.10 is about:

- 50,000 cache-miss input tokens, or
- 12,500 output tokens.

¥0.10 is about **$0.014** at 7 CNY per USD. DeepSeek also publishes a separate USD price list. This Worker does not convert FX; the cap is CNY.

When DeepSeek returns `usage`, those token counts are used (`prompt_cache_hit_tokens`, `prompt_cache_miss_tokens`, `completion_tokens`). If `usage` is missing, the Worker estimates 1 token per character of input and output, still at peak cache-miss and output rates.

## Deploy

Requirements: a Cloudflare account and Node.js. Wrangler is invoked with `npx` so it does not have to be a project dependency.

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create USAGE_KV
```

Copy the printed `id` into `wrangler.toml`, replacing both placeholder ids:

```toml
[[kv_namespaces]]
binding = "USAGE_KV"
id = "<id from wrangler kv namespace create>"
preview_id = "<same id, or a second namespace for wrangler dev>"
```

Create a preview namespace too if you use `wrangler dev` against remote KV (`npx wrangler kv namespace create USAGE_KV --preview`).

Put the DeepSeek key in a secret. This command reads the key from the prompt and stores it on Cloudflare. It does not write the key into the repo.

```bash
npx wrangler secret put DEEPSEEK_API_KEY
```

For local `wrangler dev`, copy the example and fill it in only on your machine:

```bash
cp .dev.vars.example .dev.vars
# edit .dev.vars — this file is gitignored
npx wrangler dev
```

Deploy:

```bash
npx wrangler deploy
```

Wrangler prints a `*.workers.dev` host (or your custom domain if you attach one). That host is the value to put in the extension. Do not commit `.dev.vars`, `.wrangler/`, or a real key.

Check the deploy:

```bash
curl https://<your-worker-host>/health
```

Expect `{"ok":true,"service":"hncn-gateway"}`. A chat call without `X-Install-Id` should return 401. Do not paste a production key into the curl command line if your shell history is shared; the Worker holds the key.

## Point the extension at the Worker

1. Set `HOSTED_GATEWAY_URL` in `src/lib/settings.js` to the origin only, for example `https://hncn-gateway.<account>.workers.dev`. No path and no API key.
2. Set `host_permissions` in `manifest.json` to `https://<same-host>/*`.
3. Reload the unpacked extension. Hosted mode calls `HOSTED_GATEWAY_URL + "/v1/chat/completions"` with `X-Install-Id` and without a user API key.

Until those two placeholders are replaced, hosted mode cannot succeed. Bring-your-own-key mode does not use the Worker.

## Secret rules

- `DEEPSEEK_API_KEY` is set with `wrangler secret put` or a gitignored `.dev.vars`.
- `wrangler.toml` `[vars]` may hold the public DeepSeek URL only.
- Do not add the key to the extension, README, store listing, screenshots, or CI logs.
