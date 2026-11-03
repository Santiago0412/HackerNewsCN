import { articlePageNeedsInteraction } from "./lib/article.js";
import {
  LANGUAGE_CHOICES,
  MODEL_CHOICES,
  customEndpointPermission,
  hasModelAccess,
  normalizeSettings,
  resolveTargetLanguage,
  selectedModelIndex,
  validateConfiguration
} from "./lib/settings.js";
import { applyDocumentTranslations, createTranslator } from "./lib/ui-i18n.js";
import {
  ReadingLibrary,
  buildLibraryContext,
  exportLibraryJson,
  exportLibraryMarkdown,
  libraryItemFromStory,
  libraryItemToStory
} from "./lib/library.js";

const API = "https://hacker-news.firebaseio.com/v0";
const PAGE_SIZE = 20;
const COMMENT_LIMIT = 10;
const TRANSLATION_CONCURRENCY = 3;
const ARTICLE_QUICK_KEYS = ["quickArticleSummary", "quickArticleTerms", "quickArticleMeaning"];
const DISCUSSION_QUICK_KEYS = ["quickDiscussionSummary", "quickDiscussionDifferences", "quickDiscussionBest"];
const LIST_QUICK_KEYS = ["quickListWorthReading", "quickListTopics", "quickListRecommend"];
const LIBRARY_QUICK_KEYS = ["quickLibrarySummary", "quickLibraryTopics", "quickLibraryResearch"];
const DEFAULT_UI_SCALE = 1.1;
const MIN_UI_SCALE = 0.9;
const MAX_UI_SCALE = 1.5;
const TOPIC_KEYS = { ai: "topicAI", programming: "topicProgramming", startup: "topicStartup", security: "topicSecurity", science: "topicScience", hardware: "topicHardware", design: "topicDesign", culture: "topicCulture" };
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
let t = createTranslator("en");
let activeFeed = "topstories";
let stories = [];
let progressRun = 0;
let uiScale = DEFAULT_UI_SCALE;
let currentPageLabelTimer;
let activeScreen = "list";
let detailReturnScreen = "list";
let libraryItems = [];
let savedById = new Map();
let noteTargetId = "";
let toastTimer;
let chatScope = "current";
let chatBusy = false;
let currentReadingContext = { key: "list", label: "", text: "" };
const chatConversations = { current: [], library: [] };
const readingLibrary = new ReadingLibrary(chrome.storage.local);
const listScrollPositions = new Map();
const $ = (id) => document.getElementById(id);

init();

async function init() {
  const stored = await chrome.storage.local.get(["settings", "uiScale"]);
  settings = normalizeSettings(stored.settings);
  t = applyDocumentTranslations(document, settings);
  currentReadingContext.label = t("currentList");
  await refreshLibraryState();
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
  $("back").addEventListener("click", returnFromDetail);
  $("articleBack").addEventListener("click", returnFromDetail);
  $("openLibrary").addEventListener("click", () => activeScreen === "library" ? showList() : openLibrary());
  $("libraryBack").addEventListener("click", () => showList());
  $("summarizeLibrary").addEventListener("click", () => openLibrarySummary());
  $("exportLibrary").addEventListener("click", () => libraryItems.length && $("exportDialog").showModal());
  $("exportMarkdown").addEventListener("click", () => exportLibrary("markdown"));
  $("exportJson").addEventListener("click", () => exportLibrary("json"));
  $("chatFab").addEventListener("click", () => openChat());
  $("closeChat").addEventListener("click", closeChat);
  $("chatBackdrop").addEventListener("click", closeChat);
  $("chatScopeCurrent").addEventListener("click", () => setChatScope("current"));
  $("chatScopeLibrary").addEventListener("click", () => setChatScope("library"));
  $("chatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    askFromChat($("chatInput").value);
  });
  $("chatInput").addEventListener("input", autoSizeChatInput);
  $("chatInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("chatForm").requestSubmit();
    }
  });
  $("noteText").addEventListener("input", updateNoteCount);
  $("noteForm").addEventListener("submit", saveNoteFromDialog);
  $("onboardingLanguage").addEventListener("change", updateOnboardingLanguageFields);
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
  LANGUAGE_CHOICES.forEach((choice) => $("onboardingLanguage").add(new Option(choice.value === "custom" ? t("otherLanguage") : choice.label, choice.value)));
  MODEL_CHOICES.forEach((choice, index) => $("onboardingModel").add(new Option(modelChoiceLabel(choice), String(index))));
  $("onboardingLanguage").value = settings.targetLanguage;
  $("onboardingCustomLanguage").value = settings.customTargetLanguage;
  $("onboardingModel").value = String(selectedModelIndex(settings));
  $("onboardingKey").value = settings.apiKey || "";
  $("onboardingEndpoint").value = settings.customEndpoint || "";
  $("onboardingCustomModel").value = settings.customModel || "";
  for (const [value, key] of Object.entries(TOPIC_KEYS)) {
    const node = document.createElement("label");
    node.innerHTML = `<input type="checkbox" value="${value}"><span data-i18n="${key}">${t(key)}</span>`;
    node.querySelector("input").checked = settings.topics?.includes(value) || false;
    $("onboardingTopics").append(node);
  }
  updateOnboardingLanguageFields();
  updateOnboardingGuide();
}

