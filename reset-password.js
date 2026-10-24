(() => {
  "use strict";

  const SUPABASE_URL = "https://ewiurxmmomtcjfvjfpus.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nvWYS-dOfApdIClbRV0A1Q_9UgaPM90";

  const requestPanel = document.getElementById("requestPanel");
  const changePanel = document.getElementById("changePanel");
  const donePanel = document.getElementById("donePanel");
  const requestForm = document.getElementById("resetRequestForm");
  const requestButton = document.getElementById("requestButton");
  const requestStatus = document.getElementById("requestStatus");
  const changeForm = document.getElementById("changePasswordForm");
  const updateButton = document.getElementById("updateButton");
  const changeStatus = document.getElementById("changeStatus");
  const newPassword = document.getElementById("newPassword");
  const confirmPassword = document.getElementById("confirmPassword");

  function showChangePanel() {
    requestPanel.hidden = true;
    changePanel.hidden = false;
    donePanel.hidden = true;
    changeStatus.textContent = "";
  }

  function showDonePanel() {
    requestPanel.hidden = true;
    changePanel.hidden = true;
    donePanel.hidden = false;
  }

  function init() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      requestStatus.textContent = "認証ライブラリを読み込めませんでした。ネットワークを確認して再読み込みしてください。";
      requestButton.disabled = true;
      return;
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const recoveryFromHash = hashParams.get("type") === "recovery";

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "INITIAL_SESSION" && recoveryFromHash && session)) {
        showChangePanel();
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (recoveryFromHash && data && data.session) showChangePanel();
    });

    requestForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      requestButton.disabled = true;
      requestStatus.textContent = "再設定メールを送信しています…";
      const email = document.getElementById("resetEmail").value.trim();
      const redirectTo = window.location.origin + window.location.pathname;

      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        requestStatus.textContent = "アカウントが存在する場合、再設定メールを送信しました。受信トレイと迷惑メールフォルダーを確認してください。";
      } catch (_) {
        requestStatus.textContent = "メールを送信できませんでした。時間をおいて再度お試しください。";
      } finally {
        requestButton.disabled = false;
      }
    });

    changeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      changeStatus.textContent = "";
      if (newPassword.value.length < 8) {
        changeStatus.textContent = "パスワードは8文字以上にしてください。";
        return;
      }
      if (newPassword.value !== confirmPassword.value) {
        changeStatus.textContent = "2つのパスワードが一致していません。";
        confirmPassword.focus();
        return;
      }

      updateButton.disabled = true;
      try {
        const { error } = await supabase.auth.updateUser({ password: newPassword.value });
        if (error) throw error;
        newPassword.value = "";
        confirmPassword.value = "";
        showDonePanel();
      } catch (_) {
        changeStatus.textContent = "パスワードを更新できませんでした。再設定メールのリンクが期限切れの場合は、もう一度メールを送信してください。";
      } finally {
        updateButton.disabled = false;
      }
    });
  }

  init();
})();
