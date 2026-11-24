(() => {
  const supabaseUrl = "https://ewiurxmmomtcjfvjfpus.supabase.co";
  const publishableKey = "sb_publishable_nvWYS-dOfApdIClbRV0A1Q_9UgaPM90";

  // Initialize the shared authenticated client before page-feedback.js runs.
  // The publishable key is public; no service-role credential is exposed here.
  if (!window.__mhnSupabaseClient &&
      window.supabase &&
      typeof window.supabase.createClient === "function") {
    window.__mhnSupabaseClient = window.supabase.createClient(
      supabaseUrl,
      publishableKey,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );
  }

  const form = document.getElementById("commentForm");
  if (!form) return;

  const status = document.getElementById("commentStatus");
  const button = document.getElementById("commentSubmit");
  const endpoint = "https://ewiurxmmomtcjfvjfpus.supabase.co/functions/v1/mhn-comment-submit";

  function showError(code, httpStatus) {
    if (httpStatus === 429 || code === "rate_limited") {
      return "短時間の連続送信はできません。しばらく待ってからお試しください。";
    }
    if (code === "please_wait") {
      return "送信前に、入力内容をもう一度確認してください。";
    }
    if (code === "email_invalid") {
      return "メールアドレスの形式を確認してください。メールアドレスを空欄にして送信することもできます。";
    }
    if (code === "message_invalid" || code === "nickname_invalid") {
      return "入力内容を確認してください（コメントは1〜2,000文字、ニックネームは40文字まで）。";
    }
    if (httpStatus === 403 || httpStatus === 503 || httpStatus >= 500) {
      return "コメント受付が一時的に利用できません。時間をおいて再度お試しください。";
    }
    return "送信できませんでした。入力内容を確認して再度お試しください。";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return;

    const values = new FormData(form);
    const message = String(values.get("message") || "");
    const isHtmlRequest = message.startsWith("[HTML制作依頼]");
    const payload = {
      nickname: String(values.get("nickname") || ""),
      email: String(values.get("email") || "").trim(),
      message,
      website: String(values.get("website") || ""),
      pagePath: window.location.pathname
    };

    button.disabled = true;
    status.textContent = "送信しています…";

    try {
      const headers = {
        "Content-Type": "application/json",
        "apikey": publishableKey
      };

      if (isHtmlRequest) {
        const client = window.__mhnSupabaseClient;
        if (!client || !client.auth || typeof client.auth.getSession !== "function") {
          status.textContent = "認証機能を読み込めませんでした。再読み込みしてください。";
          return;
        }
        const { data, error } = await client.auth.getSession();
        const session = data && data.session;
        if (error || !session || !session.user || !session.access_token) {
          status.textContent = "HTML制作依頼にはログインが必要です。MHNアカウントにログインしてから送信してください。";
          return;
        }
        headers.Authorization = "Bearer " + session.access_token;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        credentials: "omit",
        cache: "no-store"
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        status.textContent = showError(result.error, response.status);
        return;
      }

      form.reset();
      if (isHtmlRequest) {
        status.textContent = "HTML制作依頼を受け付けました。運営が内容を確認します。修正案機能はこのページで利用できます。";
        window.dispatchEvent(new Event("mhn:html-request-submitted"));
      } else {
        status.textContent = "送信を受け付けました。コメントは公開されず、運営だけが確認します。";
      }
    } catch (error) {
      console.error("[MHN comments] submission failed");
      status.textContent = "通信に失敗しました。ネットワークを確認して再度お試しください。";
    } finally {
      button.disabled = false;
    }
  });
})();