function updateOnboardingGuide() {
  const choice = MODEL_CHOICES[Number($("onboardingModel").value)] || MODEL_CHOICES[0];
  const custom = choice.provider === "custom";
  const hostedChoice = choice.provider === "deepseek";
  $("onboardingCustomProvider").hidden = !custom;
  $("onboardingKeyOptional").hidden = !hostedChoice;
  if (custom) $("onboardingGuide").textContent = t("otherModelGuide");
  else if (hostedChoice) $("onboardingGuide").textContent = t("hostedQuotaNote");
  else $("onboardingGuide").innerHTML = `${escapeText(t("noKey"))} <a href="${choice.keyUrl}" target="_blank" rel="noreferrer">${escapeText(t("openSite", { site: choice.keySite }))}</a>. ${escapeText(t("endpointAutomatic"))}`;
}

function updateOnboardingLanguageFields() {
  const custom = $("onboardingLanguage").value === "custom";
  $("onboardingCustomLanguageField").hidden = !custom;
  t = applyDocumentTranslations(document, { targetLanguage: $("onboardingLanguage").value });
  refreshOnboardingLabels();
  updateOnboardingGuide();
  $("onboardingError").textContent = custom ? t("targetFallback") : "";
}

function modelChoiceLabel(choice) {
  return choice.provider === "custom" ? t("customProvider") : choice.label;
}

