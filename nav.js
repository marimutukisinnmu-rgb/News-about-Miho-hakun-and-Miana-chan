(() => {
  "use strict";
  const nav = document.querySelector("[data-mhn-nav]");
  if (!nav || !window.supabase || !window.supabase.createClient) return;

  const client = window.supabase.createClient(
    "https://ewiurxmmomtcjfvjfpus.supabase.co",
    "sb_publishable_nvWYS-dOfApdIClbRV0A1Q_9UgaPM90",
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );

  function link(href, label) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    return a;
  }

  async function render(session) {
    nav.replaceChildren();
    nav.append(link("index.html", "最新ニュース"));
    nav.append(document.createTextNode(" "));
    nav.append(link("history.html", "履歴を見る"));

    if (!session || !session.user) {
      nav.append(document.createTextNode(" "));
      nav.append(link("auth.html", "アカウント登録・ログイン"));
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

    const name = profile && profile.display_name
      ? profile.display_name
      : (session.user.user_metadata && session.user.user_metadata.display_name) || "アカウント";
    nav.append(document.createTextNode(" "));
    nav.append(link("auth.html", name));
    if (profile && profile.role === "admin") {
      nav.append(document.createTextNode(" "));
      nav.append(link("admin.html", "管理画面"));
    }
  }

  client.auth.getSession().then(({ data }) => render(data && data.session));
  client.auth.onAuthStateChange((_event, session) => {
    // Defer profile queries until after the auth callback to avoid locking the auth client.
    setTimeout(() => { void render(session); }, 0);
  });
})();