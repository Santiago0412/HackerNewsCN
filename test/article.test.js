import test from "node:test";
import assert from "node:assert/strict";
import { articlePageNeedsInteraction, permissionPattern, validateArticleUrl } from "../src/lib/article.js";

test("accepts public article URLs and derives a narrow permission", () => {
  assert.equal(validateArticleUrl("https://example.com/post?id=1").hostname, "example.com");
  assert.equal(permissionPattern("https://example.com:8443/post"), "https://example.com:8443/*");
});

test("rejects non-web and explicit private-network URLs", () => {
  for (const url of ["file:///etc/passwd", "http://localhost/a", "http://127.0.0.1/a", "http://192.168.1.1/a", "http://172.20.0.2/a", "http://device.local/a"]) {
    assert.throws(() => validateArticleUrl(url));
  }
});

test("recognizes authentication and challenge pages without rejecting ordinary articles", () => {
  assert.equal(articlePageNeedsInteraction({
    url: "https://github.com/login?return_to=%2Fopenai%2Fcodex%2Fpull%2F33972",
    title: "Sign in to GitHub",
    text: "Username or email address Password Sign in"
  }), true);
  assert.equal(articlePageNeedsInteraction({
    url: "https://example.com/how-login-systems-work",
    title: "How login systems work",
    text: "This article explains authentication without asking the reader to sign in."
  }), false);
  assert.equal(articlePageNeedsInteraction({
    url: "https://example.com/article",
    title: "Just a moment...",
    text: "Checking your browser before accessing the site"
  }), true);
});

test("recognizes a failed GitHub pull request shell as non-article content", () => {
  assert.equal(articlePageNeedsInteraction({
    url: "https://github.com/openai/codex/pull/33972",
    title: "Backport refreshed bundled model metadata to 0.144",
    text: "There was an error while loading. Please reload this page. Notifications You must be signed in to change notification settings. No files selected to view"
  }), true);
  assert.equal(articlePageNeedsInteraction({
    url: "https://github.com/openai/codex/pull/33972",
    title: "Backport refreshed bundled model metadata to 0.144",
    text: "This pull request updates the bundled model metadata and includes review discussion."
  }), false);
});