function refreshOnboardingLabels() {
  [...$("onboardingLanguage").options].forEach((option, index) => { option.textContent = LANGUAGE_CHOICES[index].value === "custom" ? t("otherLanguage") : LANGUAGE_CHOICES[index].label; });
  [...$("onboardingModel").options].forEach((option, index) => { option.textContent = modelChoiceLabel(MODEL_CHOICES[index]); });
  document.querySelectorAll("#onboardingTopics [data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
}

function showOnboarding() {
  $("onboarding").hidden = false;
  $("feeds").hidden = true;
  $("stories").hidden = true;
  $("loading").hidden = true;
  $("refresh").closest("footer").hidden = true;
  $("openLibrary").hidden = true;
  $("chatFab").hidden = true;
}

async function completeOnboarding() {
  const apiKey = $("onboardingKey").value.trim();
  const choice = MODEL_CHOICES[Number($("onboardingModel").value)] || MODEL_CHOICES[0];
  const hosted = choice.provider === "deepseek" && !apiKey;
  if (!hosted && !apiKey) return setOnboardingError(t("keyRequired"));
  if (apiKey && !/^[\x21-\x7E]+$/.test(apiKey)) return setOnboardingError(t("keyInvalid"));
  try {
    settings = validateConfiguration({
      ...settings,
      targetLanguage: $("onboardingLanguage").value,
      customTargetLanguage: $("onboardingCustomLanguage").value,
      provider: choice.provider,
      model: choice.model,
      apiKey,
      useHostedGateway: hosted,
      customEndpoint: $("onboardingEndpoint").value,
      customModel: $("onboardingCustomModel").value,
      topics: [...document.querySelectorAll('#onboardingTopics input:checked')].map((input) => input.value),
      topicMode: "favorites",
      autoTranslateTitles: true,
      showOriginal: true,
      cacheDays: Number(settings.cacheDays) || 30,
      maxCacheEntries: Number(settings.maxCacheEntries) || 5000,
      setupCompleted: true
    });
    if (choice.provider === "custom") {
      const granted = await chrome.permissions.request({ origins: [customEndpointPermission(settings.customEndpoint)] });
      if (!granted) return setOnboardingError(t("endpointPermissionDenied"));
    }
  } catch (error) {
    return setOnboardingError(error.message);
  }
  await chrome.storage.local.set({ settings });
  $("onboarding").hidden = true;
  $("feeds").hidden = false;
  $("stories").hidden = false;
  $("refresh").closest("footer").hidden = false;
  $("openLibrary").hidden = false;
  $("chatFab").hidden = false;
  await loadFeed();
}

function setOnboardingError(message) {
  $("onboardingError").textContent = message;
}

async function loadFeed(force = false, preserveScroll = false) {
  if (preserveScroll && !$("stories").hidden) listScrollPositions.set(activeFeed, $("main").scrollTop);
  showList(preserveScroll);
  setLoading(true, t("fetching"));
  setNotice("");
  try {
    if (activeFeed === "favorites" && !settings.topics?.length) {
      stories = [];
      renderStories();
      updateListReadingContext();
      setNotice(t("topicsMissing"), "setup");
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
    updateListReadingContext();
    if (activeFeed === "favorites" && !stories.length) setNotice(t("noTopicMatches"), "setup");
    if (hasModelAccess(settings)) await translateStoryTitles();
    else setNotice(t("translationSetup", { language: resolveTargetLanguage(settings).label }), "setup");
    $("updated").textContent = fresh ? t("cachedFiveMinutes") : t("updatedAt", { time: t.date(new Date(), { hour: "2-digit", minute: "2-digit" }) });
  } catch (error) {
    setNotice(t("fetchFailed", { error: localizeBackendError(error.message) }), "error");
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
    meta.innerHTML = `<span>${escapeText(t("points", { count: t.number(story.score || 0) }))}</span><span>${escapeText(story.by || "")}</span><span>${relativeTime(story.time)}</span><span>${escapeText(domain)}</span>`;
    const discussion = document.createElement("button");
    discussion.className = "discussion-button";
    discussion.textContent = t("comments", { count: t.number(story.descendants || 0) });
    discussion.addEventListener("click", () => openDiscussion(story));
    const bookmark = createBookmarkButton(story);
    meta.append(discussion);
    content.append(title, original, meta, bookmark);
    item.append(rank, content);
    $("stories").append(item);
  });
}

async function translateStoryTitles() {
  const titles = stories.map((story) => story.title);
  try {
    const translations = await translateWithProgress(titles, t("translateTitles"), 5);
    translations.forEach((translated, index) => {
      stories[index]._translatedTitle = translated;
      const link = document.querySelector(`[data-story-id="${stories[index].id}"]`);
      if (!link) return;
      link.textContent = translated;
      link.nextElementSibling.hidden = translated === stories[index].title;
    });
    updateListReadingContext();
  } catch (error) {
    setNotice(t("translationFallback", { error: localizeBackendError(error.message) }), "error");
  }
}

async function openDiscussion(story) {
  enterDetailView();
  $("stories").hidden = true;
  $("discussion").hidden = false;
  $("feeds").hidden = true;
  $("discussionStory").replaceChildren();
  const title = document.createElement("h1");
  const translatedTitle = document.querySelector(`[data-story-id="${story.id}"]`)?.textContent || story._translatedTitle || "";
  title.textContent = translatedTitle || story.title;
  $("discussionStory").append(title);
  const storyText = story.text ? htmlToText(story.text) : "";
  story._translatedTitle = translatedTitle !== story.title ? translatedTitle : story._translatedTitle || "";
  story._libraryExcerpt = storyText;
  let storyBody = null;
  if (story.text) {
    storyBody = document.createElement("p");
    storyBody.textContent = storyText;
    $("discussionStory").append(storyBody);
  }
  $("discussionStory").append(createDetailActions(story));
  setReadingContext(`discussion:${story.id}`, t("discussion", { title: title.textContent }), [story.title, storyText].filter(Boolean).join("\n\n"));
  $("comments").replaceChildren();
  setLoading(true, t("fetchingDiscussion"));
  try {
    const comments = await fetchComments(story.kids || []);
    if (!comments.length) $("comments").textContent = t("noDiscussion");
    else comments.forEach((comment) => renderComment(comment, htmlToText(comment.text || "")));
    if (hasModelAccess(settings) && (storyText || comments.length)) {
      const inputs = [...(storyText ? [storyText] : []), ...comments.map((comment) => htmlToText(comment.text || ""))];
      const translations = await translateWithProgress(inputs, storyText ? t("translatingDiscussion") : t("translatingComments"), 3);
      let commentOffset = 0;
      if (storyText && storyBody) {
        storyBody.textContent = translations[0];
        commentOffset = 1;
        const source = document.createElement("details");
        source.className = "story-original";
        source.innerHTML = `<summary>${escapeText(t("viewOriginalPost"))}</summary><p></p>`;
        source.querySelector("p").textContent = storyText;
        $("discussionStory").append(source);
      }
      $("comments").replaceChildren();
      if (!comments.length) $("comments").textContent = t("noDiscussion");
      else comments.forEach((comment, index) => renderComment(comment, translations[index + commentOffset], htmlToText(comment.text || "")));
    }
    const discussionContext = [story.title, storyText, ...comments.map((comment) => `${comment.by || t("anonymous")}: ${htmlToText(comment.text || "")}`)].filter(Boolean).join("\n\n");
    story._libraryExcerpt = discussionContext.slice(0, 12000);
    setReadingContext(`discussion:${story.id}`, t("discussion", { title: title.textContent }), discussionContext);
    await enrichSavedItem(story);
  } catch (error) {
    setNotice(t("discussionFailed", { error: localizeBackendError(error.message) }), "error");
  } finally {
    setLoading(false);
  }
}

async function openArticle(story) {
  let url;
  try { url = new URL(story.url); } catch { return setNotice(t("invalidArticleUrl"), "error"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") return setNotice(t("unreadableLink"), "error");
  const permissions = [`${url.protocol}//${url.host}/*`];
  const alternateProtocol = url.protocol === "https:" ? "http:" : "https:";
  if (!url.port) permissions.push(`${alternateProtocol}//${url.host}/*`);
  const granted = await chrome.permissions.request({ origins: permissions });
  if (!granted) return setNotice(t("articlePermission"), "error");

  enterDetailView();
  $("stories").hidden = true;
  $("discussion").hidden = true;
  $("articleReader").hidden = false;
  $("feeds").hidden = true;
  $("articleContent").replaceChildren();
  setReadingContext(`article:${story.id}`, t("article", { title: story._translatedTitle || story.title }), story.title);
  setLoading(true, t("fetchingArticle"));
  setNotice("");
  try {
    let response;
    let article;
    try {
      response = await fetchArticle(story.url);
      article = extractArticle(response.html, response.finalUrl, story.title);
    } catch (fetchOrParseError) {
      setLoading(true, t("renderingArticle"));
      try {
        article = await renderArticle(story.url);
      } catch (backgroundError) {
        setLoading(true, t("interactiveArticle"));
        article = await renderArticleInteractively(story.url);
      }
    }
    const articleUrl = article.finalUrl || response?.finalUrl || story.url;
    story._libraryExcerpt = article.blocks.join("\n\n").slice(0, 12000);
    setLoading(true, t("translatingArticleCount", { count: t.number(article.blocks.length) }));
    if (hasModelAccess(settings)) {
      const [translatedTitle, ...translations] = await translateWithProgress([article.title, ...article.blocks], t("translatingArticle"), 3);
      story._translatedTitle = translatedTitle;
      renderArticleHeader(translatedTitle, articleUrl, article.title, story);
      renderArticleBody(translations, article.blocks);
    } else {
      renderArticleHeader(article.title, articleUrl, "", story);
      renderArticleBody(article.blocks, []);
      setNotice(t("noTranslationKey"), "setup");
    }
    setReadingContext(`article:${story.id}`, t("article", { title: story._translatedTitle || article.title }), `${article.title}\n\n${article.blocks.join("\n\n")}`);
    await enrichSavedItem(story);
  } catch (error) {
    renderArticleFailure(story, error.message);
  } finally {
    setLoading(false);
  }
}

async function translateCurrentPage() {
  const granted = await chrome.permissions.request({ origins: ["https://*/*", "http://*/*"] });
  if (!granted) return setNotice(t("pagePermission"), "error");

  const button = $("translateCurrentPage");
  const label = button.querySelector("b");
  clearTimeout(currentPageLabelTimer);
  button.disabled = true;
  label.textContent = t("readingPage");
  try {
    const page = await extractActivePage();
    label.textContent = t("translatingPage");
    const translations = await translateWithProgress(page.items.map((item) => item.text), t("translatingCurrentPage"), 3);
    const items = page.items.map((item, index) => ({ id: item.id, translation: translations[index] }));
    const result = await applyActivePageTranslations(page.tabId, items);
    label.textContent = t("shownSections", { count: t.number(result.applied) });
    currentPageLabelTimer = setTimeout(() => { label.textContent = t("translatePage"); }, 1800);
  } catch (error) {
    setNotice(t("pageTranslationFailed", { error: localizeBackendError(error.message) }), "error");
    label.textContent = t("translatePage");
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

function renderArticleHeader(title, url, originalTitle = "", story = null) {
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
  source.textContent = t("originalSource", { domain: safeDomain(url) });
  $("articleContent").append(heading, original, source);
  if (story) $("articleContent").append(createDetailActions(story));
}

function renderArticleBody(translations, originals) {
  translations.forEach((translation, index) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = translation;
    $("articleContent").append(paragraph);
    if (originals[index] && originals[index] !== translation) {
      const details = document.createElement("details");
      details.innerHTML = `<summary>${escapeText(t("original"))}</summary><p></p>`;
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
  error.textContent = t("readFailed", { error: localizeBackendError(message) });
  const link = document.createElement("a");
  link.className = "article-source";
  link.href = story.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = t("openOriginal");
  $("articleContent").append(heading, error, link, createDetailActions(story));
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
  meta.textContent = `${comment.by || t("anonymous")} · ${relativeTime(comment.time)}`;
  const body = document.createElement("p");
  body.textContent = text;
  content.append(meta, body);
  if (original && original !== text) {
    const source = document.createElement("details");
    source.innerHTML = `<summary>${escapeText(t("original"))}</summary><p></p>`;
    source.querySelector("p").textContent = original;
    content.append(source);
  }
  node.append(avatar, content);
  $("comments").append(node);
}

function enterDetailView() {
  detailReturnScreen = activeScreen === "library" ? "library" : "list";
  if (activeScreen === "list") listScrollPositions.set(activeFeed, $("main").scrollTop);
  activeScreen = "detail";
  $("main").scrollTop = 0;
  $("library").hidden = true;
  $("openLibrary").classList.remove("active");
  updateHeaderVisibility();
}

function showList(restoreScroll = true) {
  activeScreen = "list";
  $("stories").hidden = false;
  $("discussion").hidden = true;
  $("articleReader").hidden = true;
  $("library").hidden = true;
  $("feeds").hidden = false;
  $("openLibrary").classList.remove("active");
  $("refresh").closest("footer").hidden = false;
  updateListReadingContext();
  const targetScroll = restoreScroll ? listScrollPositions.get(activeFeed) || 0 : 0;
  if (!restoreScroll) listScrollPositions.set(activeFeed, 0);
  requestAnimationFrame(() => {
    $("main").scrollTop = targetScroll;
    updateHeaderVisibility();
  });
}

function returnFromDetail() {
  if (detailReturnScreen === "library") openLibrary();
  else showList();
}

function translate(texts) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "TRANSLATE", texts }, (response) => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else if (response?.ok) resolve(response.translations);
    else reject(new Error(localizeBackendError(response?.error || t("translateFailed"))));
  }));
}

function sendAsk(context, history) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "ASK", context, history }, (response) => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else if (response?.ok) resolve(response.answer);
    else reject(new Error(localizeBackendError(response?.error || t("followupFailed"))));
  }));
}

