import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]
  .find((path) => path && existsSync(path));

test("first-run save stays visible while fields scroll, and saving opens the reader", { skip: !chrome && "Set CHROME_PATH to run browser layout checks" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hncn-onboarding-"));
  const files = new Map();
  for (const file of ["src/popup.html", "src/popup.css", "src/popup.js", "src/lib/article.js", "src/lib/settings.js", "src/lib/ui-i18n.js", "src/lib/library.js", "assets/logo.svg"]) {
    files.set(`/${file}`, await readFile(new URL(`../${file}`, import.meta.url), "utf8"));
  }
  files.set("/src/popup.html", files.get("/src/popup.html").replace('<script type="module"', `<script>
    const stored = { uiScale: Number(new URLSearchParams(location.search).get("scale")) };
    window.chrome = { storage: { local: {
      get: async () => structuredClone(stored),
      set: async (value) => Object.assign(stored, structuredClone(value))
    } } };
    window.fetch = async () => new Response("[]", { headers: { "Content-Type": "application/json" } });
  </script><script type="module"`));
  files.set("/", `<!doctype html><meta charset="utf-8"><iframe style="border:0"></iframe><pre id="result"></pre>
    <script>
      (async () => {
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        const waitFor = async (condition) => {
          for (let attempt = 0; attempt < 100; attempt++) {
            if (condition()) return;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          throw new Error("Timed out waiting for popup initialization or save");
        };
        const frame = document.querySelector("iframe");
        try {
          for (const [width, height, scale] of [[360, 540, 1.1], [600, 840, 1.1], [500, 500, 1.5]]) {
            frame.style.width = width + "px";
            frame.style.height = height + "px";
            await new Promise((resolve) => { frame.onload = resolve; frame.src = "/src/popup.html?scale=" + scale; });
            const win = frame.contentWindow;
            const doc = frame.contentDocument;
            const get = (id) => doc.getElementById(id);
            await waitFor(() => !get("onboarding").hidden && get("onboardingTopics").children.length === 8);
            const button = get("startReading");
            const checkButton = () => {
              const rect = button.getBoundingClientRect();
              check(rect.width > 0 && rect.height > 0, "Save must be rendered");
              check(rect.top >= 0 && rect.bottom <= height && rect.left >= 0 && rect.right <= width, "Save must be fully visible at " + width + "x" + height + ", scale " + scale);
              check(doc.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button, "Save must be clickable, not covered");
            };
            checkButton();
            check(win.getComputedStyle(get("main")).display === "none", "Empty reader must not take onboarding space");
            check(/0\.10/.test(get("onboardingGuide").textContent), "Default hosted setup must explain the daily quota");
            get("onboardingModel").value = "0";
            get("onboardingModel").dispatchEvent(new win.Event("change"));
            button.click();
            check(get("onboardingError").textContent.length > 0, "Missing key must show validation next to save");
            checkButton();
            // Extra provider fields and zoom must not push the action out of view.
            get("onboardingModel").value = "4";
            get("onboardingModel").dispatchEvent(new win.Event("change"));
            check(!get("onboardingCustomProvider").hidden, "Custom fields must appear");
            const fields = doc.querySelector(".onboarding-fields");
            check(fields.scrollHeight > fields.clientHeight, "Long form must scroll");
            const top = button.getBoundingClientRect().top;
            fields.scrollTop = fields.scrollHeight;
            check(fields.scrollTop > 0, "Fields must be scrollable");
            checkButton();
            check(Math.abs(button.getBoundingClientRect().top - top) < 1, "Save must stay fixed while fields scroll");
            get("onboardingModel").value = "2";
            get("onboardingModel").dispatchEvent(new win.Event("change"));
            get("onboardingKey").value = "";
            check(/0\.10/.test(get("onboardingGuide").textContent), "Hosted DeepSeek must explain the daily quota");
            button.click();
            await waitFor(() => get("onboarding").hidden);
            const saved = await win.chrome.storage.local.get("settings");
            check(saved.settings.setupCompleted && saved.settings.apiKey === "", "Hosted save must persist without a key");
            check(saved.settings.provider === "deepseek" && saved.settings.useHostedGateway === true, "Save must keep hosted DeepSeek");
            check(win.getComputedStyle(get("main")).display !== "none" && get("main").getBoundingClientRect().height > 0, "Reader must return after saving");
            check(!get("feeds").hidden, "Reader navigation must return after saving");
          }
          document.body.dataset.hncnTest = "passed";
        } catch (error) { document.getElementById("result").textContent = error.stack; }
      })();
    </script>`);
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const body = files.get(path);
    response.writeHead(body === undefined ? 404 : 200, { "Content-Type": path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : "text/html; charset=utf-8" });
    response.end(body || "Not found");
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const { stdout } = await promisify(execFile)(chrome, [
      "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-background-networking", "--disable-sync", "--force-prefers-reduced-motion",
      `--user-data-dir=${join(directory, "profile")}`, "--window-size=1000,1000",
      "--virtual-time-budget=10000", "--dump-dom", `http://127.0.0.1:${server.address().port}/`
    ], { timeout: 30000, maxBuffer: 1024 * 1024 });
    assert.ok(stdout.includes('data-hncn-test="passed"'), stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || "Browser checks did not finish");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
