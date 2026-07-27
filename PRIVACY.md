# 隐私政策 · Privacy Policy

**Hacker News AI 阅读助手 / Hacker News AI Reading Assistant**

生效日期 / Effective date: 2026-07-27

---

## 中文

### 概述
本扩展**没有任何后台服务器**，开发者**不收集、不存储、不上传**你的任何个人数据。所有设置、API Key、收藏、笔记与翻译缓存仅保存在你本机的浏览器中。

### 我们不收集的数据
- 不收集姓名、邮箱等个人身份信息
- 不收集或上传你的浏览记录
- 无任何遥测、埋点或第三方分析服务

### 保存在本机的数据
以下数据仅通过 `chrome.storage.local` 保存在**你这台浏览器**中，不会同步到 Google 账号，也不会发送给开发者：
- 你选择的模型服务商与模型
- 你选择的目标语言及自定义模型 API 地址
- 你粘贴的 API Key
- 你的偏好设置（关注话题、界面缩放等）
- 你收藏的文章信息、笔记与有限的正文摘录
- 文章、标题与评论的翻译缓存

### 数据的发送去向
翻译与阅读功能需要由**你的浏览器直接**向以下方发起请求，开发者不经手、不留存这些数据：

| 数据 | 发送对象 | 目的 |
|---|---|---|
| 待翻译的文本 + 目标语言 + 你的 API Key | 你所选择的模型服务商（OpenAI、Anthropic、DeepSeek、Google Gemini，或你自定义的 OpenAI 兼容接口） | 生成目标语言译文 |
| 你主动提交的提问 + 所选的当前阅读内容或收藏/笔记摘要 + 你的 API Key | 你所选择的模型服务商 | 回答问题或整理收藏概要 |
| 新闻列表与讨论 | Hacker News 官方 API（Firebase） | 获取 HN 内容 |
| 文章网址 | 你主动点击阅读的新闻源网站 | 抓取正文用于翻译 |

上述数据的处理分别受相应第三方的隐私政策约束：
- OpenAI: https://openai.com/policies/privacy-policy
- Anthropic: https://www.anthropic.com/legal/privacy
- DeepSeek: https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html
- Google: https://policies.google.com/privacy
- Hacker News: https://www.ycombinator.com/legal/

### 权限用途
- **storage / unlimitedStorage**：本地保存设置、API Key、收藏、笔记与翻译缓存；避免较长笔记和缓存受默认 10 MB 固定配额限制
- **sidePanel**：在浏览器侧边栏展示多语言 AI 阅读器
- **scripting** 与可选的网站访问权限：仅当你主动点击「译当前页」、在侧边栏阅读某篇外链文章，或配置自定义模型 API 地址时，按需申请相应域名权限；用于读取/回填译文或直接调用你填写的模型接口，你可拒绝

### 你的控制权
- 可随时在设置中修改或清空 API Key
- 可随时把收藏与笔记导出为 Markdown 或 JSON
- **卸载扩展会立即删除全部本地设置、收藏、笔记与缓存**
- API Key 不会离开本机，除非随翻译请求发送给你自己选择的服务商

### Chrome Web Store Limited Use
本扩展对用户数据的使用遵守 Chrome Web Store User Data Policy 及其 Limited Use 要求：数据仅用于提供用户明确选择的阅读、翻译、收藏、笔记与 AI 整理功能；不会用于广告、画像、转售或与这些功能无关的用途；开发者及其他人工不会读取用户数据。数据仅在实现用户主动请求的功能所必需时，发送给用户自行选择的模型服务商或文章来源网站。

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
This extension has **no backend server**. The developer does **not collect, store, or transmit** any of your personal data. All settings, API keys, bookmarks, notes, and translation caches are stored **only in your local browser**.

### Data we do NOT collect
- No personally identifiable information (name, email, etc.)
- No browsing history collection or upload
- No telemetry, tracking, or third-party analytics

### Data stored locally
The following is stored via `chrome.storage.local` **on your device only**. It is not synced to your Google account and is never sent to the developer:
- Your selected model provider and model
- Your selected target language and custom model API endpoint
- The API key you paste
- Your preferences (followed topics, UI scale, etc.)
- Your saved article metadata, notes, and limited article excerpts
- Cached translations of articles, titles, and comments

### Where data is sent
Translation and reading features make requests **directly from your browser** to the parties below. The developer never handles or retains this data:

| Data | Recipient | Purpose |
|---|---|---|
| Text to translate + target language + your API key | The model provider you choose (OpenAI, Anthropic, DeepSeek, Google Gemini, or your own OpenAI-compatible endpoint) | Produce translations in the selected language |
| Questions you submit + the selected reading content or bookmark/note summary + your API key | Your chosen model provider | Answer questions or organize your saved reading |
| News lists and threads | Hacker News official API (Firebase) | Fetch HN content |
| Article URL | The news source website you actively open | Fetch article body for translation |

This data is governed by the respective third parties' privacy policies (linked in the Chinese section above).

### Permissions
- **storage / unlimitedStorage**: store settings, API key, bookmarks, notes, and translation cache locally without the fixed default 10 MB quota
- **sidePanel**: show the multilingual AI reader in the browser side panel
- **scripting** and optional host access: requested only when you translate the current page, open an external article in the side panel, or configure a custom model API endpoint; used to read/inject translations or call the endpoint you entered, and may be refused

### Your control
- Change or clear your API key at any time in Settings
- Export bookmarks and notes as Markdown or JSON at any time
- **Uninstalling the extension immediately deletes all local settings, bookmarks, notes, and cache**
- Your API key never leaves your device except when sent, with a translation request, to the provider you selected

### Chrome Web Store Limited Use
This extension's use of user data complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide the reading, translation, bookmarking, note-taking, and AI organization features explicitly selected by the user. It is not used for advertising, profiling, resale, or unrelated purposes, and is not made available for human review by the developer or others. Data is transferred only when necessary to fulfill a user-initiated request, to the model provider or article source selected by the user.

### Children's privacy
This extension is not directed to children under 13 and does not knowingly collect their data.

### Changes
Any changes will be reflected by updating the effective date at the top of this page.

### Contact
- GitHub Issues: https://github.com/Santiago0412/HackerNewsCN/issues
- Email: `wupengfa007@gmail.com`