function createBookmarkButton(story) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "bookmark-button";
  button.dataset.bookmarkId = String(story.id);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.8 4.2c0-.8.6-1.4 1.4-1.4h7.6c.8 0 1.4.6 1.4 1.4v16l-5.2-3.4-5.2 3.4v-16Z"/></svg>';
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleBookmark(story);
  });
  syncBookmarkButton(button, String(story.id));
  return button;
}

function createDetailActions(story) {
  const actions = document.createElement("div");
  actions.className = "detail-actions";
  const bookmark = document.createElement("button");
  bookmark.type = "button";
  bookmark.dataset.bookmarkId = String(story.id);
  bookmark.innerHTML = `<svg class="bookmark-shape" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.8 4.2c0-.8.6-1.4 1.4-1.4h7.6c.8 0 1.4.6 1.4 1.4v16l-5.2-3.4-5.2 3.4v-16Z"/></svg><span>${escapeText(t("bookmark"))}</span>`;
  bookmark.addEventListener("click", () => toggleBookmark(story));
  const note = document.createElement("button");
  note.type = "button";
  note.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Zm9-13 4 4"/></svg><span>${escapeText(t("note"))}</span>`;
  note.addEventListener("click", () => openNoteEditor(story));
  actions.append(bookmark, note);
  syncBookmarkButton(bookmark, String(story.id));
  return actions;
}

