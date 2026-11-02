(() => {
  "use strict";

  const ENDPOINT = "https://ewiurxmmomtcjfvjfpus.supabase.co/functions/v1/mhn-page-view";
  const PUBLISHABLE_KEY = "sb_publishable_nvWYS-dOfApdIClbRV0A1Q_9UgaPM90";

  function detectPlatform(userAgent, userAgentData) {
    if (userAgentData && typeof userAgentData.platform === "string" && userAgentData.platform) {
      return userAgentData.platform.slice(0, 100);
    }
    if (/Android/i.test(userAgent)) return "Android";
    if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
    if (/Windows/i.test(userAgent)) return "Windows";
    if (/Macintosh|Mac OS X/i.test(userAgent)) return "macOS";
    if (/Linux/i.test(userAgent)) return "Linux";
    return String(navigator.platform || "unknown").slice(0, 100);
  }

  function fallbackModel(userAgent) {
    const android = userAgent.match(
      /Android\s[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]+)?[;)]/i
    );
    if (android && android[1]) return android[1].trim().slice(0, 200);
    if (/iPhone/i.test(userAgent)) return "iPhone";
    if (/iPad/i.test(userAgent)) return "iPad";
    if (/iPod/i.test(userAgent)) return "iPod";
    return null;
  }

  function detectDeviceType(userAgent, userAgentData) {
    if (/iPad/i.test(userAgent) ||
        (/Macintosh/i.test(userAgent) && Number(navigator.maxTouchPoints) > 1)) {
      return "tablet";
    }
    if (
      (userAgentData && userAgentData.mobile === true) ||
      /iPhone|iPod|Android.*Mobile|Windows Phone|Mobile/i.test(userAgent)
    ) {
      return "mobile";
    }
    if (/Android|Tablet|PlayBook|Silk/i.test(userAgent)) return "tablet";
    if (/Windows|Macintosh|Mac OS X|Linux|X11/i.test(userAgent)) return "desktop";
    return "unknown";
  }

  function getPagePath() {
    const path = window.location.pathname || "/";
    // Individual story pages use a validated log filename as their page ID.
    // All other query strings and URL fragments are intentionally excluded.
    if (path.endsWith("/historyoutput.html")) {
      const logName = new URLSearchParams(window.location.search).get("log") || "";
      if (/^#\d{1,10} \d{4}-\d{2}-\d{2}-\d{2}:\d{2}\.txt$/u.test(logName)) {
        return path + "?log=" + encodeURIComponent(logName);
      }
    }
    return path;
  }

  async function collectDeviceInfo() {
    const userAgent = String(navigator.userAgent || "").slice(0, 2_000);
    const userAgentData = navigator.userAgentData || null;
    let model = null;

    if (userAgentData && typeof userAgentData.getHighEntropyValues === "function") {
      try {
        const values = await userAgentData.getHighEntropyValues(["model"]);
        if (typeof values.model === "string" && values.model.trim()) {
          model = values.model.trim().slice(0, 200);
        }
      } catch (_) {
        // High-entropy device data is optional and unavailable in some browsers.
      }
    }

    if (!model) model = fallbackModel(userAgent);

    return {
      userAgent,
      deviceType: detectDeviceType(userAgent, userAgentData),
      deviceModel: model,
      platform: detectPlatform(userAgent, userAgentData)
    };
  }

  async function recordPageView() {
    try {
      const device = await collectDeviceInfo();
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": PUBLISHABLE_KEY
        },
        body: JSON.stringify({
          pagePath: getPagePath(),
          deviceType: device.deviceType,
          deviceModel: device.deviceModel,
          platform: device.platform,
          userAgent: device.userAgent
        }),
        credentials: "omit",
        cache: "no-store",
        keepalive: true
      });

      if (!response.ok) {
        console.warn("[MHN analytics] page-view record was not accepted:", response.status);
      }
    } catch (_) {
      // Analytics must never prevent the page itself from loading or working.
      console.warn("[MHN analytics] page-view request failed");
    }
  }

  void recordPageView();
})();
