import { articlePageNeedsInteraction } from "./lib/article.js";

const API = "https://hacker-news.firebaseio.com/v0";
const PAGE_SIZE = 20;
const COMMENT_LIMIT = 10;
const TRANSLATION_CONCURRENCY = 3;
const DEFAULT_UI_SCALE = 1.1;
const MIN_UI_SCALE = 0.9;
const MAX_UI_SCALE = 1.5;
const MODEL_CHOICES = [
  { provider: "openai", model: "gpt-5-mini", label: "OpenAI · GPT-5 mini", keyUrl: "https://platform.openai.com/api-keys", keySite: "OpenAI Platform" },
  { provider: "anthropic", model: "claude-haiku-4-5", label: "Anthropic · Claude Haiku 4.5", keyUrl: "https://console.anthropic.com/settings/keys", keySite: "Claude Console" },
  { provider: "deepseek", model: "deepseek-v4-flash", label: "DeepSeek · V4 Flash", keyUrl: "https://platform.deepseek.com/api_keys", keySite: "DeepSeek 开放平台" },
  { provider: "gemini", model: "gemini-3.1-flash-lite", label: "Google · Gemini 3.1 Flash-Lite", keyUrl: "https://aistudio.google.com/app/apikey", keySite: "Google AI Studio" }
];
const TOPIC_LABELS = { ai: "人工智能", programming: "编程开发", startup: "创业商业", security: "安全隐私", science: "科学研究", hardware: "硬件设备", design: "设计体验", culture: "文化社会" };
const TOPICS = {
  ai: ["ai", "llm", "gpt", "model", "machine learning", "neural", "agent", "openai", "anthropic"],
  programming: ["programming", "developer", "code", "compiler", "javascript", "python", "rust", "golang", "database", "api"],
  startup: ["startup", "founder", "funding", "venture", "business", "launch", "acquisition", "revenue"],
  security: ["security", "privacy", "vulnerability", "malware", "breach", "encryption", "attack", "cve"],
  science: ["science", "research", "physics", "biology", "space", "climate", "mathematics", "quantum"],
  hardware: ["hardware", "chip", "cpu", "gpu", "semiconductor", "raspberry pi", "robot", "device"],
  design: ["design", "ui", "ux", "typography", "css", "visual", "interface"],
  culture: ["history", "book", "music", "culture", "society", "education", "language"]
};

let settings = {};
let activeFeed = "topstories";
let stories = [];
let progressRun = 0;
let uiScale = DEFAULT_UI_SCALE;
let currentPageLabelTimer;
const listScrollPositions = new Map();
const $ = (id) => document.getElementById(id);

init();

async function init() {
  const stored = await chrome.storage.local.get(["settings", "uiScale"]);
  settings = stored.settings || {};
  uiScale = normalizeUiScale(stored.uiScale);
  applyUiScale();
  bindEvents();
  buildOnboarding();
  if (!settings.setupCompleted) {
    showOnboarding();
    return;
  }
  await loadFeed();
}

function bindEvents() {
  document.addEventListener("keydown", handleZoomShortcut, true);
  $("translateCurrentPage").addEventListener("click", translateCurrentPage);
  $("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("main").addEventListener("scroll", updateHeaderVisibility, { passive: true });
  $("refresh").addEventListener("click", () => loadFeed(true, true));
  $("back").addEventListener("click", () => showList());
  $("articleBack").addEventListener("click", () => showList());
  $("onboardingModel").addEventListener("change", updateOnboardingGuide);
  $("startReading").addEventListener("click", completeOnboarding);
  $("feeds").addEventListener("click", (event) => {
    const feed = event.target.dataset.feed;
    if (!feed || feed === activeFeed) return;
    listScrollPositions.set(activeFeed, $("main").scrollTop);
    activeFeed = feed;
    document.querySelectorAll("#feeds button").forEach((button) => button.classList.toggle("active", button === event.target));
    loadFeed();
  });
}

function handleZoomShortcut(event) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
  let nextScale;
  if (event.key === "+" || event.key === "=") nextScale = uiScale + 0.1;
  else if (event.key === "-" || event.key === "_") nextScale = uiScale - 0.1;
  else if (event.key === "0") nextScale = DEFAULT_UI_SCALE;
  else return;
  event.preventDefault();
  event.stopPropagation();
  uiScale = normalizeUiScale(nextScale);
  applyUiScale();
  chrome.storage.local.set({ uiScale }).catch(() => {});
}