async function toggleBookmark(story) {
  try {
    const id = String(story.id);
    const existing = savedById.get(id);
    if (existing) {
      if (existing.note && !confirm(t("confirmRemoveNote"))) return;
      await readingLibrary.remove(id);
      showToast(t("bookmarkRemoved"));
    } else {
      const translatedTitle = story._translatedTitle || document.querySelector(`[data-story-id="${id}"]`)?.textContent || "";
      const item = libraryItemFromStory(story, {
        translatedTitle: translatedTitle === story.title ? "" : translatedTitle,
        excerpt: story._libraryExcerpt || htmlToText(story.text || "")
      });
      await readingLibrary.save(item);
      showToast(t("bookmarkedLocal"));
    }
    await refreshLibraryState(true);
  } catch (error) {
    showToast(t("bookmarkFailed", { error: localizeBackendError(error.message) }));
  }
}

function syncBookmarkButton(button, id) {
  const saved = savedById.has(String(id));
  button.classList.toggle("saved", saved);
  button.setAttribute("aria-pressed", String(saved));
  button.title = saved ? t("removeBookmark") : t("bookmark");
  button.setAttribute("aria-label", button.title);
  const label = button.querySelector("span");
  if (label) label.textContent = saved ? t("bookmarked") : t("bookmark");
}

