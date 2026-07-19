const PRIVATE_IPV4 = /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

export function validateArticleUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("文章链接无效"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("只支持读取 HTTP 或 HTTPS 文章");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname === "::1" || hostname.endsWith(".local") || PRIVATE_IPV4.test(hostname)) {
    throw new Error("出于安全原因，不能读取本机或内网地址");
  }
  return url;
}

export function permissionPattern(value) {
  const url = validateArticleUrl(value);
  return `${url.protocol}//${url.host}/*`;
}
