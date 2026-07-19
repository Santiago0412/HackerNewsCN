const PREFIX = "translation:";

export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function cacheKey({ text, provider, model, promptVersion = "v1" }) {
  return PREFIX + await sha256(JSON.stringify([promptVersion, provider, model, text.trim()]));
}

export class TranslationCache {
  constructor(storage, { now = () => Date.now() } = {}) {
    this.storage = storage;
    this.now = now;
  }

  async get(key, ttlDays) {
    const result = await this.storage.get(key);
    const entry = result[key];
    if (!entry) return null;
    if (this.now() - entry.createdAt > ttlDays * 86400000) {
      await this.storage.remove(key);
      return null;
    }
    entry.lastAccessedAt = this.now();
    await this.storage.set({ [key]: entry });
    return entry.translation;
  }

  async set(key, translation) {
    const timestamp = this.now();
    await this.storage.set({
      [key]: { translation, createdAt: timestamp, lastAccessedAt: timestamp }
    });
  }

  async prune(maxEntries) {
    const all = await this.storage.get(null);
    const entries = Object.entries(all).filter(([key]) => key.startsWith(PREFIX));
    if (entries.length <= maxEntries) return 0;
    entries.sort((a, b) => (a[1].lastAccessedAt || a[1].createdAt) - (b[1].lastAccessedAt || b[1].createdAt));
    const remove = entries.slice(0, entries.length - maxEntries).map(([key]) => key);
    await this.storage.remove(remove);
    return remove.length;
  }

  async clear() {
    const all = await this.storage.get(null);
    const keys = Object.keys(all).filter((key) => key.startsWith(PREFIX));
    if (keys.length) await this.storage.remove(keys);
    return keys.length;
  }
}
