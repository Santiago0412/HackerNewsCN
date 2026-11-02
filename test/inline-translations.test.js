import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const chrome = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].find((path) => path && existsSync(path));
const background = await readFile(new URL("../src/background.js", import.meta.url), "utf8");
// Execute the same self-contained functions Chrome injects into article pages.
const injected = background.slice(background.indexOf("function markTranslatablePageText()"), background.indexOf("function waitForTab("));

for (const width of [1440, 500]) {
  test(`inline translations stay below their source at ${width}px`, { skip: !chrome && "Set CHROME_PATH to run browser layout checks" }, async () => {
    const directory = await mkdtemp(join(tmpdir(), "hncn-layout-"));
    try {
      const file = join(directory, "fixture.html");
      await writeFile(file, `<!doctype html><meta charset="utf-8">
        <style>
          body { margin: 20px; font: 18px/1.5 sans-serif; }
          .grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }
          .grid > p, .grid > h2 { grid-column: 3 / span 8; width: 100%; max-width: 760px; justify-self: center; }
          .flex { display: flex; gap: 16px; }
          .flex > p { flex: 1; min-width: 0; }
          .flex > aside { flex: 0 0 80px; }
          .normal > p { max-width: 760px; }
          @media (max-width: 600px) { .grid > p, .grid > h2 { grid-column: 1 / -1; } }
        </style>
        <main>
          <section class="grid">
            <h2>Context engineering and prompt engineering</h2>
            <p>After a few years of <strong>prompt engineering</strong>, context engineering has become an important part of building capable agents.</p>
            <p>This second paragraph must stay in the reading column, with its translation immediately below the original text.</p>
          </section>
          <section class="flex">
            <p>A paragraph in a horizontal flex layout should keep its translation inside the same reading area.</p>
            <aside>Sidebar</aside>
          </section>
          <section class="normal">
            <p>Ordinary document flow with an <a href="#example">original link</a> should continue to display the translated text below the paragraph.</p>
            <blockquote>A quoted paragraph should remain readable and preserve the original content when translations are removed.</blockquote>
            <ul><li>A list item should keep its translation inside the item without adding an extra bullet.</li></ul>
          </section>
        </main>
        <pre id="test-result"></pre>
        <script>${injected}
          try {
            const check = (condition, message) => { if (!condition) throw new Error(message); };
            check(innerWidth === ${width}, "Expected viewport width ${width}, got " + innerWidth);
            const labels = { lang: "zh-CN", mark: "译", status: "已翻译", hide: "隐藏", show: "显示", remove: "移除" };
            const translated = "译文应当在原文下方，保持正文宽度，并随窗口尺寸调整。".repeat(5) + "<img src=x onerror=alert(1)>";
            const main = document.querySelector("main");
            const originalHTML = main.innerHTML;
            const originalLink = main.querySelector("a");
            let clicks = 0;
            originalLink.addEventListener("click", (event) => { event.preventDefault(); clicks++; });
            const page = markTranslatablePageText();
            check(page.items.length === 7, "All fixture blocks must be extracted");
            const sources = page.items.map(({ id }) => document.querySelector('[data-hncn-translate-id="' + id + '"]'));
            const originalWidths = sources.map((source) => source.getBoundingClientRect().width);
            const apply = (items) => showInlineTranslations(items.map(({ id }) => ({ id, translation: translated })), labels);
            check(apply(page.items).applied === page.items.length, "All translations must be applied");
            const translations = () => [...document.querySelectorAll("[data-hncn-inline-translation]")];
            translations().forEach((translation, index) => {
              const source = sources[index];
              const range = document.createRange();
              range.selectNodeContents(source);
              if (source.contains(translation)) range.setEndBefore(translation);
              const original = range.getBoundingClientRect();
              const rect = translation.getBoundingClientRect();
              check(rect.top >= original.bottom - 1, "Translation " + index + " must be below the original");
              check(rect.width >= originalWidths[index] * 0.95, "Translation " + index + " must not collapse into a narrow column");
              check(Math.abs(source.getBoundingClientRect().width - originalWidths[index]) < 1, "Source width must remain unchanged");
              check(rect.right <= innerWidth && rect.left >= 0, "Translation must fit the viewport");
              check(translation.querySelector("[data-hncn-translation-text]").textContent === translated, "Translation text must be preserved");
              check(!translation.querySelector("img"), "Translation must not be interpreted as HTML");
              check(translation.lang === "zh-CN" && translation.dir === "auto", "Translation language must be preserved");
              const markRect = translation.querySelector("[data-hncn-translation-mark]").getBoundingClientRect();
              const textNode = translation.querySelector("[data-hncn-translation-text]");
              const firstLineCenter = textNode.getBoundingClientRect().top + parseFloat(getComputedStyle(textNode).lineHeight) / 2;
              check(Math.abs(markRect.top + markRect.height / 2 - firstLineCenter) < 1, "Badge must be centered on the first line, not on the whole paragraph");
              check(translation.scrollWidth <= translation.clientWidth + 1, "Translation must not overflow horizontally");
            });
            const shadow = document.getElementById("hncn-translation-toolbar").shadowRoot;
            shadow.getElementById("toggle").click();
            check(translations().every((node) => getComputedStyle(node).display === "none"), "Hide must hide all translations");
            shadow.getElementById("toggle").click();
            check(translations().every((node) => getComputedStyle(node).display === "grid"), "Show must restore the badge/text grid");
            apply(page.items);
            check(translations().length === page.items.length, "Reapplying must not duplicate translations");
            const again = markTranslatablePageText();
            check(JSON.stringify(again.items.map((item) => item.text)) === JSON.stringify(page.items.map((item) => item.text)), "Retranslation must extract only original text");
            apply(again.items);
            document.getElementById("hncn-translation-toolbar").shadowRoot.getElementById("remove").click();
            check(!document.querySelector("[data-hncn-inline-translation],#hncn-inline-translation-style,#hncn-translation-toolbar"), "Remove must clean up injected elements");
            sources.forEach((source) => source.removeAttribute("data-hncn-translate-id"));
            check(main.innerHTML === originalHTML, "Remove must restore the original markup");
            originalLink.click();
            check(main.querySelector("a") === originalLink && clicks === 1, "Original elements and listeners must survive");
            for (const size of [12, 32]) {
              document.body.style.fontSize = size + "px";
              apply(markTranslatablePageText().items);
              translations().forEach((translation) => {
                const mark = translation.querySelector("[data-hncn-translation-mark]").getBoundingClientRect();
                const text = translation.querySelector("[data-hncn-translation-text]");
                text.textContent = "https://example.com/" + "unbroken".repeat(80);
                const lineCenter = text.getBoundingClientRect().top + parseFloat(getComputedStyle(text).lineHeight) / 2;
                check(Math.abs(mark.top + mark.height / 2 - lineCenter) < 1, "Badge alignment must follow source font size " + size);
                check(translation.scrollWidth <= translation.clientWidth + 1, "Long URLs must wrap at font size " + size);
              });
            }
            document.body.dataset.hncnTest = "passed";
          } catch (error) {
            document.getElementById("test-result").textContent = error.stack;
          }
        </script>`);
      const { stdout } = await promisify(execFile)(chrome, [
        "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        "--disable-background-networking", "--disable-sync", "--force-prefers-reduced-motion",
        `--user-data-dir=${join(directory, "profile")}`, `--window-size=${width},1000`,
        "--dump-dom", pathToFileURL(file).href
      ], { timeout: 30000, maxBuffer: 1024 * 1024 });
      assert.ok(stdout.includes('data-hncn-test="passed"'), stdout.match(/<pre id="test-result">([\s\S]*?)<\/pre>/)?.[1] || "Browser checks did not run");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
