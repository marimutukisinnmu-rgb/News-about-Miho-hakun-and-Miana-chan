(() => {
  "use strict";
  const status = document.getElementById("status");
  const form = document.getElementById("authForm");
  const submitButton = document.getElementById("submitButton");
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const displayName = document.getElementById("displayName");
  const password = document.getElementById("password");
  const authPanel = document.getElementById("authPanel");
  const accountPanel = document.getElementById("accountPanel");
  const accountEmail = document.getElementById("accountEmail");
  const accountName = document.getElementById("accountName");
  const googleButton = document.getElementById("googleButton");
  const logoutButton = document.getElementById("logoutButton");

  const SUPABASE_URL = "https://ewiurxmmomtcjfvjfpus.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nvWYS-dOfApdIClbRV0A1Q_9UgaPM90";
  let mode = "login";
  let supabase;

  function say(message) { status.textContent = message; }
  function setBusy(busy) {
    submitButton.disabled = busy;
    googleButton.disabled = busy;
    loginTab.disabled = busy;
    signupTab.disabled = busy;
  }
  function setMode(nextMode) {
    mode = nextMode;
    const signup = mode === "signup";
    loginTab.setAttribute("aria-pressed", String(!signup));
    signupTab.setAttribute("aria-pressed", String(signup));
    submitButton.textContent = signup ? "確認メールを送って新規登録" : "ログイン";
    displayName.required = false;
    displayName.closest(".field").hidden = !signup;
    password.autocomplete = signup ? "new-password" : "current-password";
    say("");
  }
  function showAccount(user) {
    authPanel.hidden = Boolean(user);
    accountPanel.hidden = !user;
    if (!user) return;
    accountEmail.textContent = user.email || "メールアドレスは公開されていません";
    const name = user.user_metadata && (user.user_metadata.display_name || user.user_metadata.full_name);
    accountName.textContent = name ? "表示名: " + name : "表示名は未設定です";
  }
  function explainError(error) {
    const message = String(error && error.message || "");
    if (/Invalid login credentials/i.test(message)) return "メールアドレスまたはパスワードが違います。";
    if (/Email not confirmed/i.test(message)) return "メールアドレスの確認がまだ完了していません。確認メールのリンクを開いてください。";
    if (/User already registered/i.test(message)) return "このメールアドレスは登録済みの可能性があります。ログインをお試しください。";
    if (/Password should be at least/i.test(message)) return "パスワードは8文字以上にしてください。";
    if (/provider is not enabled|Unsupported provider/i.test(message)) return "GoogleログインがSupabase側でまだ有効になっていません。管理者がGoogle OAuth設定を完了する必要があります。";
    if (/redirect|callback/i.test(message)) return "認証後の戻り先URLがSupabaseの許可リストに登録されているか確認してください。";
    return "処理に失敗しました。入力内容とネットワークを確認して、もう一度お試しください。";
  }

  function init() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      say("認証ライブラリを読み込めませんでした。ネットワークを確認して再読み込みしてください。");
      setBusy(true);
      return;
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitButton.disabled) return;
      const email = document.getElementById("email").value.trim();
      const pass = password.value;
      setBusy(true);
      say(mode === "signup" ? "アカウントを作成しています…" : "ログインしています…");
      try {
        let result;
        if (mode === "signup") {
          const name = displayName.value.trim();
          result = await supabase.auth.signUp({
            email,
            password: pass,
            options: {
              emailRedirectTo: window.location.href.split(/[?#]/)[0],
              data: name ? { display_name: name } : {}
            }
          });
          if (result.error) throw result.error;
          if (result.data.session) {
            say("登録できました。ログイン状態を確認しています…");
          } else {
            say("確認メールを送信しました。メール内のリンクを開いて登録を完了してください。");
          }
        } else {
          result = await supabase.auth.signInWithPassword({ email, password: pass });
          if (result.error) throw result.error;
          say("ログインしました。");
          showAccount(result.data.user);
        }
      } catch (error) {
        say(explainError(error));
      } finally {
        setBusy(false);
      }
    });

    googleButton.addEventListener("click", async () => {
      setBusy(true);
      say("Googleログインへ移動します…");
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: window.location.href.split(/[?#]/)[0] }
        });
        if (error) throw error;
      } catch (error) {
        say(explainError(error));
        setBusy(false);
      }
    });

    logoutButton.addEventListener("click", async () => {
      logoutButton.disabled = true;
      try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        say("ログアウトしました。");
        showAccount(null);
      } catch (_) {
        say("ログアウトに失敗しました。ネットワークを確認してください。");
      } finally {
        logoutButton.disabled = false;
      }
    });

    loginTab.addEventListener("click", () => setMode("login"));
    signupTab.addEventListener("click", () => setMode("signup"));
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) showAccount(session.user);
      else showAccount(null);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) say("ログイン状態を確認できませんでした。再読み込みしてください。");
      showAccount(data && data.session ? data.session.user : null);
    });
    setMode("login");
  }
  init();
})();