function normalizeUiScale(value) {
  const scale = Number(value);
  if (!Number.isFinite(scale)) return DEFAULT_UI_SCALE;
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, Math.round(scale * 10) / 10));
}

function applyUiScale() {
  const rootStyle = document.documentElement.style;
  const inversePercentage = `${100 / uiScale}%`;
  rootStyle.setProperty("--ui-scale", String(uiScale));
  rootStyle.setProperty("--ui-viewport-height", `${100 / uiScale}vh`);
  rootStyle.setProperty("--ui-viewport-width", inversePercentage);
}

function updateHeaderVisibility() {
  document.body.classList.toggle("content-scrolled", $("main").scrollTop > 24);
}

function buildOnboarding() {
  MODEL_CHOICES.forEach((choice, index) => $("onboardingModel").add(new Option(choice.label, String(index))));
  const selected = MODEL_CHOICES.findIndex((choice) => choice.provider === settings.provider && choice.model === settings.model);
  $("onboardingModel").value = String(selected >= 0 ? selected : 0);
  $("onboardingKey").value = settings.apiKey || "";
  for (const [value, label] of Object.entries(TOPIC_LABELS)) {
    const node = document.createElement("label");
    node.innerHTML = `<input type="checkbox" value="${value}"><span>${label}</span>`;
    node.querySelector("input").checked = settings.topics?.includes(value) || false;
    $("onboardingTopics").append(node);
  }
  updateOnboardingGuide();
}

function updateOnboardingGuide() {
  const choice = MODEL_CHOICES[Number($("onboardingModel").value)] || MODEL_CHOICES[0];
  $("onboardingGuide").innerHTML = `没有 Key？<a href="${choice.keyUrl}" target="_blank" rel="noreferrer">打开 ${choice.keySite} 创建</a>，复制后粘贴到下面。`;
}

function showOnboarding() {
  $("onboarding").hidden = false;
  $("feeds").hidden = true;
  $("stories").hidden = true;
  $("loading").hidden = true;
  $("refresh").closest("footer").hidden = true;
}

async function completeOnboarding() {
  const apiKey = $("onboardingKey").value.trim();
  if (!apiKey) return setOnboardingError("请先粘贴 API Key");
  if (!/^[\x21-\x7E]+$/.test(apiKey)) return setOnboardingError("Key 中包含中文、空格或全角符号。请回到服务商页面，重新复制原始 Key。不要粘贴“API Key：”等说明文字。");
  const choice = MODEL_CHOICES[Number($("onboardingModel").value)] || MODEL_CHOICES[0];
  settings = {
    ...settings,
    provider: choice.provider,
    model: choice.model,
    apiKey,
    topics: [...document.querySelectorAll('#onboardingTopics input:checked')].map((input) => input.value),
    topicMode: "favorites",
    autoTranslateTitles: true,
    showOriginal: true,
    cacheDays: Number(settings.cacheDays) || 30,
    maxCacheEntries: Number(settings.maxCacheEntries) || 5000,
    setupCompleted: true
  };
  await chrome.storage.local.set({ settings });
  $("onboarding").hidden = true;
  $("feeds").hidden = false;
  $("stories").hidden = false;
  $("refresh").closest("footer").hidden = false;
  await loadFeed();
}

function setOnboardingError(message) {
  $("onboardingError").textContent = message;
}

