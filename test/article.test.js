import test from "node:test";
import assert from "node:assert/strict";
import { permissionPattern, validateArticleUrl } from "../src/lib/article.js";

test("accepts public article URLs and derives a narrow permission", () => {
  assert.equal(validateArticleUrl("https://example.com/post?id=1").hostname, "example.com");
  assert.equal(permissionPattern("https://example.com:8443/post"), "https://example.com:8443/*");
});

test("rejects non-web and explicit private-network URLs", () => {
  for (const url of ["file:///etc/passwd", "http://localhost/a", "http://127.0.0.1/a", "http://192.168.1.1/a", "http://172.20.0.2/a", "http://device.local/a"]) {
    assert.throws(() => validateArticleUrl(url));
  }
});
