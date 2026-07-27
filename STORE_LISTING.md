# Chrome Web Store 上架资料

> 提交前请把 `<...>` 占位符替换成你的真实信息。开发者后台的表单以英文为主，下方每项都给了中英两版，按字段直接粘贴。

---

## 1. 基本信息

| 字段 | 值 |
|---|---|
| 默认名称 Default name | Hacker News AI Reading Assistant |
| 简体中文名称 | Hacker News AI 阅读助手 |
| 分类 Category | Productivity（生产力工具）|
| 默认语言 Default locale | English (`en`) |
| 包内 locales | `en`, `zh_CN`, `zh_TW`, `ja`, `ko`, `es`, `fr`, `de`, `pt_BR`, `ru`, `ar` |
| 隐私政策 URL | `https://github.com/Santiago0412/HackerNewsCN/blob/main/PRIVACY.md` |

> 隐私政策 URL 必须公开可访问。用仓库里的 `PRIVACY.md` 即可；若想要更正式的地址，可开启 GitHub Pages 后指向 `https://santiago0412.github.io/HackerNewsCN/privacy`。

### 商店多语言填写方式

- 不要把多种语言放进同一个 Description 字段。
- 开发者后台 Store listing 顶部按语言切换，每种语言分别填写名称、简短描述、详细描述和对应截图。
- 语言下拉项来自扩展包内 `_locales/<locale>/messages.json`；未单独填写的商店语言回退到默认英文版本。
- 扩展默认面向 Chrome Web Store 支持的所有地区；只有确实需要限制国家或地区时，才在 Distribution 单独调整。
- 首发先完整维护 `en` 与 `zh_CN` 两套商店详情；其他 locale 已在包内提供本地化名称、简介和操作提示，可再逐步补齐详情与截图。

---

## 2. 简短描述 Short description（上限 132 字符）

**中文：**
```
用你自己的大模型 API 在侧边栏阅读、收藏、记笔记并整理 Hacker News。数据只存本地，可随时导出。
```

**English:**
```
Read, save, annotate, and organize Hacker News with your own LLM API key. Local-first and exportable.
```

---

## 3. 详细描述 Detailed description

**中文：**
```
Hacker News AI 阅读助手是一个无需注册、无需账号的浏览器扩展。你可以选择目标语言，并用自己的大模型 API Key 阅读和整理 Hacker News。Key 只保存在你本机，不经过开发者服务器。

主要功能
• 侧边栏阅读：点击图标即可在侧边栏浏览热门、最新、最佳、问答、作品，无需先打开 HN 网页
• 多语言翻译：可选择简繁中文、英语、日语、韩语、西班牙语等目标语言，也可输入其他语言
• 标题翻译：自动或手动批量翻译标题，可一键切换译文与原文
• 讨论翻译：在内置阅读器直接查看并翻译热门评论，保留可折叠原文
• 正文翻译：点击外链新闻时抓取正文并分段翻译，采用杂志式阅读排版
• 译当前页：把你正在看的任意网页正文翻译成所选目标语言并就地显示
• 收藏与笔记：每条新闻一键收藏，在独立收藏页管理阅读笔记
• 随时问 AI：浮动入口可针对当前内容提问，也可按主题整理全部收藏与笔记
• 随时导出：收藏与笔记可导出为 Markdown 或 JSON
• 兴趣过滤：「关注」标签按人工智能、编程、创业、安全、科学、硬件、设计、文化等话题突出内容
• 多服务商：OpenAI、Anthropic、DeepSeek、Google Gemini 自动配置 API 地址；选择“其他”时可填写 OpenAI 兼容 API 地址与模型名
• 亮色 / 暗色主题，跟随系统
• 本地缓存翻译结果，避免重复消耗额度

隐私优先
• 无后台服务器，开发者不收集任何数据
• API Key 只写入本机 chrome.storage.local，仅随翻译请求直接发送给你选择的模型服务商
• 收藏、笔记和有限正文摘录也只保存在本机，不同步到 Google 账号
• 只有你主动提问或点击“AI 整理”时，所选内容才会发给你配置的模型服务商
• 卸载扩展即清除全部本地设置、收藏、笔记与缓存
```