async function loadFeed(force = false, preserveScroll = false) {
  if (preserveScroll && !$("stories").hidden) listScrollPositions.set(activeFeed, $("main").scrollTop);
  showList(preserveScroll);
  setLoading(true, "正在获取 Hacker News…");
  setNotice("");
  try {
    if (activeFeed === "favorites" && !settings.topics?.length) {
      stories = [];
      renderStories();
      setNotice("还没有选择关注话题。点击右上角设置，选择后会显示在这里。", "setup");
      $("updated").textContent = "";
      return;
    }
    const sourceFeed = activeFeed === "favorites" ? "topstories" : activeFeed;
    const fetchCount = activeFeed === "favorites" ? 80 : PAGE_SIZE;
    const cacheKey = `feed:${sourceFeed}:${fetchCount}`;
    const cached = await chrome.storage.local.get(cacheKey);
    const fresh = !force && cached[cacheKey] && Date.now() - cached[cacheKey].savedAt < 300000;
    if (fresh) {
      stories = cached[cacheKey].stories;
    } else {
      const ids = await fetchJson(`${API}/${sourceFeed}.json`);
      const items = await Promise.all(ids.slice(0, fetchCount).map((id) => fetchJson(`${API}/item/${id}.json`)));
      stories = items.filter((item) => item && !item.deleted && !item.dead);
      await chrome.storage.local.set({ [cacheKey]: { savedAt: Date.now(), stories } });
    }
    if (activeFeed === "favorites") stories = stories.filter((story) => matchesTopics(story.title)).slice(0, PAGE_SIZE);
    renderStories();
    if (activeFeed === "favorites" && !stories.length) setNotice("当前热门新闻里暂时没有匹配关注话题的内容。", "setup");
    if (settings.apiKey) await translateStoryTitles();
    else setNotice("选择模型并填写 API Key 后，标题会自动显示中文。", "setup");
    $("updated").textContent = fresh ? "使用 5 分钟内缓存" : `更新于 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    setNotice(`获取新闻失败：${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

function renderStories() {
  $("stories").replaceChildren();
  stories.forEach((story, index) => {
    const item = document.createElement("li");
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = `${index + 1}.`;
    const content = document.createElement("div");
    content.className = "story-content";
    const title = document.createElement("a");
    title.className = "story-title";
    title.href = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    title.textContent = story.title;
    title.dataset.storyId = story.id;
    title.addEventListener("click", (event) => {
      event.preventDefault();
      story.url ? openArticle(story) : openDiscussion(story);
    });
    const original = document.createElement("span");
    original.className = "original-title";
    original.textContent = story.title;
    original.hidden = true;
    const meta = document.createElement("div");
    meta.className = "meta";
    const domain = story.url ? safeDomain(story.url) : "news.ycombinator.com";
    meta.innerHTML = `<span>${story.score || 0} 分</span><span>${escapeText(story.by || "")}</span><span>${relativeTime(story.time)}</span><span>${escapeText(domain)}</span>`;
    const discussion = document.createElement("button");
    discussion.className = "discussion-button";
    discussion.textContent = `${story.descendants || 0} 条讨论`;
    discussion.addEventListener("click", () => openDiscussion(story));
    meta.append(discussion);
    content.append(title, original, meta);
    item.append(rank, content);
    $("stories").append(item);
  });
}

async function translateStoryTitles() {
  const titles = stories.map((story) => story.title);
  try {
    const translations = await translateWithProgress(titles, "正在翻译新闻标题", 5);
    translations.forEach((translated, index) => {
      const link = document.querySelector(`[data-story-id="${stories[index].id}"]`);
      if (!link) return;
      link.textContent = translated;
      link.nextElementSibling.hidden = false;
    });
  } catch (error) {
    setNotice(`翻译暂时失败，已显示英文：${error.message}`, "error");
  }
}

async function openDiscussion(story) {
  enterDetailView();
  $("stories").hidden = true;
  $("discussion").hidden = false;
  $("feeds").hidden = true;
  $("discussionStory").replaceChildren();
  const title = document.createElement("h1");
  title.textContent = document.querySelector(`[data-story-id="${story.id}"]`)?.textContent || story.title;
  $("discussionStory").append(title);
  const storyText = story.text ? htmlToText(story.text) : "";
  let storyBody = null;
  if (story.text) {
    storyBody = document.createElement("p");
    storyBody.textContent = storyText;
    $("discussionStory").append(storyBody);
  }
  $("comments").replaceChildren();
  setLoading(true, "正在获取讨论…");
  try {
    const comments = await fetchComments(story.kids || []);
    if (!comments.length) $("comments").textContent = "暂时没有讨论。";
    else comments.forEach((comment) => renderComment(comment, htmlToText(comment.text || "")));
    if (settings.apiKey && (storyText || comments.length)) {
      const inputs = [...(storyText ? [storyText] : []), ...comments.map((comment) => htmlToText(comment.text || ""))];
      const translations = await translateWithProgress(inputs, storyText ? "正在翻译原帖和讨论" : "正在翻译热门讨论", 3);
      let commentOffset = 0;
      if (storyText && storyBody) {
        storyBody.textContent = translations[0];
        commentOffset = 1;
        const source = document.createElement("details");
        source.className = "story-original";
        source.innerHTML = "<summary>查看原帖英文</summary><p></p>";
        source.querySelector("p").textContent = storyText;
        $("discussionStory").append(source);
      }
      $("comments").replaceChildren();
      if (!comments.length) $("comments").textContent = "暂时没有讨论。";
      else comments.forEach((comment, index) => renderComment(comment, translations[index + commentOffset], htmlToText(comment.text || "")));
    }
  } catch (error) {
    setNotice(`讨论加载失败：${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

async function openArticle(story) {
  let url;
  try { url = new URL(story.url); } catch { return setNotice("文章链接无效", "error"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") return setNotice("该链接无法在插件内读取", "error");
  const permissions = [`${url.protocol}//${url.host}/*`];
  const alternateProtocol = url.protocol === "https:" ? "http:" : "https:";
  if (!url.port) permissions.push(`${alternateProtocol}//${url.host}/*`);
  const granted = await chrome.permissions.request({ origins: permissions });
  if (!granted) return setNotice("需要允许读取该文章网站，才能在侧边栏显示正文。", "error");

  enterDetailView();
  $("stories").hidden = true;
  $("discussion").hidden = true;
  $("articleReader").hidden = false;
  $("feeds").hidden = true;
  $("articleContent").replaceChildren();
  setLoading(true, "正在抓取文章正文…");
  setNotice("");
  try {
    let response;
    let article;
    try {
      response = await fetchArticle(story.url);
      article = extractArticle(response.html, response.finalUrl, story.title);
    } catch (fetchOrParseError) {
      setLoading(true, "直接抓取失败，正在后台渲染…");
      try {
        article = await renderArticle(story.url);
      } catch (backgroundError) {
        setLoading(true, "已打开原网页；如提示登录，请完成登录，登录后会自动继续…");
        article = await renderArticleInteractively(story.url);
      }
    }
    const articleUrl = article.finalUrl || response?.finalUrl || story.url;
    setLoading(true, `正在翻译文章（${article.blocks.length} 段）…`);
    if (settings.apiKey) {
      const [translatedTitle, ...translations] = await translateWithProgress([article.title, ...article.blocks], "正在翻译文章", 3);
      renderArticleHeader(translatedTitle, articleUrl, article.title);
      renderArticleBody(translations, article.blocks);
    } else {
      renderArticleHeader(article.title, articleUrl);
      renderArticleBody(article.blocks, []);
      setNotice("尚未配置 API Key，正文已在侧边栏显示，但没有翻译。", "setup");
    }
  } catch (error) {
    renderArticleFailure(story, error.message);
  } finally {
    setLoading(false);
  }
}

async function translateCurrentPage() {
  const granted = await chrome.permissions.request({ origins: ["https://*/*", "http://*/*"] });
  if (!granted) return setNotice("需要允许读取网页，才能翻译当前页面。", "error");

  const button = $("translateCurrentPage");
  const label = button.querySelector("b");
  clearTimeout(currentPageLabelTimer);
  button.disabled = true;
  label.textContent = "读取中…";
  try {
    const page = await extractActivePage();
    label.textContent = "翻译中…";
    const translations = await translateWithProgress(page.items.map((item) => item.text), "正在翻译当前网页", 3);
    const items = page.items.map((item, index) => ({ id: item.id, translation: translations[index] }));
    const result = await applyActivePageTranslations(page.tabId, items);
    label.textContent = `已显示 ${result.applied} 段`;
    currentPageLabelTimer = setTimeout(() => { label.textContent = "译当前页"; }, 1800);
  } catch (error) {
    setNotice(`当前网页翻译失败：${error.message}`, "error");
    label.textContent = "译当前页";
  } finally {
    button.disabled = false;
  }
}

function extractActivePage() {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "EXTRACT_ACTIVE_PAGE" }, (response) => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else if (response?.ok) resolve(response);
    else reject(new Error(response?.error || "当前网页正文提取失败"));
  }));
}

function applyActivePageTranslations(tabId, items) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "APPLY_ACTIVE_PAGE_TRANSLATIONS", tabId, items }, (response) => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else if (response?.ok) resolve(response);
    else reject(new Error(response?.error || "无法在当前网页显示译文"));
  }));
}

