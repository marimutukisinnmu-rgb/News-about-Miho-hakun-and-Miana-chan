(() => {
  "use strict";
  const list = document.getElementById("siteList");
  const status = document.getElementById("galleryStatus");
  if (!list) return;
  const INDEX_URL = "./generated-sites/index.json";
  const ID_RE = /^site-[a-z0-9][a-z0-9-]{0,62}$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function text(tag, value, className) {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  async function load() {
    try {
      const response = await fetch(INDEX_URL + "?_=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error("index_unavailable");
      const data = await response.json();
      if (!data || data.version !== 1 || !Array.isArray(data.sites)) {
        throw new Error("invalid_index");
      }
      const fragment = document.createDocumentFragment();
      let count = 0;
      for (const site of data.sites) {
        if (!site || typeof site.id !== "string" || !ID_RE.test(site.id) ||
            typeof site.title !== "string" || site.title.length < 1 || site.title.length > 100 ||
            typeof site.summary !== "string" || site.summary.length > 300 ||
            typeof site.published_at !== "string" || !DATE_RE.test(site.published_at)) {
          continue;
        }
        const card = document.createElement("article");
        card.className = "card";
        card.append(text("h2", site.title));
        if (site.summary) card.append(text("p", site.summary));
        card.append(text("p", "公開日: " + site.published_at, "muted"));
        const link = document.createElement("a");
        link.href = "./generated-sites/" + site.id + "/index.html";
        link.textContent = "作品を開く";
        link.rel = "noopener";
        card.append(link);
        fragment.append(card);
        count += 1;
      }
      list.replaceChildren(fragment);
      status.textContent = count + "件の作品を表示しています。";
      if (count === 0) list.append(text("p", "現在公開中のHTML作品はありません。", "card"));
    } catch (_) {
      list.replaceChildren(text("p", "作品一覧を安全に読み込めませんでした。確認できない作品は表示しません。", "card"));
      status.textContent = "一覧の取得または検証に失敗しました。";
    } finally {
      list.setAttribute("aria-busy", "false");
    }
  }
  void load();
})();