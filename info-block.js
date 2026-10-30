(() => {
  "use strict";

  const OPEN = "↓i↓";
  const CLOSE = "↑i↑";

  function renderMarkdownInto(parent, source) {
    if (window.marked && typeof window.marked.parse === "function" && window.DOMPurify) {
      const html = window.marked.parse(source, { gfm: true, breaks: false });
      const safeHtml = window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
      const template = document.createElement("template");
      template.innerHTML = safeHtml;
      parent.appendChild(template.content);
      return;
    }
    parent.appendChild(document.createTextNode(source));
  }

  function render(output, text) {
    const lines = String(text).split(/\r?\n/);
    const fragments = [];
    let plain = [];

    function flushPlain() {
      if (!plain.length) return;
      fragments.push({ type: "markdown", text: plain.join("\n") });
      plain = [];
    }

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const marker = line.trim();

      if (marker === "\\↓i↓" || marker === "\\↑i↑") {
        plain.push(line.replace("\\", ""));
        continue;
      }

      if (marker === OPEN) {
        let closeAt = -1;
        let nestedOpenAt = -1;
        for (let j = i + 1; j < lines.length; j += 1) {
          const candidate = lines[j].trim();
          if (candidate === OPEN) {
            nestedOpenAt = j;
            break;
          }
          if (candidate === CLOSE) {
            closeAt = j;
            break;
          }
        }

        if (closeAt !== -1 && (nestedOpenAt === -1 || closeAt < nestedOpenAt)) {
          flushPlain();
          fragments.push({ type: "info", text: lines.slice(i + 1, closeAt).join("\n") });
          i = closeAt;
          continue;
        }
      }

      plain.push(line);
    }
    flushPlain();

    output.replaceChildren();
    for (const fragment of fragments) {
      if (fragment.type === "info") {
        const details = document.createElement("details");
        details.className = "mhn-info-block";
        const summary = document.createElement("summary");
        summary.textContent = "きょうの確認先";
        const content = document.createElement("div");
        content.className = "mhn-info-content";
        renderMarkdownInto(content, fragment.text);
        details.append(summary, content);
        output.appendChild(details);
      } else {
        renderMarkdownInto(output, fragment.text);
      }
    }
  }

  window.MHNInfoBlock = Object.freeze({ render });
})();