function fetchArticle(url) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "FETCH_ARTICLE", url }, (response) => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else if (response?.ok) resolve(response);
    else reject(new Error(response?.error || "文章读取失败"));
  }));
}

function renderArticle(url) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "RENDER_ARTICLE", url }, (response) => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else if (response?.ok) resolve(response);
    else reject(new Error(response?.error || "后台渲染文章失败"));
  }));
}

function renderArticleInteractively(url) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "RENDER_ARTICLE_INTERACTIVE", url }, (response) => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else if (response?.ok) resolve(response);
    else reject(new Error(response?.error || "可见网页读取失败"));
  }));
}

function extractArticle(html, finalUrl, fallbackTitle) {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const structuredBlocks = extractStructuredArticle(documentNode);
  documentNode.querySelectorAll("script,style,noscript,nav,header,footer,aside,form,svg,canvas,iframe").forEach((node) => node.remove());
  const title = documentNode.querySelector('meta[property="og:title"]')?.content?.trim()
    || documentNode.querySelector("h1")?.textContent?.trim()
    || documentNode.title?.trim()
    || fallbackTitle;
  const candidates = [...documentNode.querySelectorAll('article,main,[role="main"],[itemprop="articleBody"],.article,.post,.post-content,.entry-content,.article-content,.story-content')];
  const root = candidates.sort((a, b) => readableLength(b) - readableLength(a))[0] || documentNode.body;
  const nodes = [...root.querySelectorAll("h1,h2,h3,p,li,blockquote,pre")];
  const blocks = [...structuredBlocks];
  let total = blocks.reduce((sum, block) => sum + block.length, 0);
  for (const node of nodes) {
    const text = node.textContent.replace(/\s+/g, " ").trim();
    if (text.length < 20 || blocks.includes(text)) continue;
    const clipped = text.slice(0, 3000);
    if (total + clipped.length > 30000 || blocks.length >= 50) break;
    blocks.push(clipped);
    total += clipped.length;
  }
  if (!blocks.length) {
    const fallback = root.textContent.replace(/\s+/g, " ").trim().slice(0, 30000);
    if (fallback.length >= 80) blocks.push(...chunkText(fallback, 2500));
  }
  if (!blocks.length || blocks.join("").length < 200) throw new Error("没有从页面中识别出足够的正文，网站可能需要登录或使用 JavaScript 加载内容");
  if (articlePageNeedsInteraction({ url: finalUrl, title, text: blocks.join(" ") })) {
    throw new Error("页面需要登录、验证或重新加载");
  }
  return { title, blocks, finalUrl };
}

