// NOTE: this function is serialized and injected into the page by
// chrome.scripting.executeScript, so it must stay fully self-contained
// (no references to anything defined outside of it).
function renderPopup(data, theme, options = {}) {
  const EXISTING_ID = "__ioc_recon_popup__";
  const old = document.getElementById(EXISTING_ID);
  if (old) {
    if (old.__escHandler) document.removeEventListener("keydown", old.__escHandler);
    if (old.__closeTimer) clearTimeout(old.__closeTimer);
    old.remove();
  }

  const defangIp = (value) => (value ? value.replace(/\./g, "[.]") : value);
  const defangUrl = (value) =>
    value
      ? value
          .replace(/http/gi, (m) => (m === m.toUpperCase() ? "HXXP" : "hxxp"))
          .replace(/\./g, "[.]")
      : value;

  const copyText = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  };

  const esc = (v) =>
    String(v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  // ---------------------------------------------------------------------
  // Styles (Argus look: warm black, mint accent, square corners, Geist)
  // ---------------------------------------------------------------------
  const STYLE_ID = "__ioc_recon_style__";
  let styleEl = document.getElementById(STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  const c = theme.color;
  const sans = `"IOC Geist", "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const mono = `"IOC Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  const ff = theme.fontFiles;
  const fontFaces = ff
    ? `
    @font-face { font-family: "IOC Geist"; font-weight: 300; font-display: swap; src: url("${ff.sans300}") format("woff2"); }
    @font-face { font-family: "IOC Geist"; font-weight: 400; font-display: swap; src: url("${ff.sans400}") format("woff2"); }
    @font-face { font-family: "IOC Geist"; font-weight: 500; font-display: swap; src: url("${ff.sans500}") format("woff2"); }
    @font-face { font-family: "IOC Geist Mono"; font-weight: 400; font-display: swap; src: url("${ff.mono400}") format("woff2"); }
    @font-face { font-family: "IOC Geist Mono"; font-weight: 500; font-display: swap; src: url("${ff.mono500}") format("woff2"); }`
    : "";

  const ID = `#${EXISTING_ID}`;
  styleEl.textContent = `
    ${fontFaces}
    @keyframes iocFadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes iocBlink { 50% { opacity: 0.2; } }

    ${ID} {
      all: initial;
      display: block;
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      width: 380px;
      max-width: calc(100vw - 24px);
      padding: 20px;
      background-color: ${c.bg};
      background-image:
        linear-gradient(to right, ${c.grid} 1px, transparent 1px),
        linear-gradient(to bottom, ${c.grid} 1px, transparent 1px);
      background-size: ${theme.grid} ${theme.grid};
      background-position: 19px 0;
      border: 1px solid ${c.line};
      box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.6);
      color: ${c.text};
      font-family: ${sans};
      font-size: 14px;
      line-height: 1.45;
      overflow-y: auto;
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
      animation: iocFadeIn 0.18s ease-out;
    }
    ${ID} *, ${ID} *::before, ${ID} *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      letter-spacing: inherit;
      text-transform: none;
      text-decoration: none;
      text-shadow: none;
      float: none;
    }
    ${ID} ::selection { background: ${c.accent}; color: ${c.accentInk}; }
    ${ID} :focus-visible { outline: 2px solid ${c.accent}; outline-offset: 2px; }
    ${ID} ::-webkit-scrollbar { width: 6px; }
    ${ID} ::-webkit-scrollbar-thumb { background: ${c.scrollThumb}; }
    ${ID} ::-webkit-scrollbar-thumb:hover { background: ${c.muted}; }
    ${ID} .ioc-mono { font-family: ${mono}; font-feature-settings: "zero" 1; }

    /* Heading */
    ${ID} .ioc-head { padding-right: 36px; margin-bottom: 14px; }
    ${ID} .ioc-eyebrow {
      display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 4px;
      color: ${c.muted}; font-family: ${mono}; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
    }
    ${ID} .ioc-title {
      font-weight: 400; font-size: 26px; line-height: 1.1; letter-spacing: -0.04em; word-break: break-all;
    }
    ${ID} .ioc-title.is-long { font-size: 18px; letter-spacing: -0.03em; }
    ${ID} .ioc-sub { margin-top: 6px; color: ${c.muted}; font-family: ${mono}; font-size: 11.5px; word-break: break-all; }

    /* Square tags (cache, Tor, ...) */
    ${ID} .ioc-tag {
      display: inline-block; padding: 1px 6px; border: 1px solid ${c.line}; color: ${c.muted};
      font-family: ${mono}; font-size: 10px; letter-spacing: 0.06em; line-height: 1.5; text-transform: uppercase;
    }
    ${ID} .ioc-tag.warn { border-color: ${c.warn}; color: ${c.warn}; }

    /* Sections and rows */
    ${ID} .ioc-section-title {
      margin: 16px 0 4px; color: ${c.muted};
      font-family: ${mono}; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
    }
    ${ID} .ioc-section-title:first-of-type { margin-top: 0; }
    ${ID} .ioc-row {
      display: grid; grid-template-columns: minmax(96px, 38%) 1fr; gap: 14px; align-items: baseline;
      padding: 6px 0; font-size: 13.5px;
    }
    ${ID} .ioc-row + .ioc-row { border-top: 1px solid ${c.lineSoft}; }
    ${ID} .ioc-label { color: ${c.muted}; }
    ${ID} .ioc-value {
      min-width: 0; font-family: ${mono}; font-size: 12.5px; overflow-wrap: anywhere; text-align: right;
    }
    ${ID} .ioc-value small { color: ${c.muted}; font-size: 11px; }
    ${ID} .ioc-row.is-highlight .ioc-label { color: ${c.text}; }
    ${ID} .ioc-row.is-highlight .ioc-value { color: ${c.accent}; }

    /* Status badge: square dot + text */
    ${ID} .ioc-badge { display: inline-flex; align-items: center; justify-content: flex-end; gap: 8px; }
    ${ID} .ioc-badge::before { content: ""; width: 8px; height: 8px; background: ${c.dim}; }
    ${ID} .ioc-badge.ok::before { background: ${c.accent}; }
    ${ID} .ioc-badge.bad { color: ${c.warn}; }
    ${ID} .ioc-badge.bad::before { background: ${c.warn}; }
    ${ID} .ioc-badge.na { color: ${c.muted}; }

    /* Bracketed mono links: the Argus signature */
    ${ID} .ioc-bracket {
      display: inline-flex; align-items: center; gap: 0.7em; padding: 4px 0; cursor: pointer; white-space: nowrap;
      color: ${c.accent}; font-family: ${mono}; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;
    }
    ${ID} .ioc-bracket__label { transition: color 120ms ease; }
    ${ID} .ioc-bracket:hover .ioc-bracket__label { color: ${c.text}; }
    ${ID} .ioc-actions {
      display: flex; align-items: center; flex-wrap: wrap; gap: 4px 20px;
      margin-top: 14px; padding-top: 10px; border-top: 1px solid ${c.line};
    }

    /* Square icon button */
    ${ID} .ioc-close-btn {
      position: absolute; top: 14px; right: 14px; display: grid; place-items: center;
      width: 28px; height: 28px; border: 1px solid ${c.line}; background: ${c.bg}; color: ${c.muted}; cursor: pointer;
      transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease;
    }
    ${ID} .ioc-close-btn:hover { border-color: ${c.accent}; background: ${c.accentSoft}; color: ${c.accent}; }

    /* Collapsible entries (multi-IP) */
    ${ID} .ioc-acc-list { border: 1px solid ${c.line}; background: rgba(21, 21, 21, 0.85); }
    ${ID} .ioc-acc + .ioc-acc { border-top: 1px solid ${c.line}; }
    ${ID} .ioc-acc-head {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      cursor: pointer; font-size: 13px; user-select: none; transition: background-color 140ms ease;
    }
    ${ID} .ioc-acc-head:hover { background: ${c.bgRaised}; }
    ${ID} .ioc-acc-caret { flex: none; display: block; color: ${c.accent}; transition: transform 200ms ease; }
    ${ID} .ioc-acc.is-open .ioc-acc-caret { transform: rotate(180deg); }
    ${ID} .ioc-acc-ip { flex: none; font-family: ${mono}; font-size: 13px; }
    ${ID} .ioc-acc-meta {
      flex: 1; min-width: 0; color: ${c.muted}; font-size: 12px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    ${ID} .ioc-acc-body { display: none; padding: 4px 12px 12px; border-top: 1px solid ${c.lineSoft}; }
    ${ID} .ioc-acc.is-open .ioc-acc-body { display: block; }

    /* Notices */
    ${ID} .ioc-error, ${ID} .ioc-warning { padding: 10px 14px; font-size: 14px; }
    ${ID} .ioc-error { border-left: 2px solid ${c.danger}; background: ${c.dangerSoft}; }
    ${ID} .ioc-warning { margin-top: 10px; border-left: 2px solid ${c.warn}; background: ${c.warnSoft}; font-size: 13px; }

    /* Loading */
    ${ID} .ioc-loading { display: flex; align-items: center; gap: 12px; padding-right: 36px; font-size: 15px; }
    ${ID} .ioc-loading::before {
      content: ""; flex: none; width: 8px; height: 8px; background: ${c.accent};
      animation: iocBlink 900ms steps(2, jump-none) infinite;
    }
  `;

  const box = document.createElement("div");
  box.id = EXISTING_ID;
  box.style.visibility = "hidden"; // shown only after it has been positioned

  // Places the card next to the selected IOC (below it, or above if there is no room),
  // always keeping it inside the visible viewport. Without an anchor it keeps the
  // default top-right position.
  const positionBox = () => {
    const a = options.anchor;
    if (a) {
      const MARGIN = 12;
      const GAP = 8;
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;

      // Anchor in viewport coordinates (page coordinates minus current scroll)
      const selLeft = a.x - window.scrollX;
      const selTop = a.y - window.scrollY;
      const selBottom = selTop + a.h;

      box.style.maxHeight = Math.min(vh * 0.8, vh - MARGIN * 2) + "px";
      const w = box.offsetWidth;
      const h = box.offsetHeight;

      let left = Math.min(Math.max(selLeft, MARGIN), Math.max(MARGIN, vw - w - MARGIN));

      const spaceBelow = vh - selBottom - GAP - MARGIN;
      const spaceAbove = selTop - GAP - MARGIN;
      let top;
      if (h <= spaceBelow) top = selBottom + GAP;
      else if (h <= spaceAbove) top = selTop - GAP - h;
      else top = spaceBelow >= spaceAbove ? selBottom + GAP : selTop - GAP - h;
      top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - h - MARGIN));

      box.style.left = left + "px";
      box.style.top = top + "px";
      box.style.right = "auto";
    } else {
      box.style.maxHeight = "80vh";
    }
    box.style.visibility = "visible";
  };

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ioc-close-btn";
  closeBtn.title = "Close (Esc)";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="1.75"/></svg>`;
  const closeBox = () => {
    clearTimeout(box.__closeTimer);
    document.removeEventListener("keydown", escHandler);
    box.remove();
  };
  closeBtn.onclick = closeBox;

  const escHandler = (e) => {
    if (e.key === "Escape") closeBox();
  };
  document.addEventListener("keydown", escHandler);
  box.__escHandler = escHandler;

  if (options.autoCloseMs > 0) {
    box.__closeTimer = setTimeout(closeBox, options.autoCloseMs);
  }

  // Mounts the card, positions it, and positions it again once the bundled fonts
  // are ready (they change the card's size).
  const finish = () => {
    box.appendChild(closeBtn);
    document.body.appendChild(box);
    positionBox();
    if (theme.fontFiles && document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load('400 14px "IOC Geist"'),
        document.fonts.load('400 14px "IOC Geist Mono"')
      ])
        .then(() => {
          if (box.isConnected) positionBox();
        })
        .catch(() => {});
    }
  };

  if (data.error) {
    box.innerHTML = `
      <div class="ioc-head"><div class="ioc-eyebrow">IOC Recon</div></div>
      <div class="ioc-error">${esc(data.error)}</div>
    `;
    finish();
    return;
  }

  if (data.loading) {
    box.innerHTML = `<div class="ioc-loading">${esc(data.loading)}</div>`;
    finish();
    return;
  }

  // ---------------------------------------------------------------------
  // Building blocks
  // ---------------------------------------------------------------------
  const badge = (state, okLabel, badLabel, naLabel = "N/D") => {
    if (state === null || state === undefined) return `<span class="ioc-badge na ioc-mono">${naLabel}</span>`;
    return state
      ? `<span class="ioc-badge bad ioc-mono">${badLabel}</span>`
      : `<span class="ioc-badge ok ioc-mono">${okLabel}</span>`;
  };

  const row = (label, value, highlight = false) =>
    `<div class="ioc-row${highlight && value != null ? " is-highlight" : ""}"><span class="ioc-label">${label}</span><span class="ioc-value">${value == null ? "N/D" : esc(value)}</span></div>`;

  const connectionRow = (conn) =>
    conn
      ? `<div class="ioc-row"><span class="ioc-label">Connection type</span><span class="ioc-value" title="${esc(conn.basis)}">${esc(conn.type)} <small>(${esc(conn.confidence)})</small></span></div>`
      : row("Connection type", null);

  const sectionTitle = (label) => `<div class="ioc-section-title">${label}</div>`;

  const titleClass = (text, limit) => (String(text).length > limit ? "ioc-title is-long" : "ioc-title");

  const newActionRow = () => {
    const el = document.createElement("div");
    el.className = "ioc-actions";
    return el;
  };
  const actionRow = newActionRow();

  const makeBracket = (label) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "ioc-bracket";
    el.innerHTML = `<span aria-hidden="true">[</span><span class="ioc-bracket__label">${esc(label)}</span><span aria-hidden="true">]</span>`;
    return el;
  };

  const makeCopyButton = (label, textToCopy) => {
    const btn = makeBracket(label);
    const labelEl = btn.querySelector(".ioc-bracket__label");
    btn.onclick = () => {
      copyText(textToCopy);
      labelEl.textContent = "Copied";
      setTimeout(() => (labelEl.textContent = label), 1200);
    };
    return btn;
  };

  const makeLinkButton = (label, targetUrl) => {
    const btn = makeBracket(label);
    btn.onclick = (e) => {
      e.preventDefault();
      if (!targetUrl) return;
      window.open(targetUrl, "_blank");
    };
    return btn;
  };

  const whoisUrl =
    data.kind === "url"
      ? data.whoisUrl || `https://whois.domaintools.com/${encodeURIComponent(data.domain)}`
      : null;
  const toBase64UrlLocal = (str) => {
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const virustotalUrl =
    data.kind === "url"
      ? data.virustotalUrl || `https://www.virustotal.com/gui/url/${toBase64UrlLocal(data.url)}`
      : null;

  const cachedTag = data.cached ? `<span class="ioc-tag">cache</span>` : "";

  // ---------------------------------------------------------------------
  // IP (shared by the single-IP card and the multi-IP accordion)
  // ---------------------------------------------------------------------
  const ipRowsHtml = (d) => `
      ${sectionTitle("Network")}
      ${row("CIDR", d.cidr || (d.range ? null : "N/D"))}
      ${d.range && !d.cidr ? row("Range", d.range) : ""}
      ${row("Network name", d.name)}
      ${d.org ? row("Organization", d.org) : ""}
      ${row("ASN", d.asn, true)}
      ${row("ISP", d.isp)}
      ${connectionRow(d.connection)}
      ${d.ptr ? row("Reverse DNS", d.ptr) : ""}
      ${row("Location", d.geo?.label, true)}
      <div class="ioc-row"><span class="ioc-label">Tor Exit Node</span><span class="ioc-value">${badge(d.isTor, "False", "True")}</span></div>
    `;

  const makeIpActions = (d) => {
    const el = newActionRow();
    const abuseipdbUrl =
      d.abuseipdbUrl || `https://www.abuseipdb.com/check/${encodeURIComponent(d.ip)}`;
    const spurUrl = d.spurUrl || `https://spur.us/context/${encodeURIComponent(d.ip)}`;
    el.appendChild(makeLinkButton("AbuseIPDB ↗", abuseipdbUrl));
    el.appendChild(makeLinkButton("Spur ↗", spurUrl));
    el.appendChild(makeCopyButton("Copy defanged", defangIp(d.ip)));
    return el;
  };

  if (data.kind === "ip") {
    box.innerHTML = `
      <div class="ioc-head">
        <div class="ioc-eyebrow"><span>IP address</span>${cachedTag}</div>
        <div class="${titleClass(data.ip, 20)}">${esc(data.ip)}</div>
      </div>
      ${ipRowsHtml(data)}
    `;
    box.appendChild(makeIpActions(data));
    finish();
    return;
  }

  // ---------------------------------------------------------------------
  // MULTIPLE IPs: one collapsible entry per IP
  // ---------------------------------------------------------------------
  if (data.kind === "ips") {
    const items = data.items || [];

    // Keeps the card inside the viewport after an entry is expanded
    const clampBox = () => {
      const MARGIN = 12;
      const vh = document.documentElement.clientHeight;
      const rect = box.getBoundingClientRect();
      if (rect.bottom > vh - MARGIN) {
        box.style.top = Math.max(MARGIN, vh - MARGIN - rect.height) + "px";
      }
    };

    const header = document.createElement("div");
    header.className = "ioc-head";
    header.innerHTML = `
      <div class="ioc-eyebrow"><span>Selection</span></div>
      <div class="ioc-title">${items.length} IPs analyzed</div>
    `;
    box.appendChild(header);

    const list = document.createElement("div");
    list.className = "ioc-acc-list";

    items.forEach((d, i) => {
      const entry = document.createElement("div");
      entry.className = "ioc-acc";

      const head = document.createElement("div");
      head.className = "ioc-acc-head";

      const meta = [d.geo?.countryCode, d.asn, d.isp].filter(Boolean).join(" · ");
      const torTag = d.isTor === true ? `<span class="ioc-tag warn">Tor</span>` : "";
      const cacheTag = d.cached ? `<span class="ioc-tag">cache</span>` : "";
      head.innerHTML = `
        <svg class="ioc-acc-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.75"/></svg>
        <span class="ioc-acc-ip">${esc(d.ip)}</span>
        ${cacheTag}
        <span class="ioc-acc-meta" title="${esc(meta)}">${esc(meta)}</span>
        ${torTag}
      `;

      const body = document.createElement("div");
      body.className = "ioc-acc-body";
      body.innerHTML = ipRowsHtml(d);
      body.appendChild(makeIpActions(d));

      const setOpen = (open) => entry.classList.toggle("is-open", open);
      setOpen(i === 0);
      head.onclick = () => {
        setOpen(!entry.classList.contains("is-open"));
        clampBox();
      };

      entry.appendChild(head);
      entry.appendChild(body);
      list.appendChild(entry);
    });
    box.appendChild(list);

    const footer = newActionRow();
    footer.appendChild(
      makeCopyButton("Copy all defanged", items.map((d) => defangIp(d.ip)).join("\n"))
    );
    box.appendChild(footer);

    if (data.total && data.total > items.length) {
      const note = document.createElement("div");
      note.className = "ioc-warning";
      note.textContent = `Showing the first ${items.length} of ${data.total} IPs found in the selection.`;
      box.appendChild(note);
    }

    finish();
    return;
  }

  // ---------------------------------------------------------------------
  // URL / DOMAIN
  // ---------------------------------------------------------------------
  if (data.kind === "url") {
    const torBadge = badge(data.isTor, "False", "True");

    box.innerHTML = `
      <div class="ioc-head">
        <div class="ioc-eyebrow"><span>URL / Domain</span>${cachedTag}</div>
        <div class="${titleClass(data.domain, 22)}">${esc(data.domain)}</div>
        <div class="ioc-sub">${esc(data.url)}</div>
      </div>

      ${sectionTitle("WHOIS")}
      ${row("Registrar", data.rdap?.registrar, true)}
      ${row("Registered", data.rdap?.registration ? new Date(data.rdap.registration).toLocaleDateString() : null)}
      ${row("Expires", data.rdap?.expiration ? new Date(data.rdap.expiration).toLocaleDateString() : null)}

      ${sectionTitle("Infrastructure")}
      ${row("Resolved IP", data.ips && data.ips.length ? data.ips.join(", ") : null, true)}
      ${row("Location", data.geo?.label)}
      ${data.geo?.org ? row("Organization", data.geo.org) : ""}
      ${row("ISP", data.isp)}
      ${connectionRow(data.connection)}
      ${data.ptr ? row("Reverse DNS", data.ptr) : ""}
      <div class="ioc-row"><span class="ioc-label">Tor Exit Node</span><span class="ioc-value">${torBadge}</span></div>
    `;

    actionRow.appendChild(makeLinkButton("VirusTotal ↗", virustotalUrl));
    actionRow.appendChild(makeLinkButton("WHOIS ↗", whoisUrl));
    actionRow.appendChild(makeCopyButton("Defanged URL", defangUrl(data.url)));
    actionRow.appendChild(makeCopyButton("Defanged domain", defangUrl(data.domain)));
  }

  box.appendChild(actionRow);
  finish();
}
