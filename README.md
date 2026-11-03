# Hacker News AI 阅读助手

一个无需账号的 Chrome / Chromium 浏览器扩展。它直接增强 `news.ycombinator.com`：用用户自己的大模型 API 把标题、评论和文章翻译成所选目标语言，并可按兴趣突出或过滤新闻。

界面使用统一的 HN 橙与暖灰视觉系统；Logo 延续 Hacker News 经典的白色 `Y` 标识。

## 功能

- 可选择简体中文、繁體中文、English、日本語、한국어、Español、Français、Deutsch、Português、Русский、العربية，或自行填写其他目标语言
- 侧边栏、首次引导、设置页和 HN 页面按钮会跟随所选目标语言；自行填写的任意目标语言使用英文界面回退
- 自动或手动批量翻译 Hacker News 标题，可随时切换译文与原文
- 点击扩展图标即可在浏览器侧边栏查看热门、最新、最佳、问答和作品，无需先打开 HN 网页；切换标签页时阅读器保持打开
- 可在内置阅读器直接查看并翻译新闻讨论
- 点击外链新闻时由侧边栏抓取、提取并分段翻译正文，不必离开当前网页；每个新域名首次读取时会请求授权
- 静态 HTML 没有正文时，会自动在非活动后台标签页渲染 JavaScript 页面，提取完成后立即关闭
- 遇到登录页、验证页或 GitHub 加载失败壳页时，会打开原网页；完成登录或验证后自动继续提取和翻译
- 标题、评论和文章正文翻译均显示已完成数量、总数和百分比进度
- 翻译批次默认使用 3 路并发请求，并在完成后按原文顺序组合结果
- 正文使用连续的杂志式阅读排版；评论使用带作者头像的冷灰色讨论卡片，和原帖清晰区分
- Ask HN、Show HN 等自带正文的原帖会和评论一起翻译，并保留可折叠原文
- 评论按需翻译，避免无意义消耗额度
- 每条新闻都可一键收藏；收藏页统一查看文章、添加或编辑笔记
- 右下角浮动 AI 入口在新闻列表、文章、讨论和收藏页始终可用，可切换“当前内容 / 我的收藏”上下文
- 可让模型按主题整理收藏与笔记，也可随时导出为 Markdown 或 JSON
- 默认使用托管 DeepSeek：不用粘贴 API Key。每台安装每天约 ¥0.10 免费额度，用完可改用自己的 Key 或等到明天（UTC）
- 支持 OpenAI、Anthropic、DeepSeek、Google Gemini；选择主流服务或粘贴自己的 Key 时，仍直接调用官方 API（BYOK）
- “其他 · OpenAI 兼容接口”支持自行填写完整 API 地址和模型名称，仅按需申请该接口域名权限
- 扩展名称、简介和操作提示通过 Chrome `_locales` 按浏览器语言显示，默认回退英文
- 自备 Key 只写入浏览器本机的 `chrome.storage.local`，只会发给你选择的模型服务商
- 托管模式不保存用户 API Key。扩展只生成一次随机 `installId`（存在本机），请求发到额度网关，由网关注入 DeepSeek Key
- “关注”Tab 单独展示人工智能、编程、创业、安全、科学、硬件、设计、文化等兴趣内容；其他 Tab 始终保持 HN 官方内容与排序
- 本地持久化缓存；缓存键包含原文、服务商、模型及提示词版本
- 同一批次去重、跨并发请求合并、分批请求、过期清理和 LRU 容量限制

## 安装

1. 打开 Chrome 的 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 选择“加载已解压的扩展程序”，选择本项目目录。
4. 点击工具栏中的扩展图标。首次打开时选择目标语言即可开始，默认不需要 API Key。
5. 想使用自己的 Key，或换成 OpenAI、Anthropic、Gemini、自定义接口时，打开“模型与话题设置”，粘贴 Key 后保存。
6. 浏览器右侧会打开常驻的 HN 阅读器。

