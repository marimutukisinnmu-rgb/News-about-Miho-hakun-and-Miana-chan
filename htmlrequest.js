(() => {
  "use strict";
  const form = document.getElementById("htmlRequestForm");
  if (!form) return;
  const status = document.getElementById("requestStatus");
  const button = document.getElementById("requestSubmit");
  const endpoint = "https://ewiurxmmomtcjfvjfpus.supabase.co/functions/v1/mhn-comment-submit";
  const publishableKey = "sb_publishable_nvWYS-dOfApdIClbRV0A1Q_9UgaPM90";
  const loginRequired = document.getElementById("loginRequired");
  const loginAccount = document.getElementById("loginAccount");
  let supabaseClient = null;

  function setAuthState(session) {
    const loggedIn = Boolean(session && session.user);
    form.hidden = !loggedIn;
    if (loginRequired) loginRequired.hidden = loggedIn;
    if (loginAccount) {
      loginAccount.hidden = !loggedIn;
      loginAccount.textContent = loggedIn
        ? "ログイン中: " + (session.user.email || "MHNアカウント")
        : "";
    }
  }

  function initAuth() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      if (status) status.textContent = "認証機能を読み込めませんでした。再読み込みしてください。";
      return;
    }
    supabaseClient = window.supabase.createClient(
      "https://ewiurxmmomtcjfvjfpus.supabase.co",
      publishableKey,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );
    supabaseClient.auth.onAuthStateChange((_event, session) => setAuthState(session));
    supabaseClient.auth.getSession().then(({ data, error }) => {
      if (error) {
        setAuthState(null);
        if (status) status.textContent = "ログイン状態を確認できませんでした。再読み込みしてください。";
        return;
      }
      setAuthState(data.session);
    });
  }

  initAuth();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    if (!supabaseClient) {
      status.textContent = "認証機能を利用できません。再読み込みしてください。";
      return;
    }
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    const session = sessionData && sessionData.session;
    if (sessionError || !session || !session.user || !session.access_token) {
      setAuthState(null);
      status.textContent = "依頼を送信するにはMHNアカウントへのログインが必要です。";
      return;
    }
    const data = new FormData(form);
    const website = String(data.get("website") || "");
    const title = String(data.get("title") || "").trim();
    const description = String(data.get("description") || "").trim();
    const features = String(data.get("features") || "").trim();
    const other = String(data.get("other") || "").trim();
    const nickname = String(data.get("nickname") || "").trim();

    if (!title || !description) {
      status.textContent = "制作したいものと制作内容を入力してください。";
      return;
    }
    const message = [
      "[HTML制作依頼]",
      "制作したいもの: " + title,
      "制作内容:",
      description,
      "希望する機能:",
      features || "指定なし",
      "その他の要望:",
      other || "指定なし"
    ].join("\n");

    if (Array.from(message).length > 2000) {
      status.textContent = "入力内容が長すぎます。内容を短くしてください。";
      return;
    }

    button.disabled = true;
    status.textContent = "依頼を送信しています…";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": publishableKey,
          "Authorization": "Bearer " + session.access_token
        },
        body: JSON.stringify({
          nickname,
          email: "",
          message,
          website,
          pagePath: window.location.pathname
        }),
        credentials: "omit",
        cache: "no-store"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        if (response.status === 429) {
          status.textContent = "短時間の連続送信はできません。しばらく待ってください。";
        } else if (response.status === 403 || response.status >= 500) {
          status.textContent = "依頼受付を利用できません。時間をおいて再度お試しください。";
        } else {
          status.textContent = "送信できませんでした。入力内容を確認してください。";
        }
        return;
      }
      form.reset();
      status.textContent = "依頼を受け付けました。運営が内容を確認します。公開が決まるまでは、依頼内容や成果物は公開されません。";
      window.dispatchEvent(new Event("mhn:html-request-submitted"));
    } catch (_) {
      status.textContent = "通信に失敗しました。ネットワークを確認して再度お試しください。";
    } finally {
      button.disabled = false;
    }
  });
})();
