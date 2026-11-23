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

  let eligibleRequests = [];
  let busy = false;
  let eligibilityVersion = 0;

  function setBusy(value) {
    busy = value;
    submitButton.disabled = value;
    requestSelect.disabled = value;
    suggestionInput.disabled = value;
    openButton.disabled = value;
    cancelButton.disabled = value;
  }

  function hideFeature() {
    section.hidden = true;
    form.hidden = true;
    eligibleRequests = [];
    requestSelect.replaceChildren();
  }

  function populateRequests(requests) {
    eligibleRequests = requests;
    requestSelect.replaceChildren();
    for (const request of requests) {
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

  async function refreshEligibility(session) {
    const version = ++eligibilityVersion;
    hideFeature();
    if (!session || !session.user || !session.access_token || busy) return;

    try {
      const result = await callApi(session, {
        action: "list",
        pagePath
      });

      // A sign-out or account switch may happen while the request is in flight.
      // Ignore stale responses and re-check the current authenticated user.
      if (version !== eligibilityVersion) return;
      const { data: currentData, error: currentError } = await client.auth.getSession();
      const currentSession = currentData && currentData.session;
      if (version !== eligibilityVersion) return;
      if (currentError || !currentSession || !currentSession.user ||
          currentSession.user.id !== session.user.id) {
        hideFeature();
        return;
      }

      if (!Array.isArray(result.requests) || result.requests.length === 0) return;
      populateRequests(result.requests);
      section.hidden = false;
    } catch (_) {
      // Fail closed: no button is shown when authentication or authorization
      // cannot be verified by the server.
      if (version === eligibilityVersion) hideFeature();
    }
  }

  openButton.addEventListener("click", () => {
    if (busy || eligibleRequests.length === 0) return;
    form.hidden = false;
    status.textContent = "";
    suggestionInput.focus();
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
        hideFeature();
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
        hideFeature();
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
        eligibilityVersion += 1;
        hideFeature();
        return;
      }
      await refreshEligibility(data && data.session);
    } catch (_) {
      eligibilityVersion += 1;
      hideFeature();
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
