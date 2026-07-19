(() => {
  const TOPICS = {
    ai: ["ai", "llm", "gpt", "model", "machine learning", "neural", "agent", "openai", "anthropic"],
    programming: ["programming", "developer", "code", "compiler", "javascript", "python", "rust", "golang", "database", "api"],
    startup: ["startup", "founder", "funding", "venture", "business", "launch", "acquisition", "revenue"],
    security: ["security", "privacy", "vulnerability", "malware", "breach", "encryption", "attack", "cve"],
    science: ["science", "research", "physics", "biology", "space", "climate", "mathematics", "quantum"],
    hardware: ["hardware", "chip", "cpu", "gpu", "semiconductor", "raspberry pi", "robot", "device"],
    design: ["design", "ui", "ux", "typography", "css", "visual", "interface"],
    culture: ["history", "book", "music", "culture", "society", "education", "language"]
  };

  let settings;
  let showChinese = true;
  const titleRecords = [];

  init().catch((error) => showNotice(error.message, true));

  async function init() {
    settings = await getSettings();
    addToolbar();
    collectTitles();
    applyTopics();
    addCommentButtons();
    if (settings.autoTranslateTitles && titleRecords.length) await translateTitles();
  }

  function getSettings() {
    return new Promise((resolve) => chrome.storage.local.get("settings", ({ settings: saved }) => resolve(saved || {})));
  }

  function addToolbar() {
    const host = document.querySelector(".pagetop") || document.querySelector("body");
    const bar = document.createElement("span");
    bar.className = "hncn-toolbar";
    bar.innerHTML = `<span class="hncn-separator"> | </span><button data-action="translate">翻译本页</button><button data-action="toggle">中/英</button><button data-action="settings">设置</button><span class="hncn-status" aria-live="polite"></span>`;
    bar.addEventListener("click", (event) => {
      const action = event.target.dataset.action;
      if (action === "translate") translateTitles();
      if (action === "toggle") toggleLanguage();
      if (action === "settings") chrome.runtime.openOptionsPage();
    });
    host.append(bar);
  }

  function collectTitles() {
    document.querySelectorAll(".athing .titleline > a:first-child").forEach((link) => {
      const text = link.textContent.trim();
      if (text) titleRecords.push({ link, text, row: link.closest(".athing") });
    });
  }

  async function translateTitles() {
    const untranslated = titleRecords.filter((record) => !record.translation);
    if (!untranslated.length) return showNotice("本页标题已翻译");
    setBusy(true, `正在翻译 ${untranslated.length} 条…`);
    try {
      const translations = await requestTranslation(untranslated.map((record) => record.text));
      untranslated.forEach((record, index) => renderTitle(record, translations[index]));
      showNotice(`已翻译 ${translations.length} 条`);
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  function renderTitle(record, translation) {
    record.translation = translation;
    record.link.dataset.hncnOriginal = record.text;
    if (settings.showOriginal !== false) {
      const chinese = document.createElement("span");
      chinese.className = "hncn-translation";
      chinese.textContent = translation;
      record.link.after(chinese);
    } else {
      record.link.textContent = translation;
      record.link.title = `原文：${record.text}`;
    }
  }

  function toggleLanguage() {
    showChinese = !showChinese;
    titleRecords.filter((record) => record.translation).forEach((record) => {
      const translatedNode = record.link.parentElement.querySelector(":scope > .hncn-translation");
      if (translatedNode) translatedNode.hidden = !showChinese;
      else record.link.textContent = showChinese ? record.translation : record.text;
    });
  }

  function applyTopics() {
    if (!settings.topics?.length) return;
    let matches = 0;
    for (const record of titleRecords) {
      const lower = record.text.toLowerCase();
      const isMatch = settings.topics.some((topic) => TOPICS[topic]?.some((keyword) => lower.includes(keyword)));
      if (isMatch) {
        record.row.classList.add("hncn-topic-match");
        matches++;
      } else if (settings.topicMode === "filter") {
        setStoryVisible(record.row, false);
      }
    }
    if (matches === 0) showNotice("本页没有匹配兴趣的话题");
  }

  function setStoryVisible(row, visible) {
    row.hidden = !visible;
    const subtext = row.nextElementSibling;
    const spacer = subtext?.nextElementSibling;
    if (subtext) subtext.hidden = !visible;
    if (spacer?.classList.contains("spacer")) spacer.hidden = !visible;
  }

  function addCommentButtons() {
    document.querySelectorAll(".commtext").forEach((comment) => {
      if (!comment.textContent.trim()) return;
      const button = document.createElement("button");
      button.className = "hncn-comment-button";
      button.textContent = "译成中文";
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "翻译中…";
        try {
          const [translated] = await requestTranslation([comment.innerText.trim()]);
          const node = document.createElement("div");
          node.className = "hncn-comment-translation";
          node.textContent = translated;
          comment.after(node);
          button.remove();
        } catch (error) {
          button.disabled = false;
          button.textContent = "重试翻译";
          showNotice(error.message, true);
        }
      });
      comment.after(button);
    });
  }

  function requestTranslation(texts) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "TRANSLATE", texts }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      response?.ok ? resolve(response.translations) : reject(new Error(response?.error || "翻译失败"));
    }));
  }

  function setBusy(busy, text) {
    const button = document.querySelector('.hncn-toolbar [data-action="translate"]');
    if (button) button.disabled = busy;
    if (text) showNotice(text);
  }

  function showNotice(message, error = false) {
    const status = document.querySelector(".hncn-status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("hncn-error", error);
  }
})();
