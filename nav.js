(() => {
  "use strict";

  const navs = [...document.querySelectorAll("[data-mhn-nav]")];
  if (!navs.length || !window.supabase || !window.supabase.createClient) return;

  // Remove duplicate links even if an older cached script appends them later.
  function dedupeNav(nav) {
    const seen = new Set();
    for (const child of [...nav.children]) {
      if (child.tagName !== "A") continue;
      const href = child.getAttribute("href");
      if (seen.has(href)) child.remove();
      else seen.add(href);
    }
    // Clean up repeated whitespace nodes left between removed links.
    for (const node of [...nav.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
        const prev = node.previousSibling;
        const next = node.nextSibling;
        if (!prev || !next || (prev.nodeType === Node.TEXT_NODE && !prev.textContent.trim())) node.remove();
      }
    }
  }

  for (const nav of navs) {
    dedupeNav(nav);
    new MutationObserver(() => dedupeNav(nav)).observe(nav, { childList: true });
  }

  const client = window.supabase.createClient(
    "https://ewiurxmmomtcjfvjfpus.supabase.co",
    "sb_publishable_nvWYS-dOfApdIClbRV0A1Q_9UgaPM90",
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );
  let renderVersion = 0;

  function link(href, label) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    return a;
  }

  async function render(session) {
    const version = ++renderVersion;
    const items = [];
    const addLink = (href, label) => {
      if (items.length) items.push(document.createTextNode(" "));
      items.push(link(href, label));
    };

    addLink("index.html", "最新ニュース");
    addLink("history.html", "履歴を見る");

    if (!session || !session.user) {
      addLink("auth.html", "アカウント登録・ログイン");
      if (version === renderVersion) {
        for (const nav of navs) nav.replaceChildren(...items.map(node => node.cloneNode(true)));
      }
      return;
    }

    let profile = null;
    try {
      const { data, error } = await client
        .from("profiles")
        .select("display_name, role")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!error) profile = data;
    } catch (_) {}

    if (version !== renderVersion) return;

    const name = profile && profile.display_name
      ? profile.display_name
      : (session.user.user_metadata && session.user.user_metadata.display_name) || "アカウント";
    addLink("auth.html", name);
    if (profile && profile.role === "admin") addLink("admin.html", "管理画面");

    for (const nav of navs) nav.replaceChildren(...items.map(node => node.cloneNode(true)));
  }

  client.auth.getSession().then(({ data }) => {
    void render(data && data.session);
  });
  client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => { void render(session); }, 0);
  });
})();