const REPO = "marimutukisinnmu-rgb/News-about-Miho-hakun-and-Miana-chan";
const TREE_API = "https://api.github.com/repos/" + REPO + "/git/trees/main?recursive=1";
const LOG_INDEX_URL = "https://raw.githubusercontent.com/" + REPO + "/main/ai/log-index.json";
const SEARCH_INDEX_URL = "https://raw.githubusercontent.com/" + REPO + "/main/ai/log-search-index.json";
const RAW_BASE = "https://raw.githubusercontent.com/" + REPO + "/main/ai/logs/";
const LOG_NAME_RE = /^#(\d+) (\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})\.txt$/;
const LOG_LIST_CACHE_KEY = "mhn.log-list.v3";
const LOG_LIST_CACHE_MS = 2 * 60 * 1000;

let logListPromise = null;
let searchCorpusPromise = null;
let searchTimer = null;
let searchGeneration = 0;
const logTextPromises = new Map();

function isValidLogName(name) {
  return typeof name === "string" && LOG_NAME_RE.test(name);
}

function newsNumber(name) {
  const match = name.match(/^#(\d+)/);
  return match ? Number(match[1]) : -1;
}

function newsDate(name) {
  const match = name.match(LOG_NAME_RE);
  return match ? match.slice(2).join("") : "";
}

function cleanNewsText(text) {
  // Remove only complete private marker blocks. An unmatched marker must not
  // discard the remainder of a news log.
  return String(text)
    .replace(/\uE200[\s\S]*?\uE201/gu, "")
    .replace(/\uE200/gu, "");
}

function renderNewsMarkdown(output, text) {
  if (window.MHNInfoBlock && typeof window.MHNInfoBlock.render === "function") {
    try {
      window.MHNInfoBlock.render(output, text);
      return;
    } catch (_) {
      // Fall back to the legacy Markdown renderer if the custom block fails.
    }
  }
  const source = String(text);
  if (window.marked && typeof window.marked.parse === "function" && window.DOMPurify) {
    try {
      const html = window.marked.parse(source, { gfm: true, breaks: false });
      output.innerHTML = window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
      return;
    } catch (_) {
      // If Markdown rendering fails, preserve the original text safely.
    }
  }
  output.textContent = source;
}

function displayName(name) {
  const match = name.match(LOG_NAME_RE);
  return match
    ? Number(match[1]) + "回目(" + match[2] + "/" + match[3] + "/" +
      match[4] + " " + match[5] + ":" + match[6] + ")"
    : name;
}

function sortLogs(files) {
  return files
    .filter((file) => file && file.type === "file" && isValidLogName(file.name))
    .sort((a, b) => {
      const dateOrder = newsDate(b.name).localeCompare(newsDate(a.name));
      return dateOrder || newsNumber(b.name) - newsNumber(a.name);
    });
}

function cacheLogs(logs) {
  try {
    sessionStorage.setItem(LOG_LIST_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      logs: logs
    }));
  } catch (_) {
    // Storage may be unavailable in private browsing. In-memory caching still works.
  }
}

function readCachedLogs() {
  try {
    const item = JSON.parse(sessionStorage.getItem(LOG_LIST_CACHE_KEY) || "null");
    if (
      item &&
      Array.isArray(item.logs) &&
      Number.isFinite(item.savedAt) &&
      Date.now() - item.savedAt < LOG_LIST_CACHE_MS
    ) {
      return item.logs;
    }
  } catch (_) {
    // Ignore stale or unavailable browser storage.
  }
  return null;
}

async function loadLogsFromStaticIndex() {
  const response = await fetch(LOG_INDEX_URL, { cache: "no-cache" });
  if (!response.ok) return null;
  const index = await response.json();
  if (!index || !Array.isArray(index.logs)) return null;
  const files = index.logs
    .filter((item) => item && isValidLogName(item.name))
    .map((item) => ({
      name: item.name,
      type: "file",
      size: Number(item.size) || 0
    }));
  return files.length ? sortLogs(files) : [];
}

