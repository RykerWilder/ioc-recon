function renderPopup(data, theme) {
  const EXISTING_ID = "__ioc_recon_popup__";
  const old = document.getElementById(EXISTING_ID);
  if (old) {
    if (old.__escHandler) document.removeEventListener("keydown", old.__escHandler);
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

  // Lo style tag viene sempre riscritto, mai "congelato".
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
    #${EXISTING_ID} .ioc-link-btn.shodan { background: ${c.shodan}; color: #ffffff; }
    #${EXISTING_ID} .ioc-link-btn.shodan:hover { background: ${c.shodanHover}; }
    #${EXISTING_ID} .ioc-close-btn {
      position: absolute; top: 10px; right: 12px; cursor: pointer;
      width: 22px; height: 22px; border-radius: ${r.close}; display: flex;
      align-items: center; justify-content: center; color: ${c.muted}; font-size: 13px;
      transition: background 0.15s ease, color 0.15s ease;
    }
    #${EXISTING_ID} .ioc-close-btn:hover { background: ${c.rowHover}; color: ${c.text}; }
    #${EXISTING_ID} ::-webkit-scrollbar { width: 6px; }
    #${EXISTING_ID} ::-webkit-scrollbar-thumb { background: ${c.accent}; border-radius: ${r.pill}; }
  `;

  // --- base box ---
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
    animation: "iocFadeIn 0.18s ease-out"
  });

  const closeBtn = document.createElement("div");
  closeBtn.textContent = "✕";
  closeBtn.className = "ioc-close-btn";
  closeBtn.onclick = () => {
    document.removeEventListener("keydown", escHandler);
    box.remove();
  };

  // X o ESC per chiudere
  const escHandler = (e) => {
    if (e.key === "Escape") {
      document.removeEventListener("keydown", escHandler);
      box.remove();
    }
  };
  document.addEventListener("keydown", escHandler);
  box.__escHandler = escHandler;

  // --- caso di errore ---
  if (data.error) {
    box.innerHTML = `<div style="font-weight:700; margin-bottom:4px;">⚠️ Error</div><div style="color:${c.muted};">${data.error}</div>`;
    box.appendChild(closeBtn);
    document.body.appendChild(box);
    return;
  }

  const badge = (state, okLabel, badLabel, naLabel = "N/D") => {
    if (state === null || state === undefined) return `<span class="ioc-badge na">${naLabel}</span>`;
    return state
      ? `<span class="ioc-badge bad">🟠 ${badLabel}</span>`
      : `<span class="ioc-badge ok">🟢 ${okLabel}</span>`;
  };

  const row = (label, value) =>
    `<div class="ioc-row"><span class="ioc-label">${label}</span><span class="ioc-value">${value ?? "N/D"}</span></div>`;

  const sectionTitle = (label) => `<div class="ioc-section-title">${label}</div>`;

  const actionRow = document.createElement("div");
  Object.assign(actionRow.style, {
    marginTop: "14px",
    paddingTop: "12px",
    borderTop: `1px solid ${c.border}`,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap"
  });

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

  const abuseipdbUrl =
    data.kind === "ip"
      ? data.abuseipdbUrl || `https://www.abuseipdb.com/check/${encodeURIComponent(data.ip)}`
      : null;
  const shodanUrl =
    data.kind === "ip"
      ? data.shodanUrl || `https://www.shodan.io/host/${encodeURIComponent(data.ip)}`
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
  // IP
  // ---------------------------------------------------------------------
  if (data.kind === "ip") {
    const torBadge = badge(data.isTor, "False", "True");

    box.innerHTML = `
      <div style="font-weight:700; font-size:15px; margin-bottom:2px; display:flex; align-items:center;">
        🔎&nbsp;${data.ip}${cachedTag}
      </div>

      ${sectionTitle("Network")}
      ${row("CIDR", data.cidr || (data.range ? null : "N/D"))}
      ${data.range && !data.cidr ? row("Range", data.range) : ""}
      ${row("Network name", data.name)}
      ${data.org ? row("Organization", data.org) : ""}
      ${row("ASN", data.asn)}
      ${data.asName ? row("AS Name", data.asName) : ""}
      ${row("Location", data.geo?.label)}
      <div class="ioc-row"><span class="ioc-label">Tor Exit Node</span>${torBadge}</div>
    `;

    actionRow.appendChild(makeLinkButton("Open on AbuseIPDB ↗", abuseipdbUrl, "abuseipdb"));
    actionRow.appendChild(makeLinkButton("Open on Shodan ↗", shodanUrl, "shodan"));
    actionRow.appendChild(makeCopyButton("Copy defanged IP", defangIp(data.ip)));
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
      <div class="ioc-row"><span class="ioc-label">Tor Exit Node</span>${torBadge}</div>
    `;

    actionRow.appendChild(makeLinkButton("Open on VirusTotal ↗", virustotalUrl, "virustotal"));
    actionRow.appendChild(makeCopyButton("Copy defanged URL", defangUrl(data.url)));
    actionRow.appendChild(makeCopyButton("Copy defanged domain", defangUrl(data.domain)));
  }

  box.appendChild(actionRow);
  box.appendChild(closeBtn);
  document.body.appendChild(box);
}