function syncAllBookmarkButtons() {
  document.querySelectorAll("[data-bookmark-id]").forEach((button) => syncBookmarkButton(button, button.dataset.bookmarkId));
}

async function refreshLibraryState(changed = false) {
  libraryItems = await readingLibrary.list();
  savedById = new Map(libraryItems.map((item) => [String(item.id), item]));
  const badge = $("libraryBadge");
  badge.textContent = libraryItems.length > 99 ? "99+" : String(libraryItems.length);
  badge.hidden = libraryItems.length === 0;
  syncAllBookmarkButtons();
  if (changed) chatConversations.library = [];
  if (activeScreen === "library") await renderLibrary();
  if (chatScope === "library" && $("chatDrawer").classList.contains("open")) renderChat();
}

async function enrichSavedItem(story) {
  const id = String(story.id);
  if (!savedById.has(id)) return;
  await readingLibrary.update(id, {
    translatedTitle: story._translatedTitle || savedById.get(id).translatedTitle,
    excerpt: story._libraryExcerpt || savedById.get(id).excerpt
  });
  await refreshLibraryState(true);
}

async function openLibrary() {
  await refreshLibraryState();
  activeScreen = "library";
  $("stories").hidden = true;
  $("discussion").hidden = true;
  $("articleReader").hidden = true;
  $("feeds").hidden = true;
  $("library").hidden = false;
  $("openLibrary").classList.add("active");
  $("refresh").closest("footer").hidden = true;
  $("main").scrollTop = 0;
  updateHeaderVisibility();
  await renderLibrary();
  setReadingContext("library-view", t("library"), buildLibraryContext(libraryItems));
}

async function renderLibrary() {
  const list = $("libraryItems");
  list.replaceChildren();
  $("libraryEmpty").hidden = libraryItems.length > 0;
  $("summarizeLibrary").disabled = libraryItems.length === 0;
  $("exportLibrary").disabled = libraryItems.length === 0;
  const bytes = await readingLibrary.bytesInUse().catch(() => null);
  $("libraryStats").textContent = t("itemsStored", { count: t.number(libraryItems.length), size: bytes === null ? "" : ` · ${formatBytes(bytes)}` });

  libraryItems.forEach((item) => {
    const card = document.createElement("li");
    card.className = "library-card";
    const top = document.createElement("div");
    top.className = "library-card-top";
    const title = document.createElement("button");
    title.type = "button";
    title.className = "library-card-title";
    title.textContent = item.translatedTitle || item.title;
    title.addEventListener("click", () => openSavedItem(item));
    top.append(title);
    const original = document.createElement("div");
    original.className = "library-card-original";
    original.textContent = item.translatedTitle && item.translatedTitle !== item.title ? item.title : "";
    original.hidden = !original.textContent;
    const meta = document.createElement("div");
    meta.className = "library-card-meta";
    meta.textContent = `${safeDomain(item.url)} · ${t("points", { count: t.number(item.score || 0) })} · ${t.date(new Date(item.savedAt))}`;
    const note = document.createElement("div");
    note.className = `library-note-preview${item.note ? "" : " empty"}`;
    note.textContent = item.note || t("noNote");
    const actions = document.createElement("div");
    actions.className = "library-card-actions";
    const read = document.createElement("button");
    read.type = "button";
    read.textContent = item.url === item.discussionUrl ? t("viewPost") : t("read");
    read.addEventListener("click", () => openSavedItem(item));
    const editNote = document.createElement("button");
    editNote.type = "button";
    editNote.textContent = item.note ? t("editNote") : t("addNote");
    editNote.addEventListener("click", () => openNoteEditor(item));
    const discussion = document.createElement("a");
    discussion.href = item.discussionUrl;
    discussion.target = "_blank";
    discussion.rel = "noreferrer";
    discussion.textContent = `${t("comments", { count: t.number(item.commentCount || 0) })} ↗`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-library";
    remove.textContent = t("remove");
    remove.addEventListener("click", () => toggleBookmark(libraryItemToStory(item)));
    actions.append(read, editNote, discussion, remove);
    card.append(top, original, meta, note, actions);
    list.append(card);
  });
}