async function loadLogsFromTreeApi() {
  const response = await fetch(TREE_API, { cache: "default" });
  if (!response.ok) throw new Error("ログ一覧の取得に失敗しました");
  const result = await response.json();
  if (!Array.isArray(result.tree) || result.truncated === true) {
    throw new Error("ログ一覧が完全に取得できませんでした");
  }
  const files = result.tree
    .filter((item) =>
      item.type === "blob" &&
      typeof item.path === "string" &&
      item.path.startsWith("ai/logs/") &&
      isValidLogName(item.path.slice("ai/logs/".length))
    )
    .map((item) => ({
      name: item.path.slice("ai/logs/".length),
      type: "file",
      size: Number(item.size) || 0
    }));
  return sortLogs(files);
}

async function loadLogsFromContentsApi() {
  const contentsBase = "https://api.github.com/repos/" + REPO + "/contents/ai/logs";
  const files = [];
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(
      contentsBase + "?ref=main&per_page=100&page=" + page,
      { cache: "default" }
    );
    if (!response.ok) throw new Error("ログ一覧の取得に失敗しました");
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error("ログ一覧の形式が不正です");
    files.push(...items);
    if (items.length < 100) return sortLogs(files);
  }
  throw new Error("ログが多いため一覧を取得しきれませんでした");
}

async function getLogs() {
  if (Array.isArray(window.__newsLogs) && Date.now() - (window.__newsLogsLoadedAt || 0) < LOG_LIST_CACHE_MS) {
    return window.__newsLogs;
  }

  const cached = readCachedLogs();
  if (cached) {
    window.__newsLogs = cached;
    window.__newsLogsLoadedAt = Date.now();
    return cached;
  }

  if (!logListPromise) {
    logListPromise = (async () => {
      let logs = null;
      try {
        logs = await loadLogsFromStaticIndex();
      } catch (_) {
        // The static index may not have been generated yet; try the Git tree.
      }

      if (!logs) {
        try {
          logs = await loadLogsFromTreeApi();
        } catch (_) {
          // Fall back to paginated Contents API if the tree API is unavailable.
          logs = await loadLogsFromContentsApi();
        }
      }

      window.__newsLogs = logs;
      window.__newsLogsLoadedAt = Date.now();
      cacheLogs(logs);
      return logs;
    })().finally(() => {
      logListPromise = null;
    });
  }
  return logListPromise;
}

function fetchLogText(file) {
  if (!isValidLogName(file.name)) {
    return Promise.reject(new Error("ログ名が不正です"));
  }
  if (logTextPromises.has(file.name)) return logTextPromises.get(file.name);

  const promise = fetch(RAW_BASE + encodeURIComponent(file.name), { cache: "default" })
    .then((response) => {
      if (!response.ok) throw new Error("ニュースログの取得に失敗しました");
      return response.text();
    })
    .then(cleanNewsText)
    .catch((error) => {
      logTextPromises.delete(file.name);
      throw error;
    });
  logTextPromises.set(file.name, promise);
  return promise;
}

async function loadSearchCorpus(logs) {
  const byName = new Map();

  try {
    const response = await fetch(SEARCH_INDEX_URL, { cache: "no-cache" });
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.logs)) {
        for (const item of data.logs) {
          if (item && isValidLogName(item.name) && typeof item.text === "string") {
            byName.set(item.name, cleanNewsText(item.text));
          }
        }
      }
    }
  } catch (_) {
    // A missing index is expected until the workflow has generated it.
  }

  const missing = logs.filter((file) => !byName.has(file.name));
  let next = 0;
  let failed = 0;
  const workerCount = Math.min(6, missing.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < missing.length) {
      const index = next;
      next += 1;
      const file = missing[index];
      try {
        byName.set(file.name, await fetchLogText(file));
      } catch (_) {
        failed += 1;
      }
    }
  });
  await Promise.all(workers);

  return {
    entries: logs
      .filter((file) => byName.has(file.name))
      .map((file) => ({ file: file, text: byName.get(file.name) })),
    failed: failed
  };
}