function extractStructuredArticle(documentNode) {
  const found = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.articleBody === "string" && value.articleBody.trim().length > 100) found.push(value.articleBody.trim());
    for (const child of Object.values(value)) {
      if (child && typeof child === "object") visit(child);
    }
  };
  documentNode.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try { visit(JSON.parse(script.textContent)); } catch { /* ignore invalid site metadata */ }
  });
  return found.flatMap((text) => chunkText(text.replace(/\s+/g, " "), 2500)).slice(0, 12);
}

function readableLength(node) {
  return [...node.querySelectorAll("p")].reduce((sum, paragraph) => sum + paragraph.textContent.trim().length, 0);
}

function chunkText(text, size) {
  const chunks = [];
  for (let start = 0; start < text.length; start += size) chunks.push(text.slice(start, start + size));
  return chunks;
}

function renderArticleHeader(title, url, originalTitle = "") {
  const heading = document.createElement("h1");
  heading.textContent = title;
  const original = document.createElement("div");
  original.className = "article-original-title";
  original.textContent = originalTitle;
  original.hidden = !originalTitle || originalTitle === title;
  const source = document.createElement("a");
  source.className = "article-source";
  source.href = url;
  source.target = "_blank";
  source.rel = "noreferrer";
  source.textContent = `原文来源：${safeDomain(url)} ↗`;
  $("articleContent").append(heading, original, source);
}