function openSavedItem(item) {
  const story = libraryItemToStory(item);
  story._translatedTitle = item.translatedTitle;
  story._libraryExcerpt = item.excerpt;
  if (story.url) openArticle(story);
  else openSavedDiscussion(item);
}

async function openSavedDiscussion(item) {
  try {
    setLoading(true, t("fetchingPost"));
    const story = await fetchJson(`${API}/item/${item.id}.json`);
    if (!story || story.deleted || story.dead) throw new Error(t("postUnavailable"));
    story._translatedTitle = item.translatedTitle;
    story._libraryExcerpt = item.excerpt;
    await openDiscussion(story);
  } catch (error) {
    setNotice(t("discussionFailed", { error: localizeBackendError(error.message) }), "error");
  } finally {
    setLoading(false);
  }
}

async function openNoteEditor(source) {
  try {
    let item = savedById.get(String(source.id));
    if (!item) {
      const story = source.url !== undefined && source.by !== undefined ? source : libraryItemToStory(source);
      item = await readingLibrary.save(libraryItemFromStory(story, {
        translatedTitle: story._translatedTitle || "",
        excerpt: story._libraryExcerpt || htmlToText(story.text || "")
      }));
      await refreshLibraryState(true);
      showToast(t("savedAddNote"));
    }
    noteTargetId = String(item.id);
    $("noteTitle").textContent = item.translatedTitle || item.title;
    $("noteText").value = item.note || "";
    updateNoteCount();
    $("noteDialog").showModal();
    requestAnimationFrame(() => $("noteText").focus());
  } catch (error) {
    showToast(t("noteOpenFailed", { error: localizeBackendError(error.message) }));
  }
}

async function saveNoteFromDialog(event) {
  if (event.submitter?.id !== "saveNote") return;
  event.preventDefault();
  if (!noteTargetId) return;
  try {
    await readingLibrary.update(noteTargetId, { note: $("noteText").value });
    $("noteDialog").close();
    await refreshLibraryState(true);
    showToast(t("noteSaved"));
  } catch (error) {
    showToast(t("noteSaveFailed", { error: localizeBackendError(error.message) }));
  }
}

function updateNoteCount() {
  $("noteCount").textContent = `${$("noteText").value.length.toLocaleString("zh-CN")} / 20,000`;
}

