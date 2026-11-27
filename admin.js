(() => {
  "use strict";

  const SUPABASE_URL = "https://ewiurxmmomtcjfvjfpus.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nvWYS-dOfApdIClbRV0A1Q_9UgaPM90";
  const ADMIN_ENDPOINT = SUPABASE_URL + "/functions/v1/mhn-admin";
  const HTML_REVIEW_ENDPOINT = SUPABASE_URL + "/functions/v1/mhn-html-review";

  const $ = (id) => document.getElementById(id);
  const status = $("adminStatus");
  const details = $("accountDetails");
  const workspace = $("adminWorkspace");
  const listStatus = $("listStatus");
  const list = $("commentList");
  const filter = $("statusFilter");
  const search = $("searchInput");
  const refreshButton = $("refreshButton");

  let client;
  let currentSession = null;
  let comments = [];

  function setAccessMessage(message, loginLink = false) {
    details.hidden = true;
    workspace.hidden = true;
    status.textContent = message;
    if (loginLink) {
      const link = document.createElement("a");
      link.href = "auth.html";
      link.textContent = "ログイン画面へ";
      status.append(document.createTextNode(" "));
      status.append(link);
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "日時不明";
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo"
    }).format(date);
  }

  function statusLabel(value) {
    return ({ new: "未確認", reviewed: "確認済み", archived: "アーカイブ" })[value] || "不明";
  }

  async function runHtmlReview(id) {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error("ログイン状態を確認できません。再ログインしてください。");
    const response = await fetch(HTML_REVIEW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": "Bearer " + data.session.access_token
      },
      body: JSON.stringify({ id }),
      credentials: "omit",
      cache: "no-store"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) {
      if (response.status === 401) throw new Error("ログイン期限が切れました。再ログインしてください。");
      if (response.status === 403) throw new Error("管理者権限がありません。");
      throw new Error("安全検査に失敗しました。結果を安全と判断せず、手動確認してください。");
    }
    return result;
  }

  async function api(payload) {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw new Error("ログイン状態を確認できません。再ログインしてください。");
    currentSession = data.session;

    const response = await fetch(ADMIN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": "Bearer " + currentSession.access_token
      },
      body: JSON.stringify(payload),
      credentials: "omit",
      cache: "no-store"
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) {
      if (response.status === 401) throw new Error("ログイン期限が切れました。再ログインしてください。");
      if (response.status === 403) throw new Error("管理者権限がありません。");
      throw new Error("管理APIでエラーが発生しました。時間をおいて再試行してください。");
    }
    return result;
  }

  function updateCounts(counts) {
    $("countAll").textContent = counts.all ?? 0;
    $("countNew").textContent = counts.new ?? 0;
    $("countReviewed").textContent = counts.reviewed ?? 0;
    $("countArchived").textContent = counts.archived ?? 0;
  }

  function createCommentCard(comment) {
    const article = document.createElement("article");
    article.className = "comment-card";
    const messageText = String(comment.message || "");
    const isHtmlRequest = messageText.startsWith("[HTML制作依頼]");
    const isSuggestion = messageText.startsWith("[修正案]");

    const header = document.createElement("div");
    header.className = "comment-head";

    const identity = document.createElement("div");
    const nickname = document.createElement("div");
    nickname.className = "comment-name";
    nickname.textContent = comment.nickname || "匿名";
    const submitted = document.createElement("div");
    submitted.className = "muted";
    submitted.textContent = formatDate(comment.submitted_at) + "（日本時間）";
    identity.append(nickname, submitted);

    const headerBadges = document.createElement("div");
    headerBadges.style.display = "flex";
    headerBadges.style.gap = "8px";
    headerBadges.style.flexWrap = "wrap";
    const typePill = document.createElement("span");
    typePill.className = "pill";
    typePill.textContent = isHtmlRequest ? "HTML制作依頼" : isSuggestion ? "修正案" : "通常コメント";
    const pill = document.createElement("span");
    pill.className = "pill " + comment.status;
    pill.textContent = statusLabel(comment.status);
    headerBadges.append(typePill, pill);
    header.append(identity, headerBadges);

    const message = document.createElement("div");
    message.className = "message";
    message.textContent = comment.message || "";

    const meta = document.createElement("div");
    meta.className = "meta";
    const requestId = document.createElement("span");
    requestId.textContent = (isHtmlRequest ? "依頼ID: " : isSuggestion ? "修正案ID: " : "コメントID: ") + String(comment.id || "不明");
    const source = document.createElement("span");
    source.textContent = "送信元: " + (comment.source_page || "不明");
    meta.append(requestId, source);

    if (comment.contact_email) {
      const email = document.createElement("a");
      email.href = "mailto:" + comment.contact_email;
      email.textContent = "連絡先: " + comment.contact_email;
      meta.append(email);
    } else {
      const noEmail = document.createElement("span");
      noEmail.textContent = "連絡先メール: 未登録";
      meta.append(noEmail);
    }

    const fields = document.createElement("div");
    fields.className = "admin-fields";

    const statusField = document.createElement("div");
    const statusLabelEl = document.createElement("label");
    statusLabelEl.textContent = "ステータス";
    const statusSelect = document.createElement("select");
    for (const [value, label] of [["new", "未確認"], ["reviewed", "確認済み"], ["archived", "アーカイブ"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      statusSelect.append(option);
    }
    statusSelect.value = comment.status;
    statusField.append(statusLabelEl, statusSelect);

    const noteField = document.createElement("div");
    const noteLabel = document.createElement("label");
    noteLabel.textContent = "内部メモ（非公開・2,000文字まで）";
    const note = document.createElement("textarea");
    note.maxLength = 2000;
    note.value = comment.internal_note || "";
    noteField.append(noteLabel, note);

    fields.append(statusField, noteField);

    const actions = document.createElement("div");
    actions.className = "actions";
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "変更を保存";
    const saveStatus = document.createElement("span");
    saveStatus.className = "muted";
    save.addEventListener("click", async () => {
      save.disabled = true;
      saveStatus.textContent = "保存しています…";
      try {
        await api({
          action: "update",
          id: comment.id,
          status: statusSelect.value,
          internal_note: note.value
        });
        saveStatus.textContent = "保存しました";
        await loadComments(false);
      } catch (error) {
        saveStatus.textContent = error.message || "保存に失敗しました";
      } finally {
        save.disabled = false;
      }
    });
    actions.append(save, saveStatus);

    if (isHtmlRequest) {
      const reviewButton = document.createElement("button");
      reviewButton.type = "button";
      reviewButton.className = "secondary";
      reviewButton.textContent = "個人情報・秘密情報の候補を検査";
      const reviewResult = document.createElement("div");
      reviewResult.className = "message";
      reviewResult.hidden = true;
      reviewButton.addEventListener("click", async () => {
        reviewButton.disabled = true;
        reviewResult.hidden = false;
        reviewResult.textContent = "検査しています…";
        try {
          const result = await runHtmlReview(comment.id);
          const lines = [
            "検査方式: " + result.scanner,
            "候補検出数: " + result.finding_count,
            ...(result.findings || []).map((item) => "・" + item.label + "（" + item.count + "件）"),
            ...(result.findings?.length ? [] : ["候補は検出されませんでした（安全の保証ではありません）。"]),
            "",
            "公開許可: なし",
            "人による確認: 必須",
            ...(result.limitations || []).map((item) => "注意: " + item)
          ];
          reviewResult.textContent = lines.join("\n");
        } catch (error) {
          reviewResult.textContent = (error.message || "検査に失敗しました") + "\n公開判断には使用せず、手動確認してください。";
        } finally {
          reviewButton.disabled = false;
        }
      });
      actions.append(reviewButton);
      article.append(reviewResult);
    }

    article.append(header, message, meta, fields, actions);
    return article;
  }

  function renderComments() {
    const keyword = search.value.trim().toLocaleLowerCase("ja");
    const selectedStatus = filter.value;
    const visible = comments.filter((comment) => {
      if (selectedStatus !== "all" && comment.status !== selectedStatus) return false;
      if (!keyword) return true;
      const haystack = [
        comment.nickname, comment.message, comment.source_page,
        comment.contact_email, comment.internal_note
      ].filter(Boolean).join("\n").toLocaleLowerCase("ja");
      return haystack.includes(keyword);
    });

    list.replaceChildren(...visible.map(createCommentCard));
    listStatus.textContent = visible.length + "件を表示中（取得 " + comments.length + "件）";
  }

  async function loadComments(showLoading = true) {
    refreshButton.disabled = true;
    if (showLoading) listStatus.textContent = "受信項目を読み込んでいます…";
    try {
      const result = await api({ action: "list", status: "all" });
      comments = Array.isArray(result.comments) ? result.comments : [];
      updateCounts(result.counts || {});
      renderComments();
    } catch (error) {
      listStatus.textContent = error.message || "読み込みに失敗しました。";
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function checkAccess() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      setAccessMessage("認証ライブラリを読み込めませんでした。ネットワークを確認して再読み込みしてください。");
      return;
    }

    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const { data, error } = await client.auth.getSession();
    if (error || !data || !data.session) {
      currentSession = null;
      setAccessMessage("管理画面を利用するにはログインが必要です。", true);
      return;
    }

    currentSession = data.session;
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("display_name, role")
      .eq("id", currentSession.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      setAccessMessage("プロフィールの権限を確認できませんでした。時間をおいて再読み込みしてください。");
      return;
    }
    if (profile.role !== "admin") {
      setAccessMessage("このアカウントには管理者権限がありません。管理画面にはアクセスできません。");
      return;
    }

    $("adminName").textContent = profile.display_name || "未設定";
    $("adminEmail").textContent = currentSession.user.email || "非公開";
    $("adminRole").textContent = "admin";
    details.hidden = false;
    workspace.hidden = false;
    status.textContent = "管理者権限を確認しました。";
    await loadComments();
  }

  refreshButton.addEventListener("click", () => { void loadComments(); });
  filter.addEventListener("change", renderComments);
  search.addEventListener("input", renderComments);

  void checkAccess();
})();