function renderArticleBody(translations, originals) {
  translations.forEach((translation, index) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = translation;
    $("articleContent").append(paragraph);
    if (originals[index] && originals[index] !== translation) {
      const details = document.createElement("details");
      details.innerHTML = "<summary>英文原文</summary><p></p>";
      details.querySelector("p").textContent = originals[index];
      $("articleContent").append(details);
    }
  });
}

function renderArticleFailure(story, message) {
  $("articleContent").replaceChildren();
  const heading = document.createElement("h1");
  heading.textContent = story.title;
  const error = document.createElement("p");
  error.className = "reader-error";
  error.textContent = `无法在插件内读取：${message}`;
  const link = document.createElement("a");
  link.className = "article-source";
  link.href = story.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "仍然打开原网站 ↗";
  $("articleContent").append(heading, error, link);
}

async function fetchComments(ids) {
  const queue = [...ids];
  const result = [];
  while (queue.length && result.length < COMMENT_LIMIT) {
    const batch = queue.splice(0, Math.min(10, COMMENT_LIMIT - result.length));
    const items = await Promise.all(batch.map((id) => fetchJson(`${API}/item/${id}.json`)));
    for (const item of items) {
      if (item && !item.deleted && !item.dead && item.text) result.push(item);
    }
  }
  return result;
}

function renderComment(comment, text, original = "") {
  const node = document.createElement("article");
  node.className = "comment";
  const avatar = document.createElement("span");
  avatar.className = "comment-avatar";
  avatar.textContent = (comment.by || "?").slice(0, 1).toUpperCase();
  const content = document.createElement("div");
  content.className = "comment-content";
  const meta = document.createElement("div");
  meta.className = "comment-meta";
  meta.textContent = `${comment.by || "匿名"} · ${relativeTime(comment.time)}`;
  const body = document.createElement("p");
  body.textContent = text;
  content.append(meta, body);
  if (original && original !== text) {
    const source = document.createElement("details");
    source.innerHTML = `<summary>查看英文原文</summary><p></p>`;
    source.querySelector("p").textContent = original;
    content.append(source);
  }
  node.append(avatar, content);
  $("comments").append(node);
}