function exportLibrary(format) {
  const date = new Date();
  const stamp = date.toISOString().slice(0, 10);
  const isMarkdown = format === "markdown";
  const content = isMarkdown ? exportLibraryMarkdown(libraryItems, date) : exportLibraryJson(libraryItems, date);
  const blob = new Blob([content], { type: isMarkdown ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hacker-news-bookmarks-${stamp}.${isMarkdown ? "md" : "json"}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $("exportDialog").close();
  showToast(t("exported", { format: isMarkdown ? "Markdown" : "JSON" }));
}

function setReadingContext(key, label, text) {
  if (currentReadingContext.key !== key) chatConversations.current = [];
  currentReadingContext = { key, label, text: String(text || "") };
  if (chatScope === "current" && $("chatDrawer").classList.contains("open")) renderChat();
}

function updateListReadingContext() {
  const text = stories.map((story, index) => `${index + 1}. ${story._translatedTitle || story.title}\n${t("originalTitle", { title: story.title })}\n${t("points", { count: story.score || 0 })}, ${t("comments", { count: story.descendants || 0 })}, ${safeDomain(story.url || "https://news.ycombinator.com")}`).join("\n\n");
  setReadingContext(`list:${activeFeed}`, t("currentList"), text);
}

function openChat(preferredScope = activeScreen === "library" ? "library" : "current") {
  $("chatDrawer").classList.add("open");
  $("chatDrawer").setAttribute("aria-hidden", "false");
  $("chatBackdrop").hidden = false;
  $("chatFab").hidden = true;
  setChatScope(preferredScope);
  requestAnimationFrame(() => $("chatInput").focus());
}

function closeChat() {
  $("chatDrawer").classList.remove("open");
  $("chatDrawer").setAttribute("aria-hidden", "true");
  $("chatBackdrop").hidden = true;
  if (settings.setupCompleted) $("chatFab").hidden = false;
}

function setChatScope(scope) {
  chatScope = scope === "library" ? "library" : "current";
  $("chatScopeCurrent").classList.toggle("active", chatScope === "current");
  $("chatScopeLibrary").classList.toggle("active", chatScope === "library");
  renderChat();
}

function renderChat() {
  $("chatContextLabel").textContent = chatScope === "library" ? t("myBookmarksCount", { count: t.number(libraryItems.length) }) : currentReadingContext.label;
  $("chatInput").placeholder = chatScope === "library" ? t("organizePlaceholder") : t("askPlaceholder");
  const thread = $("chatThread");
  thread.replaceChildren();
  chatConversations[chatScope].forEach((turn) => addChatBubble(turn.role === "assistant" ? "ai" : "user", turn.content));
  const quick = $("chatQuick");
  quick.replaceChildren();
  const suggestions = (chatScope === "library" ? LIBRARY_QUICK_KEYS : currentQuickQuestionKeys()).map((key) => t(key));
  suggestions.forEach((question) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = question;
    chip.disabled = chatScope === "library" && libraryItems.length === 0;
    chip.addEventListener("click", () => askFromChat(question));
    quick.append(chip);
  });
  thread.scrollTop = thread.scrollHeight;
}

function currentQuickQuestionKeys() {
  if (currentReadingContext.key.startsWith("article:")) return ARTICLE_QUICK_KEYS;
  if (currentReadingContext.key.startsWith("discussion:")) return DISCUSSION_QUICK_KEYS;
  return LIST_QUICK_KEYS;
}

function addChatBubble(role, content, extraClass = "") {
  const bubble = document.createElement("div");
  bubble.className = `chat-msg ${role}${extraClass ? ` ${extraClass}` : ""}`;
  bubble.textContent = content;
  $("chatThread").append(bubble);
  return bubble;
}

async function askFromChat(question) {
  const value = String(question || "").trim();
  if (!value || chatBusy) return;
  if (chatScope === "library" && !libraryItems.length) return showToast(t("libraryEmptyAI"));
  if (!hasModelAccess(settings)) {
    addChatBubble("ai", t("configureAI"), "error");
    return;
  }
  chatBusy = true;
  const scope = chatScope;
  const conversation = chatConversations[scope];
  $("chatInput").value = "";
  autoSizeChatInput();
  $("chatInput").disabled = true;
  $("chatSend").disabled = true;
  conversation.push({ role: "user", content: value });
  addChatBubble("user", value);
  const pending = addChatBubble("ai", "", "loading");
  pending.innerHTML = "<i></i><i></i><i></i>";
  $("chatThread").scrollTop = $("chatThread").scrollHeight;
  try {
    const context = scope === "library" ? buildLibraryContext(libraryItems) : currentReadingContext.text;
    const answer = await sendAsk(context, conversation);
    conversation.push({ role: "assistant", content: answer });
    pending.classList.remove("loading");
    pending.textContent = answer;
  } catch (error) {
    conversation.pop();
    pending.classList.remove("loading");
    pending.classList.add("error");
    pending.textContent = t("answerFailed", { error: localizeBackendError(error.message) });
  } finally {
    chatBusy = false;
    $("chatInput").disabled = false;
    $("chatSend").disabled = false;
    $("chatInput").focus();
    $("chatThread").scrollTop = $("chatThread").scrollHeight;
  }
}

function openLibrarySummary() {
  openChat("library");
  askFromChat(t("organizeLibraryPrompt"));
}

function autoSizeChatInput() {
  const input = $("chatInput");
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 1800);
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
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return t("externalLink"); }
}

function relativeTime(timestamp) {
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - Number(timestamp || 0)));
  if (seconds < 60) return t("justNow");
  if (seconds < 3600) return t("minutesAgo", { count: t.number(Math.floor(seconds / 60)) });
  if (seconds < 86400) return t("hoursAgo", { count: t.number(Math.floor(seconds / 3600)) });
  return t("daysAgo", { count: t.number(Math.floor(seconds / 86400)) });
}

function localizeBackendError(message) {
  const text = String(message || "");
  if (t.locale === "zh-CN" || t.locale === "zh-TW" || !/[\u3400-\u9fff]/.test(text)) return text;
  return t("translateFailed");
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
