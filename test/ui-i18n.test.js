import test from "node:test";
import assert from "node:assert/strict";
import { createTranslator, interfaceLocale } from "../src/lib/ui-i18n.js";

test("uses the selected target language for the interface", () => {
  assert.equal(createTranslator({ targetLanguage: "ja" })("settings"), "設定");
  assert.equal(createTranslator({ targetLanguage: "es" })("refresh"), "Actualizar");
  assert.equal(createTranslator({ targetLanguage: "ar" })("library"), "الإشارات والملاحظات");
});

test("falls back to English for arbitrary custom target languages", () => {
  assert.equal(interfaceLocale({ targetLanguage: "custom", customTargetLanguage: "Italiano" }), "en");
  assert.equal(createTranslator({ targetLanguage: "custom" })("settings"), "Settings");
});

test("interpolates localized messages and formats numbers", () => {
  const japanese = createTranslator("ja");
  assert.equal(japanese("comments", { count: japanese.number(1200) }), "コメント 1,200 件");
});