function enterDetailView() {
  listScrollPositions.set(activeFeed, $("main").scrollTop);
  $("main").scrollTop = 0;
  updateHeaderVisibility();
}

function showList(restoreScroll = true) {
  $("stories").hidden = false;
  $("discussion").hidden = true;
  $("articleReader").hidden = true;
  $("feeds").hidden = false;
  const targetScroll = restoreScroll ? listScrollPositions.get(activeFeed) || 0 : 0;
  if (!restoreScroll) listScrollPositions.set(activeFeed, 0);
  requestAnimationFrame(() => {
    $("main").scrollTop = targetScroll;
    updateHeaderVisibility();
  });
}

function translate(texts) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "TRANSLATE", texts }, (response) => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else if (response?.ok) resolve(response.translations);
    else reject(new Error(response?.error || "翻译失败"));
  }));
}

async function translateWithProgress(texts, label, maxItems) {
  if (!texts.length) return [];
  const run = startProgress(label, texts.length);
  const batches = [];
  for (let start = 0; start < texts.length;) {
    const items = [];
    let characters = 0;
    while (start < texts.length && items.length < maxItems) {
      const next = texts[start];
      if (items.length && characters + next.length > 3500) break;
      items.push(next);
      characters += next.length;
      start++;
    }
    batches.push(items);
  }

  const batchResults = new Array(batches.length);
  let nextBatch = 0;
  let completed = 0;
  let failure = null;
  try {
    const worker = async () => {
      while (!failure) {
        const index = nextBatch++;
        if (index >= batches.length) return;
        const batch = batches[index];
        try {
          batchResults[index] = await translate(batch);
          completed += batch.length;
          updateProgress(run, label, completed, texts.length);
        } catch (error) {
          failure = error;
          throw error;
        }
      }
    };
    const workerCount = Math.min(TRANSLATION_CONCURRENCY, batches.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    finishProgress(run, label, texts.length);
    return batchResults.flat();
  } catch (error) {
    hideProgress(run);
    throw error;
  }
}

function startProgress(label, total) {
  const run = ++progressRun;
  setLoading(false);
  $("translationProgress").hidden = false;
  $("progressBar").value = 0;
  $("progressLabel").textContent = `${label} 0/${total}`;
  $("progressText").textContent = "0%";
  return run;
}

function updateProgress(run, label, completed, total) {
  if (run !== progressRun) return;
  const percent = Math.round(completed / total * 100);
  $("progressBar").value = percent;
  $("progressLabel").textContent = `${label} ${completed}/${total}`;
  $("progressText").textContent = `${percent}%`;
}

function finishProgress(run, label, total) {
  updateProgress(run, label, total, total);
  setTimeout(() => hideProgress(run), 700);
}

function hideProgress(run) {
  if (run === progressRun) $("translationProgress").hidden = true;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function matchesTopics(title) {
  if (!settings.topics?.length) return false;
  const lower = title.toLowerCase();
  return settings.topics.some((topic) => TOPICS[topic]?.some((keyword) => lower.includes(keyword)));
}

function htmlToText(html) {
  const documentNode = new DOMParser().parseFromString(html, "text/html");
  const blocks = [...documentNode.body.querySelectorAll("p,li,blockquote,pre")]
    .map((node) => node.textContent.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return (blocks.length ? blocks.join("\n\n") : documentNode.body.textContent).trim();
}

function safeDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "外部链接"; }
}

function relativeTime(timestamp) {
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - Number(timestamp || 0)));
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

function escapeText(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span.innerHTML;
}

function setLoading(visible, text = "") {
  $("loading").hidden = !visible;
  if (text) $("loading").querySelector("span").textContent = text;
}

function setNotice(text, type = "") {
  $("notice").textContent = text;
  $("notice").className = type;
}