托管额度约每天 ¥0.10。超出后翻译会提示改用自己的 Key，或等到次日 UTC 0 点。已经保存过设置的安装会保持原来的服务商和 Key，不会被改成托管模式。仓库里的网关地址 `https://hncn-gateway.example.workers.dev` 只是占位符，**不是**已经上线的服务；部署前按下一节替换。扩展包不包含 Worker，也不包含任何 API Key。声明式网络请求（declarativeNetRequest）不需要：扩展服务工作线程直接请求 `host_permissions` 里的网关域名。

使用自定义兼容接口时，Chrome 会在保存时请求该接口域名的访问权限。自备的 Token、收藏和笔记不会同步到 Google 账号；卸载扩展会同时移除本地设置、收藏、笔记和缓存。建议定期在收藏页导出备份。

## 托管 DeepSeek 网关

默认路径不把 DeepSeek Key 放进扩展。Key 只放在 Cloudflare Worker 的 secret 里。Worker 代码在 `worker/`，部署说明的完整版在 `worker/README.md`。

价格按 DeepSeek Flash 的**高峰**价估算（2026-11-03 的官方价，CNY / 百万 tokens）：缓存命中输入 ¥0.04、缓存未命中输入 ¥2、输出 ¥8。`deepseek-v4-flash` 按 `deepseek-flash` 计费。常量是 `worker/src/pricing.js` 里的 `DAILY_CAP_CNY = 0.10`（约 $0.014，按 1 美元 ≈ 7 元，Worker 不做汇率换算）。空闲时段实际更便宜，所以额度会略早用完，而不是超支。

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create USAGE_KV
```

把命令打印的 namespace id 写进 `worker/wrangler.toml` 的 `USAGE_KV`（替换全 0 占位 id）。然后：

```bash
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler deploy
```

`wrangler secret put` 会提示你粘贴 Key，Key 存在 Cloudflare，不会进 git。不要把 Key 写进 `wrangler.toml`、`.dev.vars` 以外的文件、扩展或商店文案。本地调试把 `worker/.dev.vars.example` 复制为 `worker/.dev.vars`（已 gitignore）。

部署完成后：

1. 把 `src/lib/settings.js` 的 `HOSTED_GATEWAY_URL` 改成 Worker 的 origin，例如 `https://hncn-gateway.<account>.workers.dev`，不要带路径，不要带 Key。
2. 把 `manifest.json` 的 `host_permissions` 里 `https://hncn-gateway.example.workers.dev/*` 改成同一个 host 的 `https://<host>/*`。
3. 重新加载扩展。托管请求发往 `HOSTED_GATEWAY_URL/v1/chat/completions`，带 `X-Install-Id`，不带用户 Key。

`GET /health` 可用来确认 Worker 已起来。在替换占位地址之前，不要对外声称有一个可用的公共网关。自备 Key 不经过这个 Worker。

## 本地检查

```bash
npm test
npm run check
```

项目不依赖打包器或第三方运行库，整个目录可以直接作为未打包扩展加载。

## 缓存设计

缓存使用 SHA-256 键：`提示词版本 + 目标语言 + 服务商 + API 地址/模型 + 去除首尾空白的原文`。只有模型完整返回与输入等长的 JSON 翻译数组后才写入缓存；失败请求不会污染缓存。默认保存 30 天、最多 5,000 条，超过容量时优先删除最久未访问的条目。修改目标语言、模型、接口或升级提示词都会自然产生新的缓存空间，不会复用不兼容的旧翻译。

## 收藏数据与容量

收藏、笔记和有限的正文摘录保存在 `chrome.storage.local`，只属于当前浏览器配置文件，不会跨设备同步。Chrome 114+ 的默认本地扩展存储上限为 10 MB；本扩展已声明 `unlimitedStorage`，因此该固定配额不再适用，数据仍会受到设备可用磁盘和浏览器环境的实际限制。收藏页会显示这部分数据当前占用的空间，Markdown / JSON 导出可用于迁移或备份。

只有当你在 AI 抽屉发送问题或点击“AI 整理”时，所选的当前内容或收藏摘要才会直接发送给你配置的模型服务商；收藏与笔记不会发送给扩展开发者。
