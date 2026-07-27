import test from "node:test";
import assert from "node:assert/strict";
import {
  LIBRARY_KEY,
  ReadingLibrary,
  buildLibraryContext,
  exportLibraryJson,
  exportLibraryMarkdown,
  libraryItemFromStory,
  libraryItemToStory
} from "../src/lib/library.js";

class MemoryStorage {
  constructor() { this.data = {}; }
  async get(key) { return key in this.data ? { [key]: structuredClone(this.data[key]) } : {}; }
  async set(values) { Object.assign(this.data, structuredClone(values)); }
  async getBytesInUse(key) { return Buffer.byteLength(JSON.stringify(this.data[key] || null)); }
}

const story = {
  id: 123,
  title: "A useful article",
  url: "https://example.com/article",
  by: "alice",
  score: 42,
  descendants: 7,
  time: 1720000000
};

test("saves, updates, lists and removes local reading records", async () => {
  const storage = new MemoryStorage();
  let now = new Date("2026-07-01T00:00:00.000Z");
  const library = new ReadingLibrary(storage, { now: () => now });
  const input = libraryItemFromStory(story, { translatedTitle: "一篇有用的文章", excerpt: "正文摘录" });
  const saved = await library.save(input);
  assert.equal(saved.savedAt, "2026-07-01T00:00:00.000Z");
  assert.equal(saved.note, "");

  now = new Date("2026-07-02T00:00:00.000Z");
  const updated = await library.update("123", { note: "之后研究这个观点" });
  assert.equal(updated.note, "之后研究这个观点");
  assert.equal(updated.savedAt, saved.savedAt);
  assert.equal(updated.updatedAt, "2026-07-02T00:00:00.000Z");
  assert.equal((await library.list()).length, 1);
  assert.ok(await library.bytesInUse() > 0);

  const removed = await library.remove(123);
  assert.equal(removed.id, "123");
  assert.deepEqual(await library.list(), []);
  assert.deepEqual(storage.data[LIBRARY_KEY].items, {});
});

test("keeps a saved note when article metadata is enriched", async () => {
  const storage = new MemoryStorage();
  const library = new ReadingLibrary(storage, { now: () => new Date("2026-07-01T00:00:00.000Z") });
  await library.save({ ...libraryItemFromStory(story), note: "重要笔记" });
  await library.save({ ...libraryItemFromStory(story, { translatedTitle: "新译名", excerpt: "新摘录" }), note: undefined });
  const item = await library.get(123);
  assert.equal(item.note, "重要笔记");
  assert.equal(item.translatedTitle, "新译名");
  assert.equal(item.excerpt, "新摘录");
});

test("round-trips a saved item to an HN story shape", () => {
  const item = libraryItemFromStory(story, { translatedTitle: "译名" });
  assert.deepEqual(libraryItemToStory(item), {
    id: 123,
    title: story.title,
    url: story.url,
    by: story.by,
    score: story.score,
    descendants: story.descendants,
    time: story.time,
    text: ""
  });
});

test("exports readable Markdown and lossless JSON with notes", () => {
  const item = {
    ...libraryItemFromStory(story, { translatedTitle: "一篇有用的文章" }),
    savedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    note: "我的笔记"
  };
  const exportedAt = new Date("2026-07-03T08:00:00.000Z");
  const markdown = exportLibraryMarkdown([item], exportedAt);
  assert.match(markdown, /# Hacker News 收藏与笔记/);
  assert.match(markdown, /一篇有用的文章/);
  assert.match(markdown, /我的笔记/);
  assert.match(markdown, /https:\/\/example\.com\/article/);
  const json = JSON.parse(exportLibraryJson([item], exportedAt));
  assert.equal(json.format, "hacker-news-cn-library");
  assert.equal(json.items[0].note, "我的笔记");
});

test("builds a bounded model context from titles, notes and excerpts", () => {
  const item = {
    ...libraryItemFromStory(story, { translatedTitle: "一篇有用的文章", excerpt: "很长的正文摘录".repeat(100) }),
    savedAt: "2026-07-01T00:00:00.000Z",
    note: "我的核心想法"
  };
  const context = buildLibraryContext([item], 320);
  assert.ok(context.length <= 320);
  assert.match(context, /一篇有用的文章/);
  assert.match(context, /我的核心想法/);
});

test("prioritizes every saved title and note before long excerpts", () => {
  const first = {
    ...libraryItemFromStory(story, { translatedTitle: "第一篇", excerpt: "第一篇正文".repeat(2000) }),
    savedAt: "2026-07-02T00:00:00.000Z",
    note: "第一条笔记"
  };
  const second = {
    ...libraryItemFromStory({ ...story, id: 124, title: "Second", url: "https://example.org/second" }, { translatedTitle: "第二篇", excerpt: "第二篇正文".repeat(2000) }),
    savedAt: "2026-07-01T00:00:00.000Z",
    note: "第二条笔记"
  };
  const context = buildLibraryContext([first, second], 1000);
  assert.ok(context.length <= 1000);
  assert.match(context, /第一篇/);
  assert.match(context, /第一条笔记/);
  assert.match(context, /第二篇/);
  assert.match(context, /第二条笔记/);
});
