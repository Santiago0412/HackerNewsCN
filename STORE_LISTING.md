# Chrome Web Store 上架资料

> 提交前请把 `<...>` 占位符替换成你的真实信息。开发者后台的表单以英文为主，下方每项都给了中英两版，按字段直接粘贴。

---

## 1. 基本信息

| 字段 | 值 |
|---|---|
| 名称 Name | Hacker News 中文助手 |
| 分类 Category | Productivity（生产力工具）|
| 语言 Language | 简体中文（可再添加 English）|
| 隐私政策 URL | `https://github.com/Santiago0412/HackerNewsCN/blob/main/PRIVACY.md` |

> 隐私政策 URL 必须公开可访问。用仓库里的 `PRIVACY.md` 即可；若想要更正式的地址，可开启 GitHub Pages 后指向 `https://santiago0412.github.io/HackerNewsCN/privacy`。

---

## 2. 简短描述 Short description（上限 132 字符）

**中文：**
```
用你自己的大模型 API 在侧边栏翻译 Hacker News 标题、评论与正文，并按兴趣突出内容。数据只存本地。
```

**English:**
```
Read Hacker News in Chinese: translate titles, comments, and articles with your own LLM API key. All data stays local.
```

---

## 3. 详细描述 Detailed description

**中文：**
```
Hacker News 中文助手是一个无需注册、无需账号的浏览器扩展。它用你自己的大模型 API Key 把 Hacker News 翻译成中文，Key 只保存在你本机，不经过任何第三方服务器。

主要功能
• 侧边栏阅读：点击图标即可在侧边栏浏览热门、最新、最佳、问答、作品，无需先打开 HN 网页
• 标题翻译：自动或手动批量翻译标题，可一键切换中英文
• 讨论翻译：在内置阅读器直接查看并翻译热门评论，保留可折叠英文原文
• 正文翻译：点击外链新闻时抓取正文并分段翻译，采用杂志式阅读排版
• 译当前页：把你正在看的任意网页正文翻译成中文并就地显示
• 兴趣过滤：「关注」标签按人工智能、编程、创业、安全、科学、硬件、设计、文化等话题突出内容
• 多服务商：支持 OpenAI、Anthropic、DeepSeek、Google Gemini，以及 OpenAI 兼容接口
• 亮色 / 暗色主题，跟随系统
• 本地缓存翻译结果，避免重复消耗额度

隐私优先
• 无后台服务器，开发者不收集任何数据
• API Key 只写入本机 chrome.storage.local，仅随翻译请求直接发送给你选择的模型服务商
• 卸载扩展即清除全部本地设置与缓存
```

**English:**
```
Hacker News Chinese Assistant is a no-account browser extension that translates Hacker News into Chinese using your own LLM API key. Your key stays on your device and never passes through any third-party server.

Features
• Side-panel reading: browse Top, New, Best, Ask, and Show without opening the HN site first
• Title translation: auto or manual batch translation with one-tap English/Chinese toggle
• Thread translation: read and translate top comments in the built-in reader, with collapsible English originals
• Article translation: fetches and translates linked articles in a clean magazine-style reader
• Translate this page: translate the body of any page you're viewing, in place
• Interest filter: a "Following" tab surfaces AI, programming, startups, security, science, hardware, design, and culture
• Providers: OpenAI, Anthropic, DeepSeek, Google Gemini, and OpenAI-compatible endpoints
• Light / dark theme, follows the system
• Local translation cache to avoid spending quota twice

Privacy first
• No backend server; the developer collects nothing
• Your API key is stored only in local chrome.storage.local and sent directly to your chosen provider with translation requests
• Uninstalling removes all local settings and cache
```

---

## 4. 单一用途声明 Single purpose

```
Translate Hacker News content — and web pages the user explicitly opens — into Chinese, using the user's own LLM API key.
```

---

## 5. 权限理由 Permission justifications
> 后台会逐项要求填写「为什么需要该权限」。直接粘贴对应英文。

| 权限 Permission | 理由 Justification |
|---|---|
| `storage` | Store the user's model choice, API key, and preferences locally. |
| `unlimitedStorage` | Cache article/comment translations locally; the cache can exceed the default 5 MB quota. |
| `sidePanel` | The extension's entire reading UI runs in the browser side panel. |
| `scripting` | Inject Chinese translations back into the current tab when the user clicks "Translate this page." |
| Host permission — `hacker-news.firebaseio.com` | Fetch Hacker News stories, threads, and comments (official HN API). |
| Host permissions — `api.openai.com`, `api.anthropic.com`, `api.deepseek.com`, `generativelanguage.googleapis.com` | Send text to the LLM provider the user selected to obtain Chinese translations. |
| Optional host permission — `https://*/*`, `http://*/*` | Requested on demand, only when the user chooses to read a linked article or translate the current page, to fetch and translate that page's text. Not requested at install time. |

---

## 6. 远程代码 Remote code

后台会问 "Are you using remote code?" —— **选择 "No, I am not using remote code."**

理由：扩展不下载或 `eval` 任何外部脚本；它只**读取网页的 HTML 文本**用于翻译。后台渲染标签页加载的是用户主动选择的真实网页（等同正常浏览），不属于执行开发者的远程代码。

---

## 7. 数据使用声明 Data usage（Privacy practices 页勾选）

- 本扩展**收集/处理**的数据类型：`Website content`（网页正文，用于翻译）+ 用户提供的 `Authentication information`（API Key，仅本地保存）
- 勾选三项合规声明：
  - ✅ 不将数据出售或转让给第三方（用户核心功能所需的传输除外）
  - ✅ 不将数据用于与单一用途无关的目的
  - ✅ 不用于判定信用或放贷
- 说明文字（可填入 "How is this data used"）：
```
API keys and preferences are stored locally and never sent to the developer. Text is sent only to the user-selected LLM provider to produce translations. Web page content is fetched only for pages the user actively opens, solely to translate them. No data is collected on any developer server.
```

---

## 8. 素材清单 Assets checklist

- [x] 图标 128×128（`assets/icon-128.png`）
- [ ] 截图 1280×800 或 640×400，至少 1 张（建议：① 侧边栏新闻列表中文标题 ②文章阅读器译文 ③设置页 ④暗色主题）
- [ ] 小宣传图 440×280（可选，能提升展示位）
- [ ] 隐私政策 URL 已上线可访问

---

## 9. 提交流程速记

1. `npm run pack` 生成 `hncn-extension.zip`
2. 开发者后台 → 新建项目 → 上传 zip
3. 填写以上 1–7 各项 + 上传截图
4. 提交审核（含宽泛 host 权限，通常数天至 1–2 周）
5. 想稳妥可先设为 Unlisted 验证通过后再公开
