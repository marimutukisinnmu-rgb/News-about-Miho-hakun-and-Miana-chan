(() => {
  const output = document.getElementById("output");
  if (!output) return;

  const LOG_NAME_RE = /^#\d+ \d{4}-\d{2}-\d{2}-\d{2}:\d{2}\.txt$/;
  const repo = "marimutukisinnmu-rgb/News-about-Miho-hakun-and-Miana-chan";
  const base = "https://raw.githubusercontent.com/" + repo + "/main/ai/logs/";
  const params = new URLSearchParams(window.location.search);
  const log = params.get("log");

  function renderNewsMarkdown(text) {
    const source = String(text);
    if (window.marked && typeof window.marked.parse === "function" && window.DOMPurify) {
      try {
        const html = window.marked.parse(source, { gfm: true, breaks: false });
        output.innerHTML = window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
        return;
      } catch (_) {
        // Fall back to safe plain text if rendering fails.
      }
    }
    output.textContent = source;
  }

  function cleanNewsText(text) {
    return String(text)
      .replace(/\uE200[\s\S]*?\uE201/gu, "")
      .replace(/\uE200/gu, "");
  }

  if (!log || !LOG_NAME_RE.test(log)) {
    output.textContent = "ログ指定が不正です。";
    return;
  }

  fetch(base + encodeURIComponent(log), { cache: "default" })
    .then((response) => {
      if (!response.ok) throw new Error("Log request failed");
      return response.text();
    })
    .then((text) => {
      renderNewsMarkdown(cleanNewsText(text));
    })
    .catch(() => {
      output.textContent = "ニュースの取得に失敗しました。時間をおいて再度お試しください。";
    });
})();
