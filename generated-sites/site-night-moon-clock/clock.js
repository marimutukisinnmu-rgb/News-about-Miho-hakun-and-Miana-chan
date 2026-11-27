(() => {
  "use strict";

  const hourHand = document.getElementById("hourHand");
  const minuteHand = document.getElementById("minuteHand");
  const secondHand = document.getElementById("secondHand");
  const digitalTime = document.getElementById("digitalTime");
  const dateText = document.getElementById("dateText");
  const mode12 = document.getElementById("mode12");
  const mode24 = document.getElementById("mode24");
  const zoneLabel = document.getElementById("zoneLabel");
  const moonShadow = document.getElementById("moonShadow");
  const moonVisual = document.getElementById("moonVisual");
  const moonName = document.getElementById("moonName");
  const moonDetail = document.getElementById("moonDetail");

  if (!hourHand || !minuteHand || !secondHand || !digitalTime) return;

  let hour12 = false;
  const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });

  function updateClock() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();

    const smoothSeconds = seconds + milliseconds / 1000;
    const minuteValue = minutes + smoothSeconds / 60;
    const hourValue = (hours % 12) + minuteValue / 60;

    hourHand.style.transform = "translateX(-50%) rotate(" + (hourValue * 30) + "deg)";
    minuteHand.style.transform = "translateX(-50%) rotate(" + (minuteValue * 6) + "deg)";
    secondHand.style.transform = "translateX(-50%) rotate(" + (smoothSeconds * 6) + "deg)";

    digitalTime.textContent = new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: hour12
    }).format(now);
    dateText.textContent = dateFormatter.format(now);
  }

  function setMode(use12Hour) {
    hour12 = use12Hour;
    mode12.setAttribute("aria-pressed", String(use12Hour));
    mode24.setAttribute("aria-pressed", String(!use12Hour));
    zoneLabel.textContent = use12Hour ? "12 HOUR" : "24 HOUR";
    updateClock();
  }

  mode12.addEventListener("click", () => setMode(true));
  mode24.addEventListener("click", () => setMode(false));

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function updateMoon() {
    const now = new Date();
    const localNoonAsUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
    const synodicMonth = 29.530588853;
    const age = positiveModulo((localNoonAsUTC - knownNewMoon) / 86400000, synodicMonth);
    const phase = age / synodicMonth;
    const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;

    let label;
    if (phase < 0.035 || phase >= 0.965) label = "新月";
    else if (phase < 0.22) label = "満ちていく三日月";
    else if (phase < 0.28) label = "上弦の月";
    else if (phase < 0.465) label = "満ちていく月";
    else if (phase < 0.535) label = "満月";
    else if (phase < 0.72) label = "欠けていく月";
    else if (phase < 0.78) label = "下弦の月";
    else label = "欠けていく三日月";

    const radius = 41;
    const shadowOffset = phase < 0.5
      ? -2 * radius * (phase / 0.5)
      : 2 * radius * ((1 - phase) / 0.5);

    moonShadow.style.transform = "translateX(" + shadowOffset.toFixed(2) + "px)";
    moonVisual.setAttribute("aria-label", label + "、明るさ約" + Math.round(illumination * 100) + "パーセント");
    moonName.textContent = label;
    moonDetail.textContent = "月齢 約" + age.toFixed(1) + "日 · 明るさ 約" + Math.round(illumination * 100) + "%";
  }

  setMode(false);
  updateMoon();
  updateClock();
  window.setInterval(updateClock, 250);
  window.setInterval(updateMoon, 60 * 60 * 1000);
})();