async function loadLatest() {
  const output = document.getElementById("output");
  if (!output) return;
  output.textContent = "読み込み中...";

  try {
    const logs = await getLogs();
    if (!logs.length) {
      output.textContent = "ニュースログはまだありません。";
      return;
    }
    renderNewsMarkdown(output, await fetchLogText(logs[0]));
  } catch (error) {
    console.error("[MHN] latest load failed");
    output.textContent = "ニュースの取得に失敗しました。時間をおいて再度お試しください。";
  }
}

function setSearchStatus(message) {
  const status = document.getElementById("searchStatus");
  if (status) status.textContent = message;
}

function render(logs) {
  const list = document.getElementById("list");
  if (!list) return;
  list.replaceChildren();

  if (!logs.length) {
    const item = document.createElement("li");
    item.textContent = "該当するニュースがありません。";
    list.appendChild(item);
    return;
  }

  for (const file of logs) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = "historyoutput.html?log=" + encodeURIComponent(file.name);
    link.textContent = displayName(file.name);
    item.appendChild(link);
    list.appendChild(item);
  }
}

async function searchNow() {
  const input = document.getElementById("searchInput");
  if (!input) return;
  const generation = ++searchGeneration;
  const query = input.value.trim().toLocaleLowerCase();
  const logs = window.__newsLogs || [];

  if (!query) {
    render(logs);
    setSearchStatus("");
    return;
  }

  setSearchStatus("検索用データを読み込み中...");
  if (!searchCorpusPromise) {
    searchCorpusPromise = loadSearchCorpus(logs).catch((error) => {
      searchCorpusPromise = null;
      throw error;
    });
  }

  try {
    const corpus = await searchCorpusPromise;
    if (generation !== searchGeneration) return;
    const matched = corpus.entries
      .filter((entry) =>
        (entry.text + " " + displayName(entry.file.name))
          .toLocaleLowerCase()
          .includes(query)
      )
      .map((entry) => entry.file);

    render(matched);
    if (corpus.failed > 0) {
      setSearchStatus("一部のログを取得できなかったため、検索結果が不完全な可能性があります。");
    } else {
      setSearchStatus("検索完了：" + matched.length + "件");
    }
  } catch (_) {
    if (generation !== searchGeneration) return;
    setSearchStatus("検索データを取得できませんでした。時間をおいて再度お試しください。");
  }
}

function scheduleSearch() {
  if (searchTimer !== null) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void searchNow();
  }, 300);
}

function initHistory() {
  const searchButton = document.getElementById("searchBtn");
  const searchBox = document.getElementById("searchBox");
  const searchInput = document.getElementById("searchInput");

  if (searchButton && searchBox && searchInput) {
    searchButton.addEventListener("click", () => {
      const open = searchBox.style.display === "block";
      searchBox.style.display = open ? "none" : "block";
      if (!open) {
        searchInput.focus();
      } else {
        if (searchTimer !== null) clearTimeout(searchTimer);
        searchGeneration += 1;
        searchInput.value = "";
        render(window.__newsLogs || []);
        setSearchStatus("");
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", scheduleSearch);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (searchTimer !== null) clearTimeout(searchTimer);
        searchTimer = null;
        void searchNow();
      }
    });
  }
}

console.log("[MHN] app.js loaded");
if (document.getElementById("output")) {
  void loadLatest();
} else if (document.getElementById("list")) {
  initHistory();
  void getLogs()
    .then((logs) => {
      window.__newsLogs = logs;
      render(logs);
      const input = document.getElementById("searchInput");
      if (input && input.value.trim()) return searchNow();
    })
    .catch(() => {
      const list = document.getElementById("list");
      if (list) {
        list.replaceChildren();
        const item = document.createElement("li");
        item.textContent = "履歴の取得に失敗しました。時間をおいて再度お試しください。";
        list.appendChild(item);
      }
    });
}
