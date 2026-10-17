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

  const STYLE_ID = "__ioc_recon_style__";
  let styleEl = document.getElementById(STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  const c = theme.color;
  const r = theme.radius;
  styleEl.textContent = `
    @keyframes iocFadeIn { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform: translateY(0); } }
    #${EXISTING_ID} * { box-sizing: border-box; }
    #${EXISTING_ID} .ioc-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 0; font-size: 12.5px;
    }
    #${EXISTING_ID} .ioc-row + .ioc-row { border-top: 1px solid ${c.border}; }
    #${EXISTING_ID} .ioc-label { color: ${c.muted}; font-weight: 500; }
    #${EXISTING_ID} .ioc-value { color: ${c.text}; font-weight: 600; text-align: right; max-width: 60%; word-break: break-word; }
    #${EXISTING_ID} .ioc-section-title {
      font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em;
      color: ${c.muted}; font-weight: 700; margin: 14px 0 4px 0;
    }
    #${EXISTING_ID} .ioc-section-title:first-of-type { margin-top: 2px; }
    #${EXISTING_ID} .ioc-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: ${r.pill}; font-size: 11.5px; font-weight: 700;
    }
    #${EXISTING_ID} .ioc-badge.ok { background: ${c.okBg}; color: ${c.ok}; }
    #${EXISTING_ID} .ioc-badge.bad { background: ${c.badBg}; color: ${c.bad}; }
    #${EXISTING_ID} .ioc-badge.na { background: ${c.naBg}; color: ${c.na}; }
    #${EXISTING_ID} .ioc-copy-btn, #${EXISTING_ID} .ioc-link-btn {
      all: unset; cursor: pointer; background: ${c.accent}; color: #fdecd8;
      padding: 7px 12px; border-radius: ${r.button}; font-size: 11.5px; font-weight: 600;
      transition: background 0.15s ease, transform 0.1s ease;
    }
    #${EXISTING_ID} .ioc-copy-btn:hover, #${EXISTING_ID} .ioc-link-btn:hover { background: ${c.accentHover}; }
    #${EXISTING_ID} .ioc-copy-btn:active, #${EXISTING_ID} .ioc-link-btn:active { transform: scale(0.96); }
    #${EXISTING_ID} .ioc-link-btn.abuseipdb { background: ${c.accent}; color: #fdecd8; }
    #${EXISTING_ID} .ioc-link-btn.abuseipdb:hover { background: ${c.accentHover}; }
    #${EXISTING_ID} .ioc-link-btn.virustotal { background: ${c.virustotal}; color: #ffffff; }
    #${EXISTING_ID} .ioc-link-btn.virustotal:hover { background: ${c.virustotalHover}; }
    #${EXISTING_ID} .ioc-link-btn.whois { background: ${c.whois}; color: #ffffff; }
    #${EXISTING_ID} .ioc-link-btn.whois:hover { background: ${c.whoisHover}; }
    #${EXISTING_ID} .ioc-link-btn.spur { background: ${c.spur}; color: #ffffff; }
    #${EXISTING_ID} .ioc-link-btn.spur:hover { background: ${c.spurHover}; }
    #${EXISTING_ID} .ioc-close-btn {
      position: absolute; top: 10px; right: 12px; cursor: pointer;
      width: 22px; height: 22px; border-radius: ${r.close}; display: flex;
      align-items: center; justify-content: center; color: ${c.muted}; font-size: 13px;
      transition: background 0.15s ease, color 0.15s ease;
    }
    #${EXISTING_ID} .ioc-close-btn:hover { background: ${c.rowHover}; color: ${c.text}; }
    #${EXISTING_ID} .ioc-acc { border: 1px solid ${c.border}; border-radius: ${r.row}; margin-bottom: 6px; overflow: hidden; }
    #${EXISTING_ID} .ioc-acc-head {
      display: flex; align-items: center; gap: 8px; padding: 8px 10px;
      cursor: pointer; font-size: 12.5px; user-select: none;
    }
    #${EXISTING_ID} .ioc-acc-head:hover { background: ${c.rowHover}; }
    #${EXISTING_ID} .ioc-acc-caret { color: ${c.muted}; font-size: 10px; width: 10px; flex: none; }
    #${EXISTING_ID} .ioc-acc-ip { font-weight: 700; flex: none; }
    #${EXISTING_ID} .ioc-acc-meta {
      color: ${c.muted}; font-size: 11px; flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #${EXISTING_ID} .ioc-acc-body { padding: 0 10px 10px 10px; border-top: 1px solid ${c.border}; }
    #${EXISTING_ID} ::-webkit-scrollbar { width: 6px; }
    #${EXISTING_ID} ::-webkit-scrollbar-thumb { background: ${c.accent}; border-radius: ${r.pill}; }
  `;

  const box = document.createElement("div");
  box.id = EXISTING_ID;
  Object.assign(box.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: 2147483647,
    width: "360px",
    background: `linear-gradient(180deg, ${c.bgTop} 0%, ${c.bgBottom} 100%)`,
    color: c.text,
    fontFamily: theme.font,
    fontSize: "13px",
    borderRadius: r.popup,
    boxShadow: theme.shadow,
    padding: "18px 18px 16px 18px",
    lineHeight: "1.4",
    maxHeight: "80vh",
    overflowY: "auto",
    animation: "iocFadeIn 0.18s ease-out",
    visibility: "hidden" // shown only after it has been positioned
  });

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
    }
    box.style.visibility = "visible";
  };

  const closeBtn = document.createElement("div");
  closeBtn.textContent = "✕";
  closeBtn.className = "ioc-close-btn";
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

  if (data.error) {
    box.innerHTML = `<div style="font-weight:700; margin-bottom:4px;">⚠️ Error</div><div style="color:${c.muted};">${data.error}</div>`;
    box.appendChild(closeBtn);
    document.body.appendChild(box);
    positionBox();
    return;
  }

  const badge = (state, okLabel, badLabel, naLabel = "N/D") => {
    if (state === null || state === undefined) return `<span class="ioc-badge na">${naLabel}</span>`;
    return state
      ? `<span class="ioc-badge bad">🟠 ${badLabel}</span>`
      : `<span class="ioc-badge ok">🟢 ${okLabel}</span>`;
  };

  const esc = (v) =>
    String(v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  const row = (label, value) =>
    `<div class="ioc-row"><span class="ioc-label">${label}</span><span class="ioc-value">${value == null ? "N/D" : esc(value)}</span></div>`;

  const connectionRow = (conn) =>
    conn
      ? `<div class="ioc-row"><span class="ioc-label">Connection type</span><span class="ioc-value" title="${esc(conn.basis)}">${esc(conn.type)} <span style="color:${c.muted}; font-size:11px;">(${esc(conn.confidence)})</span></span></div>`
      : row("Connection type", null);

  const sectionTitle = (label) => `<div class="ioc-section-title">${label}</div>`;

  if (data.loading) {
    box.innerHTML = `<div style="font-weight:700; font-size:14px;">⏳&nbsp;${esc(data.loading)}</div>`;
    box.appendChild(closeBtn);
    document.body.appendChild(box);
    positionBox();
    return;
  }

  const newActionRow = () => {
    const el = document.createElement("div");
    Object.assign(el.style, {
      marginTop: "14px",
      paddingTop: "12px",
      borderTop: `1px solid ${c.border}`,
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flexWrap: "wrap"
    });
    return el;
  };
  const actionRow = newActionRow();

  const makeCopyButton = (label, textToCopy) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = "ioc-copy-btn";
    btn.onclick = () => {
      copyText(textToCopy);
      const original = btn.textContent;
      btn.textContent = "✓ Copied";
      setTimeout(() => (btn.textContent = original), 1200);
    };
    return btn;
  };

  const makeLinkButton = (label, targetUrl, extraClass) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = `ioc-link-btn ${extraClass}`;
    btn.type = "button";
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

  const cachedTag = data.cached
    ? `<span style="font-weight:500; font-size:10.5px; color:${c.muted}; background:${c.naBg}; padding:2px 7px; border-radius:${r.pill}; margin-left:6px;">cache</span>`
    : "";

  // ---------------------------------------------------------------------
  // IP (shared by the single-IP card and the multi-IP accordion)
  // ---------------------------------------------------------------------
  const ipRowsHtml = (d) => `
      ${sectionTitle("Network")}
      ${row("CIDR", d.cidr || (d.range ? null : "N/D"))}
      ${d.range && !d.cidr ? row("Range", d.range) : ""}
      ${row("Network name", d.name)}
      ${d.org ? row("Organization", d.org) : ""}
      ${row("ASN", d.asn)}
      ${row("ISP", d.isp)}
      ${connectionRow(d.connection)}
      ${d.ptr ? row("Reverse DNS", d.ptr) : ""}
      ${row("Location", d.geo?.label)}
      <div class="ioc-row"><span class="ioc-label">Tor Exit Node</span>${badge(d.isTor, "False", "True")}</div>
    `;

  const makeIpActions = (d) => {
    const el = newActionRow();
    const abuseipdbUrl =
      d.abuseipdbUrl || `https://www.abuseipdb.com/check/${encodeURIComponent(d.ip)}`;
    const spurUrl = d.spurUrl || `https://spur.us/context/${encodeURIComponent(d.ip)}`;
    el.appendChild(makeLinkButton("AbuseIPDB ↗", abuseipdbUrl, "abuseipdb"));
    el.appendChild(makeLinkButton("Spur ↗", spurUrl, "spur"));
    el.appendChild(makeCopyButton("Copy defanged", defangIp(d.ip)));
    return el;
  };

  if (data.kind === "ip") {
    box.innerHTML = `
      <div style="font-weight:700; font-size:15px; margin-bottom:2px; display:flex; align-items:center;">
        🔎&nbsp;${esc(data.ip)}${cachedTag}
      </div>
      ${ipRowsHtml(data)}
    `;
    box.appendChild(makeIpActions(data));
    box.appendChild(closeBtn);
    document.body.appendChild(box);
    positionBox();
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
    header.style.cssText = "font-weight:700; font-size:15px; margin-bottom:10px; padding-right:24px;";
    header.textContent = `🔎 ${items.length} IPs analyzed`;
    box.appendChild(header);

    items.forEach((d, i) => {
      const entry = document.createElement("div");
      entry.className = "ioc-acc";

      const head = document.createElement("div");
      head.className = "ioc-acc-head";

      const meta = [d.geo?.countryCode, d.asn, d.isp].filter(Boolean).join(" · ");
      const torTag = d.isTor === true ? `<span class="ioc-badge bad">🟠 Tor</span>` : "";
      const cacheTag = d.cached
        ? `<span style="font-size:10px; color:${c.muted}; background:${c.naBg}; padding:1px 6px; border-radius:${r.pill};">cache</span>`
        : "";
      head.innerHTML = `
        <span class="ioc-acc-caret">▸</span>
        <span class="ioc-acc-ip">${esc(d.ip)}</span>
        ${cacheTag}
        <span class="ioc-acc-meta" title="${esc(meta)}">${esc(meta)}</span>
        ${torTag}
      `;

      const body = document.createElement("div");
      body.className = "ioc-acc-body";
      body.innerHTML = ipRowsHtml(d);
      body.appendChild(makeIpActions(d));

      const caret = head.querySelector(".ioc-acc-caret");
      const setOpen = (open) => {
        body.style.display = open ? "block" : "none";
        caret.textContent = open ? "▾" : "▸";
      };
      setOpen(i === 0);
      head.onclick = () => {
        setOpen(body.style.display === "none");
        clampBox();
      };

      entry.appendChild(head);
      entry.appendChild(body);
      box.appendChild(entry);
    });

    const footer = newActionRow();
    footer.style.marginTop = "8px";
    footer.appendChild(
      makeCopyButton("Copy all defanged", items.map((d) => defangIp(d.ip)).join("\n"))
    );
    box.appendChild(footer);

    if (data.total && data.total > items.length) {
      const note = document.createElement("div");
      note.style.cssText = `margin-top:8px; font-size:11px; color:${c.muted};`;
      note.textContent = `Showing the first ${items.length} of ${data.total} IPs found in the selection.`;
      box.appendChild(note);
    }

    box.appendChild(closeBtn);
    document.body.appendChild(box);
    positionBox();
    return;
  }

  // ---------------------------------------------------------------------
  // URL / DOMAIN
  // ---------------------------------------------------------------------
  if (data.kind === "url") {
    const torBadge = badge(data.isTor, "False", "True");

    box.innerHTML = `
      <div style="font-weight:700; font-size:15px; margin-bottom:2px; word-break:break-all; display:flex; align-items:center; flex-wrap:wrap;">
        🔎&nbsp;${data.domain}${cachedTag}
      </div>
      <div style="font-size:11px; color:${c.muted}; word-break:break-all; margin-bottom:6px;">${data.url}</div>

      ${sectionTitle("WHOIS")}
      ${row("Registrar", data.rdap?.registrar)}
      ${row("Registered", data.rdap?.registration ? new Date(data.rdap.registration).toLocaleDateString() : null)}
      ${row("Expires", data.rdap?.expiration ? new Date(data.rdap.expiration).toLocaleDateString() : null)}

      ${sectionTitle("Infrastructure")}
      ${row("Resolved IP", data.ips && data.ips.length ? data.ips.join(", ") : null)}
      ${row("Location", data.geo?.label)}
      ${data.geo?.org ? row("Organization", data.geo.org) : ""}
      ${row("ISP", data.isp)}
      ${connectionRow(data.connection)}
      ${data.ptr ? row("Reverse DNS", data.ptr) : ""}
      <div class="ioc-row"><span class="ioc-label">Tor Exit Node</span>${torBadge}</div>
    `;

    actionRow.appendChild(makeLinkButton("VirusTotal ↗", virustotalUrl, "virustotal"));
    actionRow.appendChild(makeLinkButton("WHOIS ↗", whoisUrl, "whois"));
    actionRow.appendChild(makeCopyButton("Defanged URL", defangUrl(data.url)));
    actionRow.appendChild(makeCopyButton("Defanged domain", defangUrl(data.domain)));
  }

  box.appendChild(actionRow);
  box.appendChild(closeBtn);
  document.body.appendChild(box);
  positionBox();
}