**English:**
```
Hacker News AI Reading Assistant is a no-account browser extension for reading and organizing Hacker News in your chosen target language using your own LLM API key. Your key stays on your device and never passes through the developer's server.

Features
• Side-panel reading: browse Top, New, Best, Ask, and Show without opening the HN site first
• Target languages: choose Simplified or Traditional Chinese, English, Japanese, Korean, Spanish, and more, or enter another language
• Title translation: auto or manual batch translation with a one-tap translation/original toggle
• Thread translation: read and translate top comments in the built-in reader, with collapsible originals
• Article translation: fetches and translates linked articles in a clean magazine-style reader
• Translate this page: translate the body of any page you're viewing into the selected language, in place
• Bookmarks and notes: save any story and manage reading notes in a dedicated library
• Ask AI anywhere: use the floating assistant for the current content or organize saved reading by topic
• Export anytime: download bookmarks and notes as Markdown or JSON
• Interest filter: a "Following" tab surfaces AI, programming, startups, security, science, hardware, design, and culture
• Providers: automatic API endpoints for OpenAI, Anthropic, DeepSeek, and Google Gemini; custom endpoint and model fields for OpenAI-compatible services
• Light / dark theme, follows the system
• Local translation cache to avoid spending quota twice

Privacy first
• No backend server; the developer collects nothing
• Your API key is stored only in local chrome.storage.local and sent directly to your chosen provider with translation requests
• Bookmarks, notes, and limited excerpts stay local and do not sync to your Google account
• Selected content is sent to your model provider only when you ask a question or request AI organization
• Uninstalling removes all local settings, bookmarks, notes, and cache
```

---

## 4. 单一用途声明 Single purpose

```
Help users read, translate, save, annotate, and organize Hacker News content — and web pages they explicitly open — using their own LLM API key.
```

---

## 5. 权限理由 Permission justifications
> 后台会逐项要求填写「为什么需要该权限」。直接粘贴对应英文。

| 权限 Permission | 理由 Justification |
|---|---|
| `storage` | Store the user's model choice, API key, preferences, bookmarks, notes, and translation cache locally. |
| `unlimitedStorage` | Store translation caches, bookmarks, notes, and limited excerpts locally without the fixed default 10 MB quota. |
| `sidePanel` | The extension's entire reading UI runs in the browser side panel. |
| `scripting` | Inject translations in the selected target language back into the current tab when the user clicks "Translate this page." |
| Host permission — `hacker-news.firebaseio.com` | Fetch Hacker News stories, threads, and comments (official HN API). |
| Host permissions — `api.openai.com`, `api.anthropic.com`, `api.deepseek.com`, `generativelanguage.googleapis.com` | Send text to the mainstream LLM provider selected by the user to obtain translations in the selected target language. |
| Optional host permission — `https://*/*`, `http://*/*` | Requested on demand for the exact relevant origin when the user reads a linked article, translates the current page, or configures a custom model API endpoint. Used to fetch selected page text or call the endpoint the user entered. Not requested at install time. |

---

## 6. 远程代码 Remote code

后台会问 "Are you using remote code?" —— **选择 "No, I am not using remote code."**

理由：扩展不下载或 `eval` 任何外部脚本；它只**读取网页的 HTML 文本**用于翻译。后台渲染标签页加载的是用户主动选择的真实网页（等同正常浏览），不属于执行开发者的远程代码。

---

## 7. 数据使用声明 Data usage（Privacy practices 页勾选）

- 本扩展**收集/处理**的数据类型：
  - `Website content`：用户主动读取或翻译的网页正文
  - `Authentication information`：用户提供的模型 API Key，仅本地保存，并只发送给对应模型服务商进行鉴权
  - `Personal communications` / `User-generated content`：用户主动输入的 AI 问题与阅读笔记；笔记默认仅本地保存，问题及所选上下文仅在用户发送或点击“AI 整理”时传给所选模型服务商
- 勾选三项合规声明：
  - ✅ 不将数据出售或转让给第三方（用户核心功能所需的传输除外）
  - ✅ 不将数据用于与单一用途无关的目的
  - ✅ 不用于判定信用或放贷
- 说明文字（可填入 "How is this data used"）：
```
API keys, bookmarks, notes, and preferences are stored locally and never sent to the developer. Text is sent only to the user-selected LLM provider to produce translations or answer a question the user explicitly submits. Bookmark and note summaries are sent only when the user asks the assistant to organize saved reading. Web page content is fetched only for pages the user actively opens. No data is collected on any developer server.
```

> 如果后台当前只显示 `Personal communications` 而没有单独的 `User-generated content`，勾选 `Personal communications`；若两项都显示，则两项都勾选。Google 要求本机处理的数据也必须披露。

---

## 8. 素材清单 Assets checklist

- [x] 图标 128×128（`assets/icon-128.png`）
- [ ] 截图 1280×800 或 640×400，至少 1 张（建议：① 侧边栏多语言标题 ②文章阅读器译文 ③目标语言与自定义模型设置页 ④暗色主题）
- [ ] 小宣传图 440×280（可选，能提升展示位）
- [ ] 隐私政策 URL 已上线可访问

---

## 9. 提交流程速记

1. `npm run pack` 生成 `hncn-extension.zip`
2. 开发者后台 → 新建项目 → 上传 zip
3. 填写以上 1–7 各项 + 上传截图
4. 提交审核（含宽泛 host 权限，通常数天至 1–2 周）
5. 想稳妥可先设为 Unlisted 验证通过后再公开
