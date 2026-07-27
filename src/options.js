import {
  LANGUAGE_CHOICES,
  MODEL_CHOICES,
  customEndpointPermission,
  normalizeSettings,
  resolveTargetLanguage,
  selectedModelIndex,
  validateConfiguration
} from "./lib/settings.js";
import { applyDocumentTranslations, createTranslator } from "./lib/ui-i18n.js";

const TOPIC_KEYS = { ai: "topicAI", programming: "topicProgramming", startup: "topicStartup", security: "topicSecurity", science: "topicScience", hardware: "topicHardware", design: "topicDesign", culture: "topicCulture" };
const $ = (id) => document.getElementById(id);
let currentSettings;
let t = createTranslator("en");

init();

async function init() {
  for (const choice of LANGUAGE_CHOICES) $("targetLanguage").add(new Option(choice.value === "custom" ? t("otherLanguage") : choice.label, choice.value));
  for (const [index, choice] of MODEL_CHOICES.entries()) {
    const option = new Option(choice.label, String(index));
    $("modelChoice").add(option);
  }
  for (const [value, key] of Object.entries(TOPIC_KEYS)) {
    const node = document.createElement("label");
    node.className = "topic";
    node.innerHTML = `<input type="checkbox" value="${value}"><span data-i18n="${key}"></span>`;
    $("topics").append(node);
  }
  const stored = await chrome.storage.local.get("settings");
  currentSettings = normalizeSettings(stored.settings);
  t = applyDocumentTranslations(document, currentSettings);
  $("targetLanguage").value = currentSettings.targetLanguage;
  $("customTargetLanguage").value = currentSettings.customTargetLanguage;
  $("modelChoice").value = String(selectedModelIndex(currentSettings));
  $("apiKey").value = currentSettings.apiKey;
  $("customEndpoint").value = currentSettings.customEndpoint;
  $("customModel").value = currentSettings.customModel;
  document.querySelectorAll('#topics input').forEach((input) => input.checked = currentSettings.topics.includes(input.value));
  refreshLocalizedChoices();
  updateLanguageFields();
  updateGuide();
  $("targetLanguage").addEventListener("change", updateLanguageFields);
  $("modelChoice").addEventListener("change", updateGuide);
  $("toggleToken").addEventListener("click", () => $("apiKey").type = $("apiKey").type === "password" ? "text" : "password");
  $("save").addEventListener("click", save);
}

function selectedModel() {
  return MODEL_CHOICES[Number($("modelChoice").value)] || MODEL_CHOICES[0];
}

function updateGuide() {
  const choice = selectedModel();
  const custom = choice.provider === "custom";
  $("customProviderFields").hidden = !custom;
  if (custom) {
    $("keyGuide").innerHTML = `<strong>${escapeHtml(t("customProviderTitle"))}</strong><p>${escapeHtml(t("customProviderGuide"))}</p>`;
  } else {
    $("keyGuide").innerHTML = `<strong>${escapeHtml(t("noKey"))}</strong><ol><li><a href="${choice.keyUrl}" target="_blank" rel="noreferrer">${escapeHtml(t("openSite", { site: choice.keySite }))}</a></li><li>${escapeHtml(t("createKey"))}</li><li>${escapeHtml(t("pasteBelow"))}</li></ol><p>${escapeHtml(t("endpointAutomatic"))}</p>`;
  }
}

function updateLanguageFields() {
  const custom = $("targetLanguage").value === "custom";
  $("customLanguageField").hidden = !custom;
  t = applyDocumentTranslations(document, { targetLanguage: $("targetLanguage").value });
  refreshLocalizedChoices();
  updateGuide();
  setStatus(custom ? t("targetFallback") : "", false);
  if (custom) requestAnimationFrame(() => $("customTargetLanguage").focus());
}

function refreshLocalizedChoices() {
  [...$("targetLanguage").options].forEach((option, index) => { option.textContent = LANGUAGE_CHOICES[index].value === "custom" ? t("otherLanguage") : LANGUAGE_CHOICES[index].label; });
  [...$("modelChoice").options].forEach((option, index) => {
    option.textContent = MODEL_CHOICES[index].provider === "custom" ? t("customProvider") : MODEL_CHOICES[index].label;
  });
  document.querySelectorAll("#topics [data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
}

async function save() {
  const apiKey = $("apiKey").value.trim();
  if (!apiKey) return setStatus(t("keyRequired"), true);
  if (!/^[\x21-\x7E]+$/.test(apiKey)) return setStatus(t("keyInvalid"), true);
  const choice = selectedModel();
  const topics = [...document.querySelectorAll('#topics input:checked')].map((input) => input.value);
  try {
    const nextSettings = validateConfiguration({
      ...currentSettings,
      targetLanguage: $("targetLanguage").value,
      customTargetLanguage: $("customTargetLanguage").value,
      provider: choice.provider,
      model: choice.model,
      apiKey,
      customEndpoint: $("customEndpoint").value,
      customModel: $("customModel").value,
      topics,
      topicMode: "favorites",
      autoTranslateTitles: true,
      showOriginal: true,
      setupCompleted: true
    });
    if (choice.provider === "custom") {
      const granted = await chrome.permissions.request({ origins: [customEndpointPermission(nextSettings.customEndpoint)] });
      if (!granted) return setStatus(t("endpointPermissionDenied"), true);
    }
    currentSettings = nextSettings;
    await chrome.storage.local.set({ settings: currentSettings });
    setStatus(t("settingsSaved", { language: resolveTargetLanguage(currentSettings).label }), false);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function setStatus(message, error) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
