(() => {
  "use strict";

  const section = document.getElementById("pageFeedbackSection");
  const openButton = document.getElementById("pageFeedbackOpen");
  const form = document.getElementById("pageFeedbackForm");
  const requestSelect = document.getElementById("pageFeedbackRequest");
  const suggestionInput = document.getElementById("pageFeedbackText");
  const submitButton = document.getElementById("pageFeedbackSubmit");
  const cancelButton = document.getElementById("pageFeedbackCancel");
  const status = document.getElementById("pageFeedbackStatus");
  const endpoint = "https://ewiurxmmomtcjfvjfpus.supabase.co/functions/v1/mhn-page-feedback";
  const publishableKey = "sb_publishable_nvWYS-dOfApdIClbRV0A1Q_9UgaPM90";
  const pagePath = window.location.pathname;

  if (!section || !openButton || !form || !requestSelect || !suggestionInput ||
      !submitButton || !cancelButton || !status) return;

  const client = window.__mhnSupabaseClient;
  if (!client || !client.auth) return;

  const loadMoreButton = document.createElement("button");
  loadMoreButton.type = "button";
  loadMoreButton.className = "submit-button";
  loadMoreButton.textContent = "さらに依頼を読み込む";
  loadMoreButton.setAttribute("aria-controls", requestSelect.id);
  loadMoreButton.hidden = true;
  section.insertBefore(loadMoreButton, status);

  let eligibleRequests = [];
  let nextOffset = null;
  let busy = false;
  let eligibilityVersion = 0;
  let activeUserId = null;

  function setBusy(value) {
    busy = value;
    submitButton.disabled = value;
    requestSelect.disabled = value;
    suggestionInput.disabled = value;
    openButton.disabled = value;
    cancelButton.disabled = value;
    loadMoreButton.disabled = value;
  }

  function hideFeature() {
    section.hidden = true;
    form.hidden = true;
    eligibleRequests = [];
    nextOffset = null;
    loadMoreButton.hidden = true;
    requestSelect.replaceChildren();
  }

  function failClosed() {
    eligibilityVersion += 1;
    activeUserId = null;
    form.reset();
    hideFeature();
  }

  function populateRequests(requests, append = false) {
    const combined = append ? eligibleRequests.slice() : [];
    const knownIds = new Set(combined.map((request) => request.id));
    const added = [];

    for (const request of requests) {
      if (!request || typeof request.id !== "string" || knownIds.has(request.id)) continue;
      knownIds.add(request.id);
      combined.push(request);
      added.push(request);
    }

    if (!append) requestSelect.replaceChildren();
    eligibleRequests = combined;

    for (const request of added) {
      const option = document.createElement("option");
      option.value = request.id;
      const date = request.submitted_at
        ? new Date(request.submitted_at).toLocaleDateString("ja-JP")
        : "";
      option.textContent = date
        ? request.title + "（" + date + "）"
        : request.title;
      requestSelect.appendChild(option);
    }
  }

  async function callApi(session, payload) {
    if (!session || !session.access_token) throw new Error("unauthorized");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": publishableKey,
        "Authorization": "Bearer " + session.access_token
      },
      body: JSON.stringify(payload),
      credentials: "omit",
      cache: "no-store"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) {
      const error = new Error(result.error || "request_failed");
      error.status = response.status;
      throw error;
    }
    return result;
  }

  async function fetchRequestPage(session, offset, append, version) {
    const result = await callApi(session, {
      action: "list",
      pagePath,
      offset
    });

    // Discard stale responses after logout or an account switch.
    if (version !== eligibilityVersion) return;

    // Confirm that the same authenticated account is still active before
    // exposing request titles or enabling the requester-only button.
    const { data: currentData, error: currentError } = await client.auth.getSession();
    const currentSession = currentData && currentData.session;
    if (currentError || !currentSession || !currentSession.user || !currentSession.access_token ||
        currentSession.user.id !== session.user.id) {
      if (version === eligibilityVersion) failClosed();
      return;
    }
    if (version !== eligibilityVersion) return;
    if (!Array.isArray(result.requests)) throw new Error("invalid_request_list");

    if (!append && result.requests.length === 0) return;
    populateRequests(result.requests, append);

    const candidateOffset = result.next_offset;
    nextOffset = result.has_more === true &&
        Number.isSafeInteger(candidateOffset) && candidateOffset > offset
      ? candidateOffset
      : null;
    loadMoreButton.hidden = nextOffset === null;
    section.hidden = eligibleRequests.length === 0;
  }

  async function refreshEligibility(session) {
    const version = ++eligibilityVersion;
    const nextUserId = session && session.user ? session.user.id : null;
    if (nextUserId !== activeUserId) form.reset();
    activeUserId = nextUserId;
    hideFeature();

    if (!session || !session.user || !session.access_token) return;

    try {
      await fetchRequestPage(session, 0, false, version);
    } catch (_) {
      // Fail closed: no button is shown when authentication or authorization
      // cannot be verified by the server.
      if (version === eligibilityVersion) failClosed();
    }
  }

  openButton.addEventListener("click", () => {
    if (busy || eligibleRequests.length === 0) return;
    form.hidden = false;
    status.textContent = "";
    suggestionInput.focus();
  });

  loadMoreButton.addEventListener("click", async () => {
    if (busy || nextOffset === null) return;
    const version = eligibilityVersion;
    const offset = nextOffset;
    setBusy(true);
    try {
      const { data, error } = await client.auth.getSession();
      const session = data && data.session;
      if (error || !session || !session.user || !session.access_token ||
          session.user.id !== activeUserId) {
        if (version === eligibilityVersion) failClosed();
        return;
      }
      await fetchRequestPage(session, offset, true, version);
    } catch (_) {
      if (version === eligibilityVersion) failClosed();
    } finally {
      setBusy(false);
    }
  });

  cancelButton.addEventListener("click", () => {
    if (busy) return;
    form.reset();
    form.hidden = true;
    status.textContent = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const suggestion = suggestionInput.value.trim();
    const requestId = requestSelect.value;
    if (!suggestion || suggestion.length > 1500 || !eligibleRequests.some(item => item.id === requestId)) {
      status.textContent = "入力内容を確認してください。";
      return;
    }

    setBusy(true);
    status.textContent = "修正案を送信しています…";
    try {
      const { data, error } = await client.auth.getSession();
      const session = data && data.session;
      if (error || !session || !session.user || !session.access_token) {
        failClosed();
        status.textContent = "ログイン状態を確認できません。再ログインしてください。";
        return;
      }
      await callApi(session, {
        action: "submit",
        requestId,
        pagePath,
        suggestion
      });
      form.reset();
      form.hidden = true;
      status.textContent = "修正案を非公開で送信しました。";
    } catch (error) {
      if (error && (error.status === 401 || error.status === 403 || error.status === 404)) {
        failClosed();
        status.textContent = "このページに紐づく依頼を確認できませんでした。";
      } else if (error && error.status === 429) {
        status.textContent = "短時間の連続送信はできません。しばらく待ってください。";
      } else {
        status.textContent = "送信できませんでした。時間をおいて再度お試しください。";
      }
    } finally {
      setBusy(false);
      void refreshFromCurrentSession();
    }
  });

  async function refreshFromCurrentSession() {
    try {
      const { data, error } = await client.auth.getSession();
      if (error) {
        failClosed();
        return;
      }
      await refreshEligibility(data && data.session);
    } catch (_) {
      failClosed();
    }
  }

  window.addEventListener("mhn:html-request-submitted", () => {
    void refreshFromCurrentSession();
  });

  void refreshFromCurrentSession();

  client.auth.onAuthStateChange((_event, session) => {
    void refreshEligibility(session);
  });
})();
