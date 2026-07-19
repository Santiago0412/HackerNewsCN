import { MODEL_CHOICES, normalizeSettings } from "./lib/settings.js";

const TOPICS = { ai: "人工智能", programming: "编程开发", startup: "创业商业", security: "安全隐私", science: "科学研究", hardware: "硬件设备", design: "设计体验", culture: "文化社会" };
const $ = (id) => document.getElementById(id);
let currentSettings;

init();

async function init() {
  for (const [index, choice] of MODEL_CHOICES.entries()) {
    const option = new Option(choice.label, String(index));
    $("modelChoice").add(option);
  }
  for (const [value, label] of Object.entries(TOPICS)) {
    const node = document.createElement("label");
    node.className = "topic";
    node.innerHTML = `<input type="checkbox" value="${value}"><span>${label}</span>`;
    $("topics").append(node);
  }
  const stored = await chrome.storage.local.get("settings");
  currentSettings = normalizeSettings(stored.settings);
  const selectedIndex = MODEL_CHOICES.findIndex((item) => item.provider === currentSettings.provider && item.model === currentSettings.model);
  $("modelChoice").value = String(selectedIndex >= 0 ? selectedIndex : 0);
  $("apiKey").value = currentSettings.apiKey;
  document.querySelectorAll('#topics input').forEach((input) => input.checked = currentSettings.topics.includes(input.value));
  updateGuide();
  $("modelChoice").addEventListener("change", updateGuide);
  $("toggleToken").addEventListener("click", () => $("apiKey").type = $("apiKey").type === "password" ? "text" : "password");
  $("save").addEventListener("click", save);
}

function selectedModel() {
  return MODEL_CHOICES[Number($("modelChoice").value)] || MODEL_CHOICES[0];
}

function updateGuide() {
  const choice = selectedModel();
  $("keyGuide").innerHTML = `<strong>还没有 Key？</strong><ol><li><a href="${choice.keyUrl}" target="_blank" rel="noreferrer">打开 ${choice.keySite}</a></li><li>登录服务商并创建一个新的 API Key</li><li>复制 Key，粘贴到下方</li></ol><p>API Key 通常只显示一次，请创建后立即复制。</p>`;
}

async function save() {
  const apiKey = $("apiKey").value.trim();
  if (!apiKey) return setStatus("请先粘贴 API Key", true);
  if (!/^[\x21-\x7E]+$/.test(apiKey)) return setStatus("API Key 包含中文、空格或全角符号，请重新复制原始 Key", true);
  const choice = selectedModel();
  const topics = [...document.querySelectorAll('#topics input:checked')].map((input) => input.value);
  currentSettings = normalizeSettings({
    ...currentSettings,
    provider: choice.provider,
    model: choice.model,
    apiKey,
    topics,
    topicMode: "favorites",
    autoTranslateTitles: true,
    showOriginal: true,
    setupCompleted: true
  });
  await chrome.storage.local.set({ settings: currentSettings });
  setStatus("设置完成！现在打开 Hacker News 即可自动翻译。", false);
}

function setStatus(message, error) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
