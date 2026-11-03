# 隐私政策 · Privacy Policy

**Hacker News AI 阅读助手 / Hacker News AI Reading Assistant**

生效日期 / Effective date: 2026-11-03

---

## 中文

### 概述
扩展有两种翻译方式。

- **托管模式（默认）**：不用粘贴 API Key。浏览器把待翻译文本和一个随机安装标识发给运营者部署的额度网关（Cloudflare Worker），网关再转发到 DeepSeek。DeepSeek Key 只放在网关的密钥里，不在扩展包中。网关按安装、按 UTC 日估算花费，上限约 ¥0.10，并且只把花费计数写入 KV，不保存提示词。仓库中的网关域名是占位符，不表示已经有公开服务在运行。
- **自备 Key**：你粘贴的 API Key、收藏、笔记与翻译缓存仍只保存在本机。请求由浏览器直接发给你选择的模型服务商，不经过额度网关。

### 我们不收集的数据
- 不收集姓名、邮箱等个人身份信息
- 不收集或上传你的浏览记录
- 托管模式不收集、不要求你的模型 API Key
- 无任何遥测、埋点或第三方分析服务。额度网关只为执行每日上限而保存花费计数

### 保存在本机的数据
以下数据通过 `chrome.storage.local` 保存在**你这台浏览器**中，不会同步到 Google 账号。自备的 API Key、收藏、笔记和缓存不会发给开发者。托管模式下，随机 installId 和当次请求文本会发给额度网关（见下表），提示词本身不入库：
- 你选择的模型服务商与模型
- 你选择的目标语言及自定义模型 API 地址
- 你在自备 Key 模式下粘贴的 API Key
- 随机生成的安装标识（installId），用于托管额度，不是 Chrome 扩展 ID，也不是 Google 账号
- 你的偏好设置（关注话题、界面缩放等）
- 你收藏的文章信息、笔记与有限的正文摘录
- 文章、标题与评论的翻译缓存

### 数据的发送去向
自备 Key 时，翻译请求由**你的浏览器直接**发给所选模型服务商。托管模式时，同一类文本先发到额度网关，再由网关转发到 DeepSeek。网关不把提示词写入数据库。

| 数据 | 发送对象 | 目的 |
|---|---|---|
| 待翻译的文本 + 目标语言 + 随机 installId（无用户 API Key） | 额度网关，再转发到 DeepSeek | 托管模式下生成译文并计算当日额度 |
| 待翻译的文本 + 目标语言 + 你的 API Key | 你所选择的模型服务商（OpenAI、Anthropic、DeepSeek、Google Gemini，或你自定义的 OpenAI 兼容接口） | 自备 Key 时生成目标语言译文 |
| 你主动提交的提问 + 所选的当前阅读内容或收藏/笔记摘要 | 托管模式下发给额度网关再转到 DeepSeek；自备 Key 时直接发给所选服务商，并带上你的 API Key | 回答问题或整理收藏概要 |
| 当日估算花费、请求次数和 token 数（不含原文） | 额度网关的 Cloudflare KV | 执行每安装每天约 ¥0.10 的上限 |
| 新闻列表与讨论 | Hacker News 官方 API（Firebase） | 获取 HN 内容 |
| 文章网址 | 你主动点击阅读的新闻源网站 | 抓取正文用于翻译 |

上述数据的处理分别受相应第三方的隐私政策约束：
- OpenAI: https://openai.com/policies/privacy-policy
- Anthropic: https://www.anthropic.com/legal/privacy
- DeepSeek: https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html
- Google: https://policies.google.com/privacy
- Hacker News: https://www.ycombinator.com/legal/

### 权限用途
- **storage / unlimitedStorage**：本地保存设置、自备的 API Key、随机 installId、收藏、笔记与翻译缓存；避免较长笔记和缓存受默认 10 MB 固定配额限制
- **sidePanel**：在浏览器侧边栏展示多语言 AI 阅读器
- **scripting** 与可选的网站访问权限：仅当你主动点击「译当前页」、在侧边栏阅读某篇外链文章，或配置自定义模型 API 地址时，按需申请相应域名权限；用于读取/回填译文或直接调用你填写的模型接口，你可拒绝

### 你的控制权
- 可随时在设置中改用自己的 API Key，或清空 Key 回到托管额度（在网关已部署时）
- 可随时把收藏与笔记导出为 Markdown 或 JSON
- **卸载扩展会立即删除全部本地设置、收藏、笔记与缓存**
- 自备的 API Key 不会离开本机，除非随翻译请求发送给你自己选择的服务商。托管模式没有用户 API Key 可发送

