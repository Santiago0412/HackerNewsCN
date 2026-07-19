import { cacheKey, TranslationCache } from "./lib/cache.js";
import { translateBatchResilient, PROMPT_VERSION } from "./lib/providers.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "./lib/settings.js";
import { validateArticleUrl } from "./lib/article.js";

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
    return article;
  } catch (error) {
    if (/Cannot access|permission|host permission/i.test(error.message)) throw new Error("没有该文章网站的读取权限，请重新点击并允许访问");
    throw error;
  } finally {
    if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
  }
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
  return { title, blocks, finalUrl: location.href };
}
