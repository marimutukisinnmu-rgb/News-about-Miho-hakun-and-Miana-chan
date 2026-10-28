(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const status = $("adminStatus");
  const mfaPanel = $("mfaPanel");
  const mfaTitle = $("mfaTitle");
  const mfaDescription = $("mfaDescription");
  const enrollPanel = $("enrollPanel");
  const secretInput = $("totpSecret");
  const mfaForm = $("mfaForm");
  const codeInput = $("totpCode");
  const verifyButton = $("verifyButton");
  const mfaStatus = $("mfaStatus");
  const accountPanel = $("accountPanel");
  let client;
  let mode = null;
  let factorId = null;
  let challengeId = null;
  let checking = false;

  function deny(message, loginLink = false) {
    mfaPanel.hidden = true;
    accountPanel.hidden = true;
    status.textContent = message;
    if (loginLink) {
      const link = document.createElement("a");
      link.href = "auth.html";
      link.textContent = "ログイン画面へ";
      status.append(document.createTextNode(" "));
      status.append(link);
    }
  }

  function setBusy(busy) {
    verifyButton.disabled = busy;
    codeInput.disabled = busy;
  }

  async function init() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      deny("認証ライブラリを読み込めませんでした。ネットワークを確認して再読み込みしてください。");
      return;
    }
    client = window.supabase.createClient(
      "https://ewiurxmmomtcjfvjfpus.supabase.co",
      "sb_publishable_nvWYS-dOfApdIClbRV0A1Q_9UgaPM90",
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );
    await checkAccess();
  }

  async function checkAccess() {
    if (checking) return;
    checking = true;
    mfaPanel.hidden = true;
    accountPanel.hidden = true;
    status.textContent = "セッションと管理者権限を確認しています…";
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError || !sessionData?.session) {
        deny("管理画面を利用するにはログインが必要です。", true);
        return;
      }
      const session = sessionData.session;
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData?.user || userData.user.id !== session.user.id) {
        deny("ユーザーセッションを検証できませんでした。再ログインしてください。", true);
        return;
      }
      const user = userData.user;
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("display_name, role")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError || !profile) {
        deny("管理者権限を確認できませんでした。アクセスを拒否しました。");
        return;
      }
      if (profile.role !== "admin") {
        deny("このアカウントには管理者権限がありません。アクセスを拒否しました。");
        return;
      }

      const [{ data: assurance, error: assuranceError }, { data: factors, error: factorError }] = await Promise.all([
        client.auth.mfa.getAuthenticatorAssuranceLevel(),
        client.auth.mfa.listFactors()
      ]);
      if (assuranceError || factorError || !assurance || !factors) {
        deny("多要素認証の状態を確認できませんでした。アクセスを拒否しました。");
        return;
      }

      const totpFactors = Array.isArray(factors.totp) ? factors.totp : [];
      const verified = totpFactors.find((factor) => factor.status === "verified");
      const pending = totpFactors.find((factor) => factor.status !== "verified");

      if (!verified && pending) {
        deny("未完了の認証アプリ登録が残っています。安全のため自動で削除・再登録せず、アカウントの認証要素を確認してから再試行してください。");
        return;
      }
      if (!verified) {
        const { data, error } = await client.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "MHN 管理画面"
        });
        if (error || !data?.id || !data?.totp?.secret) {
          deny("認証アプリの登録を開始できませんでした。設定を確認して再試行してください。");
          return;
        }
        factorId = data.id;
        mode = "enroll";
        mfaTitle.textContent = "認証アプリを登録";
        mfaDescription.textContent = "管理者用の認証アプリを登録します。秘密鍵を安全に保管し、認証アプリが生成する最新の6桁コードで確認してください。";
        secretInput.value = data.totp.secret;
        enrollPanel.hidden = false;
        verifyButton.textContent = "登録して検証";
        mfaStatus.textContent = "";
        mfaPanel.hidden = false;
        status.textContent = "管理者ロールを確認しました。管理操作の前にTOTP登録が必要です。";
        return;
      }

      factorId = verified.id;
      if (assurance.currentLevel !== "aal2") {
        mode = "challenge";
        const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
        if (challengeError || !challenge?.id) {
          deny("追加認証を開始できませんでした。しばらく待ってから再試行してください。");
          return;
        }
        challengeId = challenge.id;
        mfaTitle.textContent = "ワンタイムコードを入力";
        mfaDescription.textContent = "認証アプリの最新の6桁コードを入力してください。";
        enrollPanel.hidden = true;
        secretInput.value = "";
        verifyButton.textContent = "コードを検証";
        mfaStatus.textContent = "";
        mfaPanel.hidden = false;
        status.textContent = "管理者ロールを確認しました。追加認証が必要です。";
        return;
      }

      $("adminName").textContent = profile.display_name || "未設定";
      $("adminEmail").textContent = user.email || "非公開";
      $("adminRole").textContent = profile.role;
      accountPanel.hidden = false;
      status.textContent = "管理者ロールとAAL2を確認しました。";
    } catch (_) {
      deny("認証確認中にエラーが発生しました。安全のためアクセスを拒否しました。");
    } finally {
      checking = false;
    }
  }

  mfaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client || !factorId || !mode || verifyButton.disabled) return;
    const code = codeInput.value.trim();
    if (!/^[0-9]{6}$/.test(code)) {
      mfaStatus.textContent = "6桁の数字を入力してください。";
      return;
    }
    setBusy(true);
    mfaStatus.textContent = "コードを検証しています…";
    try {
      if (mode === "enroll") {
        const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
        if (challengeError || !challenge?.id) throw new Error("challenge_failed");
        challengeId = challenge.id;
      }
      const { error } = await client.auth.mfa.verify({ factorId, challengeId, code });
      if (error) throw error;
      codeInput.value = "";
      mode = null;
      challengeId = null;
      mfaStatus.textContent = "認証できました。セッションを再確認しています…";
      await checkAccess();
    } catch (_) {
      mfaStatus.textContent = "認証に失敗しました。コードの期限を確認し、最新のコードで再試行してください。";
      codeInput.value = "";
      codeInput.focus();
    } finally {
      setBusy(false);
    }
  });

  $("refreshButton").addEventListener("click", () => void checkAccess());
  $("logoutButton").addEventListener("click", async () => {
    $("logoutButton").disabled = true;
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      window.location.replace("auth.html");
    } catch (_) {
      status.textContent = "ログアウトできませんでした。再試行してください。";
    } finally {
      $("logoutButton").disabled = false;
    }
  });

  void init();
})();