### Chrome Web Store Limited Use
本扩展对用户数据的使用遵守 Chrome Web Store User Data Policy 及其 Limited Use 要求：数据仅用于提供用户明确选择的阅读、翻译、收藏、笔记与 AI 整理功能；不会用于广告、画像、转售或与这些功能无关的用途；开发者及其他人工不会为了阅读内容而查看提示词。托管模式会把当次请求转到 DeepSeek，并保存额度计数。自备 Key 时，数据仅在实现用户主动请求的功能所必需时，发送给用户自行选择的模型服务商或文章来源网站。

### 儿童隐私
本扩展不面向 13 岁以下儿童，也不会有意收集其信息。

### 政策更新
如本政策发生变更，将更新本页顶部的生效日期。

### 联系方式
- GitHub Issues: https://github.com/Santiago0412/HackerNewsCN/issues
- 邮箱 / Email: `wupengfa007@gmail.com`

---

## English

### Overview
The extension has two translation modes.

- **Hosted mode (default):** you do not paste an API key. The browser sends the text and a random install id to the operator's quota gateway (a Cloudflare Worker). The Worker forwards the request to DeepSeek. The DeepSeek key stays in a Worker secret and is not in the extension package. The Worker estimates spend per install per UTC day, caps it at about ¥0.10, and stores only that counter in KV. It does not store prompt text. The gateway host in this repository is a placeholder, not a claim that a public service is already running.
- **Your own key:** the API key you paste, plus bookmarks, notes, and the translation cache, stay on your device. The browser calls the provider you choose directly and does not use the gateway.

### Data we do NOT collect
- No personally identifiable information (name, email, etc.)
- No browsing history collection or upload
- Hosted mode does not ask for or collect your model API key
- No telemetry, tracking, or third-party analytics. The gateway stores spend counters only to enforce the daily cap

### Data stored locally
The following is stored via `chrome.storage.local` **on your device only**. It is not synced to your Google account. An API key you paste, plus bookmarks, notes, and the cache, are not sent to the developer. In hosted mode the random install id and the current request text are sent to the quota gateway (see the table below). Prompt text is not stored:
- Your selected model provider and model
- Your selected target language and custom model API endpoint
- The API key you paste when you choose to use your own key
- A random install id used for the hosted quota. It is not the Chrome extension id and not a Google account
- Your preferences (followed topics, UI scale, etc.)
- Your saved article metadata, notes, and limited article excerpts
- Cached translations of articles, titles, and comments

### Where data is sent
With your own key, translation requests go **directly from your browser** to the provider you choose. In hosted mode, the same kind of text goes to the quota gateway first and is then forwarded to DeepSeek. The gateway does not write prompts to a database.

| Data | Recipient | Purpose |
|---|---|---|
| Text to translate + target language + random install id (no user API key) | The quota gateway, then DeepSeek | Produce a translation and count the day's hosted spend |
| Text to translate + target language + your API key | The model provider you choose (OpenAI, Anthropic, DeepSeek, Google Gemini, or your own OpenAI-compatible endpoint) | Produce a translation when you use your own key |
| Questions you submit + the selected reading content or bookmark/note summary | The quota gateway and then DeepSeek in hosted mode; your chosen provider, with your API key, when you bring your own key | Answer a question or organize saved reading |
| Estimated daily spend, request count, and token totals (not the source text) | The gateway's Cloudflare KV | Enforce the per-install cap of about ¥0.10 per UTC day |
| News lists and threads | Hacker News official API (Firebase) | Fetch HN content |
| Article URL | The news source website you actively open | Fetch article body for translation |

This data is governed by the respective third parties' privacy policies (linked in the Chinese section above).

### Permissions
- **storage / unlimitedStorage**: store settings, an optional API key, the random install id, bookmarks, notes, and translation cache locally without the fixed default 10 MB quota
- **sidePanel**: show the multilingual AI reader in the browser side panel
- **scripting** and optional host access: requested only when you translate the current page, open an external article in the side panel, or configure a custom model API endpoint; used to read/inject translations or call the endpoint you entered, and may be refused

### Your control
- Switch to your own API key at any time in Settings, or clear it to return to the hosted quota once a gateway is deployed
- Export bookmarks and notes as Markdown or JSON at any time
- **Uninstalling the extension immediately deletes all local settings, bookmarks, notes, and cache**
- An API key you paste never leaves your device except when sent, with a request, to the provider you selected. Hosted mode has no user API key to send

### Chrome Web Store Limited Use
This extension's use of user data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide the reading, translation, bookmarking, note-taking, and AI organization features explicitly selected by the user. It is not used for advertising, profiling, resale, or unrelated purposes, and prompts are not kept for human review. Hosted mode forwards the current request to DeepSeek and stores a spend counter. With your own key, data is transferred only when necessary to fulfill a user-initiated request, to the model provider or article source you selected.

### Children's privacy
This extension is not directed to children under 13 and does not knowingly collect their data.

### Changes
Any changes will be reflected by updating the effective date at the top of this page.

### Contact
- GitHub Issues: https://github.com/Santiago0412/HackerNewsCN/issues
- Email: `wupengfa007@gmail.com`
