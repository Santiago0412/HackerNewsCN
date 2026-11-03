const INSTALL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isInstallId(value) {
  return typeof value === "string" && INSTALL_ID_RE.test(value);
}

export async function ensureInstallId(storage) {
  const store = storage || globalThis.chrome?.storage?.local;
  if (!store?.get || !store?.set) throw new Error("无法生成本机安装标识");
  const stored = await store.get("installId");
  if (isInstallId(stored?.installId)) return stored.installId;
  const installId = crypto.randomUUID();
  await store.set({ installId });
  const confirmed = await store.get("installId");
  return isInstallId(confirmed?.installId) ? confirmed.installId : installId;
}
