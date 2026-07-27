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
  const EN = { translateThisPage:"Translate this page",translationOriginal:"Translation/original",settings:"Settings",settingsReadFailed:"Could not read settings",titlesTranslated:"Titles are already translated",translatingCount:"Translating {count}…",translatedCount:"Translated {count}",originalTitle:"Original: {title}",noTopicOnPage:"No stories on this page match your topics.",translateInto:"Translate to {language}",translating:"Translating…",retryTranslation:"Retry translation",translationFailed:"Translation failed" };
  const COPY = {
    "zh-CN": { translateThisPage:"翻译本页",translationOriginal:"译文/原文",settings:"设置",settingsReadFailed:"读取设置失败",titlesTranslated:"本页标题已翻译",translatingCount:"正在翻译 {count} 条…",translatedCount:"已翻译 {count} 条",originalTitle:"原文：{title}",noTopicOnPage:"本页没有匹配兴趣的话题",translateInto:"译成{language}",translating:"翻译中…",retryTranslation:"重试翻译",translationFailed:"翻译失败" },
    "zh-TW": { translateThisPage:"翻譯本頁",translationOriginal:"譯文/原文",settings:"設定",settingsReadFailed:"無法讀取設定",titlesTranslated:"本頁標題已翻譯",translatingCount:"正在翻譯 {count} 則…",translatedCount:"已翻譯 {count} 則",originalTitle:"原文：{title}",noTopicOnPage:"本頁沒有符合興趣的主題",translateInto:"翻譯成{language}",translating:"翻譯中…",retryTranslation:"重試翻譯",translationFailed:"翻譯失敗" },
    ja: { translateThisPage:"このページを翻訳",translationOriginal:"翻訳/原文",settings:"設定",settingsReadFailed:"設定を読み込めません",titlesTranslated:"タイトルは翻訳済みです",translatingCount:"{count} 件を翻訳中…",translatedCount:"{count} 件を翻訳しました",originalTitle:"原文: {title}",noTopicOnPage:"このページに一致するトピックはありません。",translateInto:"{language}に翻訳",translating:"翻訳中…",retryTranslation:"再翻訳",translationFailed:"翻訳に失敗しました" },
    ko: { translateThisPage:"이 페이지 번역",translationOriginal:"번역/원문",settings:"설정",settingsReadFailed:"설정을 읽을 수 없습니다",titlesTranslated:"제목이 이미 번역되었습니다",translatingCount:"{count}개 번역 중…",translatedCount:"{count}개 번역됨",originalTitle:"원문: {title}",noTopicOnPage:"이 페이지에 관심 주제와 일치하는 글이 없습니다.",translateInto:"{language}(으)로 번역",translating:"번역 중…",retryTranslation:"다시 번역",translationFailed:"번역 실패" },
    es: { translateThisPage:"Traducir esta página",translationOriginal:"Traducción/original",settings:"Ajustes",settingsReadFailed:"No se pudieron leer los ajustes",titlesTranslated:"Los títulos ya están traducidos",translatingCount:"Traduciendo {count}…",translatedCount:"Se tradujeron {count}",originalTitle:"Original: {title}",noTopicOnPage:"No hay noticias que coincidan con tus temas.",translateInto:"Traducir a {language}",translating:"Traduciendo…",retryTranslation:"Reintentar",translationFailed:"Error de traducción" },
    fr: { translateThisPage:"Traduire cette page",translationOriginal:"Traduction/original",settings:"Paramètres",settingsReadFailed:"Impossible de lire les paramètres",titlesTranslated:"Les titres sont déjà traduits",translatingCount:"Traduction de {count}…",translatedCount:"{count} éléments traduits",originalTitle:"Original : {title}",noTopicOnPage:"Aucun article ne correspond à vos sujets.",translateInto:"Traduire en {language}",translating:"Traduction…",retryTranslation:"Réessayer",translationFailed:"Échec de la traduction" },
    de: { translateThisPage:"Diese Seite übersetzen",translationOriginal:"Übersetzung/Original",settings:"Einstellungen",settingsReadFailed:"Einstellungen konnten nicht gelesen werden",titlesTranslated:"Titel sind bereits übersetzt",translatingCount:"{count} werden übersetzt…",translatedCount:"{count} übersetzt",originalTitle:"Original: {title}",noTopicOnPage:"Keine passenden Themen auf dieser Seite.",translateInto:"In {language} übersetzen",translating:"Wird übersetzt…",retryTranslation:"Erneut versuchen",translationFailed:"Übersetzung fehlgeschlagen" },
    "pt-BR": { translateThisPage:"Traduzir esta página",translationOriginal:"Tradução/original",settings:"Configurações",settingsReadFailed:"Não foi possível ler as configurações",titlesTranslated:"Os títulos já foram traduzidos",translatingCount:"Traduzindo {count}…",translatedCount:"{count} traduzidos",originalTitle:"Original: {title}",noTopicOnPage:"Nenhuma notícia corresponde aos seus tópicos.",translateInto:"Traduzir para {language}",translating:"Traduzindo…",retryTranslation:"Tentar novamente",translationFailed:"Falha na tradução" },
    ru: { translateThisPage:"Перевести эту страницу",translationOriginal:"Перевод/оригинал",settings:"Настройки",settingsReadFailed:"Не удалось прочитать настройки",titlesTranslated:"Заголовки уже переведены",translatingCount:"Перевод: {count}…",translatedCount:"Переведено: {count}",originalTitle:"Оригинал: {title}",noTopicOnPage:"На странице нет материалов по вашим темам.",translateInto:"Перевести на {language}",translating:"Перевод…",retryTranslation:"Повторить",translationFailed:"Ошибка перевода" },
    ar: { translateThisPage:"ترجمة هذه الصفحة",translationOriginal:"الترجمة/الأصل",settings:"الإعدادات",settingsReadFailed:"تعذر قراءة الإعدادات",titlesTranslated:"تمت ترجمة العناوين",translatingCount:"جارٍ ترجمة {count}…",translatedCount:"تمت ترجمة {count}",originalTitle:"الأصل: {title}",noTopicOnPage:"لا توجد أخبار تطابق موضوعاتك.",translateInto:"الترجمة إلى {language}",translating:"جارٍ الترجمة…",retryTranslation:"إعادة الترجمة",translationFailed:"فشلت الترجمة" }
  };

  let settings;
  let messages = EN;
  let showTranslation = true;
  const titleRecords = [];

  init().catch((error) => showNotice(error.message, true));

  async function init() {
    settings = await getSettings();
    messages = settings.targetLanguage === "custom" ? EN : { ...EN, ...(COPY[settings.targetLanguage] || {}) };
    addToolbar();
    collectTitles();
    applyTopics();
    addCommentButtons();
    if (settings.autoTranslateTitles && titleRecords.length) await translateTitles();
  }

  function getSettings() {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "GET_PUBLIC_SETTINGS" }, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (response?.ok) resolve(response.settings || {});
      else reject(new Error(response?.error || text("settingsReadFailed")));
    }));
  }

  function addToolbar() {
    const host = document.querySelector(".pagetop") || document.querySelector("body");
    const bar = document.createElement("span");
    bar.className = "hncn-toolbar";
    bar.innerHTML = `<span class="hncn-separator"> | </span><button data-action="translate">${escapeHtml(text("translateThisPage"))}</button><button data-action="toggle">${escapeHtml(text("translationOriginal"))}</button><button data-action="settings">${escapeHtml(text("settings"))}</button><span class="hncn-status" aria-live="polite"></span>`;
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
    if (!untranslated.length) return showNotice(text("titlesTranslated"));
    setBusy(true, text("translatingCount", { count: untranslated.length }));
    try {
      const translations = await requestTranslation(untranslated.map((record) => record.text));
      untranslated.forEach((record, index) => renderTitle(record, translations[index]));
      showNotice(text("translatedCount", { count: translations.length }));
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      setBusy(false);
    }
  }

  function renderTitle(record, translation) {
    record.translation = translation;
    record.link.dataset.hncnOriginal = record.text;
    if (translation === record.text) return;
    if (settings.showOriginal !== false) {
      const chinese = document.createElement("span");
      chinese.className = "hncn-translation";
      chinese.textContent = translation;
      record.link.after(chinese);
    } else {
      record.link.textContent = translation;
      record.link.title = text("originalTitle", { title: record.text });
    }
  }

  function toggleLanguage() {
    showTranslation = !showTranslation;
    titleRecords.filter((record) => record.translation).forEach((record) => {
      const translatedNode = record.link.parentElement.querySelector(":scope > .hncn-translation");
      if (translatedNode) translatedNode.hidden = !showTranslation;
      else record.link.textContent = showTranslation ? record.translation : record.text;
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
    if (matches === 0) showNotice(text("noTopicOnPage"));
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
      button.textContent = text("translateInto", { language: settings.targetLanguageLabel || "" });
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = text("translating");
        try {
          const [translated] = await requestTranslation([comment.innerText.trim()]);
          const node = document.createElement("div");
          node.className = "hncn-comment-translation";
          node.textContent = translated;
          comment.after(node);
          button.remove();
        } catch (error) {
          button.disabled = false;
          button.textContent = text("retryTranslation");
          showNotice(error.message, true);
        }
      });
      comment.after(button);
    });
  }

  function requestTranslation(texts) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "TRANSLATE", texts }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      response?.ok ? resolve(response.translations) : reject(new Error(response?.error || text("translationFailed")));
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

  function text(key, variables = {}) {
    return String(messages[key] || EN[key] || key).replace(/\{(\w+)\}/g, (_match, name) => String(variables[name] ?? ""));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]);
  }
})();
