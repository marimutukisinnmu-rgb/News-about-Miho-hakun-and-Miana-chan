(() => {
  "use strict";
  const nav = document.querySelector("[data-mhn-nav]");
  if (!nav || !window.supabase || !window.supabase.createClient) return;

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
      if (version === renderVersion) nav.replaceChildren(...items);
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

    // A newer session event may have started another render while this query ran.
    if (version !== renderVersion) return;

    const name = profile && profile.display_name
      ? profile.display_name
      : (session.user.user_metadata && session.user.user_metadata.display_name) || "アカウント";
    addLink("auth.html", name);
    if (profile && profile.role === "admin") addLink("admin.html", "管理画面");

    // Replace once, after all async work; never append links from stale renders.
    nav.replaceChildren(...items);
  }

  client.auth.getSession().then(({ data }) => {
    void render(data && data.session);
  });
  client.auth.onAuthStateChange((_event, session) => {
    // Defer work until after Supabase finishes its auth-state callback.
    setTimeout(() => { void render(session); }, 0);
  });
})();