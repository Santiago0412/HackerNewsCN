export const LIBRARY_KEY = "readingLibrary";
export const LIBRARY_VERSION = 1;

const MAX_NOTE_LENGTH = 20000;
const MAX_EXCERPT_LENGTH = 12000;

export class ReadingLibrary {
  constructor(storage, { now = () => new Date() } = {}) {
    this.storage = storage;
    this.now = now;
  }

  async list() {
    const data = await this.#read();
    return Object.values(data.items).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  }

  async get(id) {
    const data = await this.#read();
    return data.items[String(id)] || null;
  }

  async save(input) {
    const data = await this.#read();
    const id = String(input?.id || "").trim();
    if (!id) throw new Error("收藏缺少文章 ID");
    const existing = data.items[id];
    const timestamp = this.now().toISOString();
    data.items[id] = normalizeItem({
      ...existing,
      ...input,
      id,
      note: input.note === undefined ? existing?.note || "" : input.note,
      savedAt: existing?.savedAt || (input.savedAt && Date.parse(input.savedAt) > 0 ? input.savedAt : timestamp),
      updatedAt: timestamp
    });
    await this.storage.set({ [LIBRARY_KEY]: data });
    return data.items[id];
  }

  async update(id, patch) {
    const data = await this.#read();
    const key = String(id);
    if (!data.items[key]) throw new Error("这篇文章尚未收藏");
    data.items[key] = normalizeItem({
      ...data.items[key],
      ...patch,
      id: key,
      savedAt: data.items[key].savedAt,
      updatedAt: this.now().toISOString()
    });
    await this.storage.set({ [LIBRARY_KEY]: data });
    return data.items[key];
  }

  async remove(id) {
    const data = await this.#read();
    const key = String(id);
    const removed = data.items[key] || null;
    delete data.items[key];
    await this.storage.set({ [LIBRARY_KEY]: data });
    return removed;
  }

  async bytesInUse() {
    if (typeof this.storage.getBytesInUse !== "function") return null;
    return this.storage.getBytesInUse(LIBRARY_KEY);
  }

  async #read() {
    const stored = await this.storage.get(LIBRARY_KEY);
    const raw = stored?.[LIBRARY_KEY];
    if (!raw || typeof raw !== "object") return { version: LIBRARY_VERSION, items: {} };
    const source = raw.items && typeof raw.items === "object" ? raw.items : {};
    const items = {};
    for (const [id, item] of Object.entries(source)) {
      if (!item || typeof item !== "object") continue;
      try { items[id] = normalizeItem({ ...item, id }); } catch { /* skip malformed records */ }
    }
    return { version: LIBRARY_VERSION, items };
  }
}

export function libraryItemFromStory(story, { translatedTitle = "", excerpt = "" } = {}) {
  const id = String(story?.id || "").trim();
  if (!id) throw new Error("文章缺少 Hacker News ID");
  const url = cleanText(story.url) || `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`;
  return normalizeItem({
    id,
    title: story.title,
    translatedTitle,
    url,
    discussionUrl: `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`,
    author: story.by,
    score: story.score,
    commentCount: story.descendants,
    publishedAt: Number(story.time) || 0,
    note: "",
    excerpt
  });
}

export function libraryItemToStory(item) {
  return {
    id: Number(item.id) || item.id,
    title: item.title,
    url: item.url === item.discussionUrl ? "" : item.url,
    by: item.author,
    score: item.score,
    descendants: item.commentCount,
    time: item.publishedAt,
    text: item.excerpt || ""
  };
}

