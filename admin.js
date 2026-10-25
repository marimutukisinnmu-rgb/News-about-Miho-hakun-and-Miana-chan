(() => {
  "use strict";
  const status = document.getElementById("adminStatus");
  const details = document.getElementById("accountDetails");
  const nameEl = document.getElementById("adminName");
  const emailEl = document.getElementById("adminEmail");
  const roleEl = document.getElementById("adminRole");

  function showDenied(message, withLoginLink) {
    details.hidden = true;
    status.textContent = message;
    if (withLoginLink) {
      const a = document.createElement("a");
      a.href = "auth.html";
      a.textContent = "ログイン画面へ";
      status.append(document.createTextNode(" "));
      status.append(a);
    }
  }

  async function check() {
    if (!window.supabase || !window.supabase.createClient) {
      showDenied("認証ライブラリを読み込めませんでした。ネットワークを確認して再読み込みしてください。");
      return;
    }
    const client = window.supabase.createClient(
      "https://ewiurxmmomtcjfvjfpus.supabase.co",
      "sb_publishable_nvWYS-dOfApdIClbRV0A1Q_9UgaPM90",
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData || !sessionData.session) {
      showDenied("管理画面を利用するにはログインが必要です。", true);
      return;
    }
    const user = sessionData.session.user;
    const { data: profile, error } = await client
      .from("profiles")
      .select("display_name, role")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !profile) {
      showDenied("プロフィールの権限を確認できませんでした。時間をおいて再読み込みしてください。");
      return;
    }
    if (profile.role !== "admin") {
      showDenied("このアカウントには管理者権限がありません。管理画面にはアクセスできません。");
      return;
    }

    nameEl.textContent = profile.display_name || "未設定";
    emailEl.textContent = user.email || "非公開";
    roleEl.textContent = profile.role;
    details.hidden = false;
    status.textContent = "管理者権限を確認しました。管理画面にアクセスできます。";
  }

  void check();
})();