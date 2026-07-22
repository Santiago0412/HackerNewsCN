import { cacheKey, TranslationCache } from "./lib/cache.js";
import { translateBatchResilient, askQuestion, PROMPT_VERSION } from "./lib/providers.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "./lib/settings.js";
import { articlePageNeedsInteraction, validateArticleUrl } from "./lib/article.js";

const cache = new TranslationCache(chrome.storage.local);
const inFlight = new Map();

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const current = await chrome.storage.local.get("settings");
  if (!current.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "TRANSLATE") {
    translateWithCache(message.texts).then((translations) => sendResponse({ ok: true, translations }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "ASK") {
    askViaModel(message.context, message.history).then((answer) => sendResponse({ ok: true, answer }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "CLEAR_CACHE") {
    cache.clear().then((count) => sendResponse({ ok: true, count }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "CACHE_STATS") {
    cacheStats().then(sendResponse);
    return true;
  }
  if (message?.type === "FETCH_ARTICLE") {
    fetchArticle(message.url).then((article) => sendResponse({ ok: true, ...article }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "RENDER_ARTICLE") {
    renderArticleInBackground(message.url).then((article) => sendResponse({ ok: true, ...article }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "RENDER_ARTICLE_INTERACTIVE") {
    renderArticleInteractively(message.url).then((article) => sendResponse({ ok: true, ...article }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "EXTRACT_ACTIVE_PAGE") {
    extractActivePage().then((page) => sendResponse({ ok: true, ...page }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "APPLY_ACTIVE_PAGE_TRANSLATIONS") {
    applyActivePageTranslations(message.tabId, message.items).then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function translateWithCache(inputTexts) {
  const texts = inputTexts.map((text) => String(text).trim());
  const { settings: raw } = await chrome.storage.local.get("settings");
  const settings = normalizeSettings(raw);
  const model = settings.provider === "custom" ? settings.customModel : settings.model;
  const keys = await Promise.all(texts.map((text) => cacheKey({ text, provider: settings.provider, model, promptVersion: PROMPT_VERSION })));
  const output = new Array(texts.length);
  const misses = [];

  await Promise.all(keys.map(async (key, index) => {
    const hit = await cache.get(key, settings.cacheDays);
    if (hit !== null) output[index] = hit;
    else misses.push({ key, index, text: texts[index] });
  }));

  const unique = [...new Map(misses.map((item) => [item.key, item])).values()];
  const pending = unique.filter((item) => !inFlight.has(item.key));
  if (pending.length) {
    const promise = performBatches(pending, settings);
    for (const item of pending) inFlight.set(item.key, promise.then((map) => map.get(item.key)));
  }
  try {
    await Promise.all(misses.map(async (item) => { output[item.index] = await inFlight.get(item.key); }));
  } finally {
    for (const item of pending) inFlight.delete(item.key);
  }
  cache.prune(settings.maxCacheEntries).catch(() => {});
  return output;
}

async function askViaModel(context, history) {
  const { settings: raw } = await chrome.storage.local.get("settings");
  const settings = normalizeSettings(raw);
  return askQuestion(context, history, settings);
}

async function performBatches(items, settings) {
  const result = new Map();
  try {
    let start = 0;
    while (start < items.length) {
      const batch = [];
      let characters = 0;
      while (start < items.length && batch.length < 20) {
        const next = items[start];
        if (batch.length && characters + next.text.length > 3500) break;
        batch.push(next);
        characters += next.text.length;
        start++;
      }
      const translations = await translateBatchResilient(batch.map((item) => item.text), settings);
      await Promise.all(batch.map(async (item, index) => {
        result.set(item.key, translations[index]);
        await cache.set(item.key, translations[index]);
      }));
    }
    return result;
  } catch (error) {
    throw error;
  }
}

async function cacheStats() {
  const all = await chrome.storage.local.get(null);
  const entries = Object.values(all).filter((value) => value?.translation && value?.createdAt);
  return { ok: true, count: entries.length };
}

async function fetchArticle(value) {
  let url = validateArticleUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      response = await fetch(url.href, {
        credentials: "omit",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/html,text/plain;q=0.9" }
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) throw new Error("文章网站返回了无法识别的跳转");
      const nextUrl = validateArticleUrl(new URL(location, url).href);
      if (nextUrl.hostname !== url.hostname) throw new Error(`文章跳转到了其他域名 ${nextUrl.hostname}，暂时无法安全抓取`);
      url = nextUrl;
      if (redirects === 5) throw new Error("文章网站跳转次数过多");
    }
  } catch (error) {
    if (error.name === "AbortError") throw new Error("文章网站响应超时");
    throw new Error("无法连接文章网站，可能被网站拒绝或需要额外权限");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`文章网站返回 HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new Error("该链接不是可读取的网页文章");
  const html = await response.text();
  if (html.length > 2000000) throw new Error("文章页面超过 2MB，暂不在插件内处理");
  return { html, finalUrl: response.url || url.href };
}

async function renderArticleInBackground(value) {
  const url = validateArticleUrl(value);
  let tabId;
  try {
    const tab = await chrome.tabs.create({ url: url.href, active: false });
    tabId = tab.id;
    await waitForTab(tabId, 20000);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractRenderedDocument
    });
    const article = results?.[0]?.result;
    if (!article?.blocks?.length || article.blocks.join("").length < 200) {
      throw new Error("页面渲染后仍未找到正文，可能需要登录、存在付费墙或阻止自动读取");
    }
    if (articlePageNeedsInteraction({ url: article.finalUrl || url.href, title: article.title, text: article.blocks.join(" ") })) {
      throw new Error("页面需要登录、验证或重新加载");
    }
    return article;
  } catch (error) {
    if (/Cannot access|permission|host permission/i.test(error.message)) throw new Error("没有该文章网站的读取权限，请重新点击并允许访问");
    throw error;
  } finally {
    if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
  }
}

async function renderArticleInteractively(value) {
  const url = validateArticleUrl(value);
  const matchingTabs = await chrome.tabs.query({ url: `${url.origin}/*` });
  let tab = matchingTabs.find((candidate) => {
    try {
      const candidateUrl = new URL(candidate.url);
      return candidateUrl.pathname === url.pathname && candidateUrl.search === url.search;
    } catch {
      return false;
    }
  });

  if (tab?.id) {
    tab = await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  } else {
    tab = await chrome.tabs.create({ url: url.href, active: true });
  }

  await waitForTab(tab.id, 30000).catch(() => {});
  const deadline = Date.now() + 120000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const article = await extractArticleFromTab(tab.id);
      const hasUsefulContent = article?.blocks?.length && article.blocks.join("").length >= 200;
      const hasQueryData = url.hostname !== "data.stackexchange.com" || article.structuredBlockCount > 0;
      const needsInteraction = articlePageNeedsInteraction({
        url: article?.finalUrl || url.href,
        title: article?.title,
        text: article?.blocks?.join(" ")
      });
      if (hasUsefulContent && hasQueryData && !needsInteraction) return article;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (lastError && /Cannot access|permission|host permission/i.test(lastError.message)) {
    throw new Error("没有该网页的读取权限，请允许访问后重试");
  }
  throw new Error("已打开原网页，但等待验证或正文渲染超时；请在页面完成验证后重试");
}

async function extractActivePage() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("没有找到当前网页");
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: markTranslatablePageText
  });
  const page = results?.[0]?.result;
  if (!page?.items?.length || page.items.reduce((sum, item) => sum + item.text.length, 0) < 200) {
    throw new Error("当前网页没有识别出足够的可翻译正文");
  }
  return { tabId: tab.id, ...page };
}

async function applyActivePageTranslations(tabId, items) {
  if (!Number.isInteger(tabId) || !Array.isArray(items)) throw new Error("页内翻译数据无效");
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: showInlineTranslations,
    args: [items]
  });
  const applied = results?.[0]?.result?.applied || 0;
  if (!applied) throw new Error("网页内容已变化，请重新点击翻译当前页");
  return { applied };
}

async function extractArticleFromTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractRenderedDocument
  });
  return results?.[0]?.result;
}

function markTranslatablePageText() {
  document.querySelectorAll("[data-hncn-inline-translation],#hncn-translation-toolbar,#hncn-inline-translation-style").forEach((node) => node.remove());
  document.querySelectorAll("[data-hncn-translate-id]").forEach((node) => node.removeAttribute("data-hncn-translate-id"));

  const selectors = ["article", "main", '[role="main"]', '[itemprop="articleBody"]', ".article", ".post", ".post-content", ".entry-content", ".article-content", ".story-content"];
  const candidates = [...document.querySelectorAll(selectors.join(","))];
  const score = (node) => {
    const textLength = (node.innerText || node.textContent || "").trim().length;
    const linkLength = [...node.querySelectorAll("a")].reduce((sum, link) => sum + (link.textContent || "").length, 0);
    return textLength - linkLength * 1.5 + node.querySelectorAll("p").length * 80;
  };
  const root = candidates.sort((a, b) => score(b) - score(a))[0] || document.body;
  const token = Math.random().toString(36).slice(2, 9);
  const items = [];
  let total = 0;
  for (const node of root.querySelectorAll("h1,h2,h3,p,li,blockquote")) {
    if (node.closest("nav,header,footer,aside,form,[aria-hidden=true]") || !node.getClientRects().length) continue;
    if (node.parentElement?.closest("p,li,blockquote")) continue;
    const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
    const codeLength = [...node.querySelectorAll("code,pre")].reduce((sum, code) => sum + (code.textContent || "").trim().length, 0);
    if (codeLength > text.length / 2) continue;
    if (text.length < 20 || total + text.length > 30000 || items.length >= 50) continue;
    const id = `hncn-${token}-${items.length}`;
    node.setAttribute("data-hncn-translate-id", id);
    items.push({ id, text: text.slice(0, 3000) });
    total += text.length;
  }
  return { items, finalUrl: location.href, title: document.title };
}

function showInlineTranslations(items) {
  document.querySelectorAll("[data-hncn-inline-translation],#hncn-translation-toolbar,#hncn-inline-translation-style").forEach((node) => node.remove());
  const style = document.createElement("style");
  style.id = "hncn-inline-translation-style";
  style.textContent = `
    @keyframes hncn-translation-reveal{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
    [data-hncn-inline-translation]{
      align-items:start!important;
      animation:hncn-translation-reveal .18s ease-out both!important;
      background:linear-gradient(90deg,rgba(255,92,26,.07),rgba(255,92,26,.018) 72%,transparent)!important;
      border:0!important;
      border-left:2px solid rgba(255,92,26,.52)!important;
      border-radius:2px 9px 9px 2px!important;
      box-shadow:none!important;
      color:inherit!important;
      display:grid!important;
      font-family:var(--hncn-source-font,inherit)!important;
      font-size:var(--hncn-source-size,1em)!important;
      font-style:normal!important;
      font-weight:400!important;
      gap:.62em!important;
      grid-template-columns:auto minmax(0,1fr)!important;
      letter-spacing:normal!important;
      line-height:1.72!important;
      margin:.5em 0 1em!important;
      padding:.62em .85em .66em .72em!important;
      text-align:left!important;
      text-decoration:none!important;
      text-transform:none!important;
      white-space:normal!important;
    }
    [data-hncn-translation-mark]{
      align-items:center!important;
      background:rgba(255,92,26,.11)!important;
      border:1px solid rgba(255,92,26,.2)!important;
      border-radius:999px!important;
      color:#c9420b!important;
      display:inline-flex!important;
      font:600 10px/1 system-ui,-apple-system,"PingFang SC",sans-serif!important;
      height:20px!important;
      justify-content:center!important;
      letter-spacing:0!important;
      margin-top:.18em!important;
      width:20px!important;
    }
    [data-hncn-translation-text]{display:block!important;min-width:0!important;white-space:pre-wrap!important}
    @media(prefers-color-scheme:dark){
      [data-hncn-inline-translation]{background:linear-gradient(90deg,rgba(255,122,61,.1),rgba(255,122,61,.025) 72%,transparent)!important;border-left-color:rgba(255,135,78,.62)!important}
      [data-hncn-translation-mark]{background:rgba(255,122,61,.16)!important;border-color:rgba(255,160,112,.22)!important;color:#ffae86!important}
    }
    @media(prefers-reduced-motion:reduce){[data-hncn-inline-translation]{animation:none!important}}
  `;
  document.documentElement.append(style);

  let applied = 0;
  for (const item of items) {
    const source = document.querySelector(`[data-hncn-translate-id="${CSS.escape(String(item.id))}"]`);
    if (!source || typeof item.translation !== "string") continue;
    const translation = document.createElement("div");
    translation.dataset.hncnInlineTranslation = "";
    translation.lang = "zh-CN";
    translation.dir = "auto";
    const sourceStyle = getComputedStyle(source);
    const bodySize = Number.parseFloat(getComputedStyle(document.body).fontSize) || 16;
    const sourceSize = Number.parseFloat(sourceStyle.fontSize) || bodySize;
    translation.style.setProperty("--hncn-source-font", sourceStyle.fontFamily);
    translation.style.setProperty("--hncn-source-size", `${Math.min(sourceSize, bodySize * 1.08)}px`);
    const mark = document.createElement("span");
    mark.dataset.hncnTranslationMark = "";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "译";
    const text = document.createElement("span");
    text.dataset.hncnTranslationText = "";
    text.textContent = item.translation;
    translation.append(mark, text);
    if (source.matches("li")) source.append(translation);
    else source.insertAdjacentElement("afterend", translation);
    applied++;
  }

  if (applied) {
    const toolbar = document.createElement("div");
    toolbar.id = "hncn-translation-toolbar";
    toolbar.style.cssText = "all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647";
    const shadow = toolbar.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>:host{color-scheme:light dark}.bar{align-items:center;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);background:rgba(255,255,255,.92);border:1px solid rgba(40,35,31,.12);border-radius:999px;box-shadow:0 8px 28px rgba(35,28,23,.16),0 1px 3px rgba(35,28,23,.08);color:#37322e;display:flex;font:12px/1.2 system-ui,-apple-system,"PingFang SC",sans-serif;gap:2px;padding:4px}.status{align-items:center;display:flex;gap:7px;padding:0 8px 0 7px;white-space:nowrap}.dot{background:#ff5c1a;border-radius:50%;box-shadow:0 0 0 3px rgba(255,92,26,.12);display:block;flex:none;height:6px;width:6px}button{background:transparent;border:0;border-radius:999px;color:#9d3d17;cursor:pointer;font:inherit;font-weight:600;padding:7px 9px}button:hover{background:rgba(255,92,26,.09)}#remove{color:#77706a}@media(prefers-color-scheme:dark){.bar{background:rgba(37,35,33,.9);border-color:rgba(255,255,255,.13);box-shadow:0 8px 30px rgba(0,0,0,.35);color:#eee8e2}button{color:#ffad84}#remove{color:#bbb3ac}}</style><div class="bar"><span class="status"><i class="dot"></i>译文已显示</span><button id="toggle">隐藏</button><button id="remove">移除</button></div>`;
    shadow.getElementById("toggle").addEventListener("click", (event) => {
      const translations = [...document.querySelectorAll("[data-hncn-inline-translation]")];
      const hidden = translations.some((node) => node.style.display === "none");
      translations.forEach((node) => { node.style.setProperty("display", hidden ? "block" : "none", "important"); });
      event.currentTarget.textContent = hidden ? "隐藏" : "显示";
    });
    shadow.getElementById("remove").addEventListener("click", () => {
      document.querySelectorAll("[data-hncn-inline-translation],#hncn-inline-translation-style").forEach((node) => node.remove());
      toolbar.remove();
    });
    document.documentElement.append(toolbar);
  }
  return { applied };
}

function waitForTab(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("后台渲染文章超时")), timeoutMs);
    const listener = (updatedId, changeInfo) => {
      if (updatedId === tabId && changeInfo.status === "complete") finish();
    };
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      error ? reject(error) : resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish();
    }).catch((error) => finish(error));
  });
}

function extractRenderedDocument() {
  const supplementalBlocks = [];
  for (const row of document.querySelectorAll("table tr")) {
    const cells = [...row.querySelectorAll("th,td")]
      .map((cell) => (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (cells.length >= 2) supplementalBlocks.push(cells.join(" | "));
  }
  for (const graph of document.querySelectorAll("svg,canvas,[role=img]")) {
    const label = graph.getAttribute("aria-label") || graph.getAttribute("title") || graph.textContent || "";
    const text = label.replace(/\s+/g, " ").trim();
    if (text.length >= 20) supplementalBlocks.push(text);
  }
  if (location.hostname === "data.stackexchange.com") {
    for (const code of document.querySelectorAll(".CodeMirror-code,textarea")) {
      const text = (code.value || code.innerText || code.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length >= 20) supplementalBlocks.push(text);
    }
  }
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll("script,style,noscript,nav,header,footer,aside,form,svg,canvas,iframe,button,[role=banner],[role=navigation],[aria-hidden=true]").forEach((node) => node.remove());
  const selectors = ["article", "main", '[role="main"]', '[itemprop="articleBody"]', ".article", ".post", ".post-content", ".entry-content", ".article-content", ".story-content"];
  const candidates = [...clone.querySelectorAll(selectors.join(","))];
  for (const node of clone.querySelectorAll("div,section")) {
    const marker = `${node.id} ${typeof node.className === "string" ? node.className : ""}`;
    if (/article|post|entry|story|content|main|body/i.test(marker)) candidates.push(node);
  }
  const score = (node) => {
    const textLength = (node.innerText || node.textContent || "").trim().length;
    const linkLength = [...node.querySelectorAll("a")].reduce((sum, link) => sum + (link.textContent || "").length, 0);
    const paragraphs = node.querySelectorAll("p").length;
    return textLength - linkLength * 1.5 + paragraphs * 80;
  };
  const root = [...new Set(candidates)].sort((a, b) => score(b) - score(a))[0] || clone;
  const blocks = [];
  let total = 0;
  for (const text of supplementalBlocks) {
    const clipped = text.slice(0, 3000);
    if (blocks.includes(clipped) || total + clipped.length > 30000 || blocks.length >= 50) continue;
    blocks.push(clipped);
    total += clipped.length;
  }
  for (const node of root.querySelectorAll("h1,h2,h3,p,li,blockquote,pre")) {
    const text = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length < 20 || blocks.includes(text)) continue;
    const clipped = text.slice(0, 3000);
    if (total + clipped.length > 30000 || blocks.length >= 50) break;
    blocks.push(clipped);
    total += clipped.length;
  }
  if (!blocks.length) {
    const text = (root.innerText || root.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30000);
    for (let start = 0; start < text.length; start += 2500) blocks.push(text.slice(start, start + 2500));
  }
  const title = document.querySelector('meta[property="og:title"]')?.content?.trim() || document.querySelector("h1")?.textContent?.trim() || document.title;
  return { title, blocks, finalUrl: location.href, structuredBlockCount: supplementalBlocks.length };
}