export function exportLibraryMarkdown(items, exportedAt = new Date()) {
  const rows = [...items].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  const lines = [
    "# Hacker News 收藏与笔记",
    "",
    `> 导出时间：${formatDate(exportedAt)} · 共 ${rows.length} 篇`,
    ""
  ];
  rows.forEach((item, index) => {
    const title = item.translatedTitle || item.title || "未命名文章";
    lines.push(`## ${index + 1}. ${escapeMarkdown(title)}`, "");
    if (item.translatedTitle && item.title && item.translatedTitle !== item.title) {
      lines.push(`**原标题：** ${escapeMarkdown(item.title)}  `);
    }
    lines.push(`**文章：** ${item.url}  `, `**讨论：** ${item.discussionUrl}  `);
    const metadata = [item.author && `作者 ${item.author}`, `${item.score || 0} 分`, `${item.commentCount || 0} 条讨论`, `收藏于 ${formatDate(item.savedAt)}`].filter(Boolean).join(" · ");
    lines.push(`**信息：** ${metadata}`, "");
    if (item.note) lines.push("### 笔记", "", item.note.trim(), "");
    lines.push("---", "");
  });
  return lines.join("\n").trimEnd() + "\n";
}

export function exportLibraryJson(items, exportedAt = new Date()) {
  return JSON.stringify({
    format: "hacker-news-cn-library",
    version: LIBRARY_VERSION,
    exportedAt: exportedAt.toISOString(),
    items: [...items]
  }, null, 2) + "\n";
}

export function buildLibraryContext(items, maxCharacters = 11000) {
  const header = `我的 Hacker News 收藏（共 ${items.length} 篇）。以下内容只包含收藏时保存的标题、笔记和正文摘录。`;
  if (!items.length || maxCharacters <= header.length + 2) return header.slice(0, maxCharacters);
  const separators = items.length * 2;
  const perItem = Math.max(1, Math.min(1200, Math.floor((maxCharacters - header.length - separators) / items.length)));
  const blocks = items.map((item, index) => {
    const essentials = [
      `[${index + 1}] ${item.translatedTitle || item.title}`,
      item.translatedTitle && item.title !== item.translatedTitle ? `原标题：${item.title}` : "",
      `来源：${safeHostname(item.url)}；收藏时间：${formatDate(item.savedAt)}`,
      item.note ? `我的笔记：${item.note}` : ""
    ].filter(Boolean).join("\n");
    return essentials.length > perItem ? `${essentials.slice(0, perItem - 1)}…` : essentials;
  });
  let remaining = maxCharacters - header.length - separators - blocks.reduce((sum, block) => sum + block.length, 0);
  const excerptIndexes = items.map((item, index) => item.excerpt ? index : -1).filter((index) => index >= 0);
  excerptIndexes.forEach((index, position) => {
    if (remaining < 24) return;
    const share = Math.floor(remaining / (excerptIndexes.length - position));
    const prefix = "\n内容摘录：";
    if (share <= prefix.length + 12) return;
    const rawExcerpt = items[index].excerpt;
    const truncated = rawExcerpt.length > share - prefix.length;
    const excerpt = rawExcerpt.slice(0, share - prefix.length - (truncated ? 1 : 0));
    blocks[index] += `${prefix}${excerpt}${truncated ? "…" : ""}`;
    remaining -= prefix.length + excerpt.length + (truncated ? 1 : 0);
  });
  return [header, ...blocks].join("\n\n");
}

function normalizeItem(value) {
  const id = cleanText(value.id);
  if (!id) throw new Error("收藏缺少文章 ID");
  const url = cleanText(value.url);
  return {
    id,
    title: cleanText(value.title) || "未命名文章",
    translatedTitle: cleanText(value.translatedTitle),
    url,
    discussionUrl: cleanText(value.discussionUrl) || `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`,
    author: cleanText(value.author),
    score: finiteNumber(value.score),
    commentCount: finiteNumber(value.commentCount),
    publishedAt: finiteNumber(value.publishedAt),
    savedAt: validIso(value.savedAt) || new Date(0).toISOString(),
    updatedAt: validIso(value.updatedAt) || validIso(value.savedAt) || new Date(0).toISOString(),
    note: cleanText(value.note).slice(0, MAX_NOTE_LENGTH),
    excerpt: cleanText(value.excerpt).slice(0, MAX_EXCERPT_LENGTH)
  };
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function validIso(value) {
  if (!value || Number.isNaN(Date.parse(value))) return "";
  return new Date(value).toISOString();
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function safeHostname(value) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return "news.ycombinator.com"; }
}

function escapeMarkdown(value) {
  return String(value).replace(/([\\`*_{}\[\]()#+.!|>-])/g, "\\$1");
}
