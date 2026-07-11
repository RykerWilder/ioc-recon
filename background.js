const MENU_ID = "ioc-recon";


const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_RE = /^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/;


function isValidIPv4(ip) {
  const m = ip.match(IPV4_RE);
  if (!m) return false;
  return m.slice(1).every((n) => Number(n) >= 0 && Number(n) <= 255);
}


function isValidIP(value) {
  const ip = value.trim();
  if (isValidIPv4(ip)) return true;
  if (IPV6_RE.test(ip) && ip.includes(":")) return true;
  return false;
}


function refangSelection(raw) {
  let text = raw.trim();
  text = text
    .replace(/\[\.\]|\(\.\)|\{\.\}/g, ".")
    .replace(/\[at\]|\(at\)|\{at\}/gi, "@")
    .replace(/hxxp/gi, (m) => (m === m.toUpperCase() ? "HTTP" : "http"))
    .replace(/fxxp/gi, (m) => (m === m.toUpperCase() ? "FTP" : "ftp"));
  return text;
}


function extractUrlOrDomain(rawSelection) {
  const text = refangSelection(rawSelection);


  const urlMatch = text.match(/^(https?|ftp):\/\/\S+$/i);
  if (urlMatch) {
    try {
      const u = new URL(text);
      return { url: text, domain: u.hostname.replace(/^www\./i, "") };
    } catch (e) {
      return null;
    }
  }



  const domainMatch = text.match(
    /^((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})(\/\S*)?$/
  );
  if (domainMatch) {
    const domain = domainMatch[1].replace(/^www\./i, "");
    try {
      const u = new URL(`https://${text}`);
      return { url: u.toString(), domain };
    } catch (e) {
      return { url: `https://${text}`, domain };
    }
  }


  return null;
}


function classifySelection(rawSelection) {
  const refanged = refangSelection(rawSelection);


  if (isValidIP(refanged)) {
    return { kind: "ip", ip: refanged.trim() };
  }


  const parsed = extractUrlOrDomain(rawSelection);
  if (parsed) {
    return { kind: "url", ...parsed };
  }


  return { kind: "invalid" };
}


chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'IOC recon of "%s"',
    contexts: ["selection"]
  });
});



const CACHE_TTL_RESULT_MS = 30 * 60 * 1000;
const CACHE_TTL_TORLIST_MS = 60 * 60 * 1000;


async function cacheGet(key) {
  const stored = await chrome.storage.local.get(key);
  const entry = stored[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    chrome.storage.local.remove(key);
    return null;
  }
  return entry.value;
}


async function cacheSet(key, value, ttlMs) {
  await chrome.storage.local.set({
    [key]: { value, expiresAt: Date.now() + ttlMs }
  });
}


function abuseIpDbUrl(ip) {
  return `https://www.abuseipdb.com/check/${encodeURIComponent(ip)}`;
}


function toBase64Url(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}


function virusTotalUrlLink(url) {
  const id = toBase64Url(url);
  return `https://www.virustotal.com/gui/url/${id}`;
}


function shodanHostUrl(ip) {
  return `https://www.shodan.io/host/${encodeURIComponent(ip)}`;
}


// --- Tor Exit List ---
async function isTorExitNode(ip) {
  let list = await cacheGet("tor:list");
  if (!list) {
    const url = "https://check.torproject.org/torbulkexitlist";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Tor exit list HTTP ${res.status}`);
    const text = await res.text();
    list = text.split("\n").map((l) => l.trim());
    await cacheSet("tor:list", list, CACHE_TTL_TORLIST_MS);
  }
  return list.includes(ip.trim());
}


// --- Geojs
async function lookupGeo(ip) {
  const url = `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GeoJS HTTP ${res.status}`);
  const data = await res.json();


  const parts = [data.city, data.region, data.country].filter(
    (p) => p && p !== "-" && p !== ""
  );
  const label = parts.length ? parts.join(", ") : "N/D";


  return {
    label,
    countryCode: data.country_code || null,
    lat: data.latitude || null,
    lon: data.longitude || null,
    org: data.organization_name || data.organization || null
  };
}


// --- ASN / AS name ---
async function lookupAsn(ip) {
  const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ipinfo HTTP ${res.status}`);
  const data = await res.json();


  // data.org is typically in the form "AS15169 Google LLC"
  const org = data.org || "";
  const match = org.match(/^(AS\d+)\s*(.*)$/i);


  return {
    asn: match ? match[1].toUpperCase() : null,
    asName: match ? match[2] || null : org || null
  };
}


async function lookupRdapIp(ip) {
  const url = `https://rdap.org/ip/${encodeURIComponent(ip)}`;
  const res = await fetch(url, { headers: { Accept: "application/rdap+json" } });
  if (!res.ok) throw new Error(`RDAP HTTP ${res.status}`);
  const data = await res.json();


  let cidr = null;
  if (Array.isArray(data.cidr0_cidrs) && data.cidr0_cidrs.length > 0) {
    const c = data.cidr0_cidrs[0];
    if (c.v4prefix) cidr = `${c.v4prefix}/${c.length}`;
    else if (c.v6prefix) cidr = `${c.v6prefix}/${c.length}`;
  }
  const range =
    data.startAddress && data.endAddress
      ? `${data.startAddress} - ${data.endAddress}`
      : null;


  const name = data.name || data.handle || "N/D";
  const org =
    (data.entities &&
      data.entities
        .map((e) => e.vcardArray?.[1]?.find((f) => f[0] === "fn")?.[3])
        .filter(Boolean)[0]) ||
    null;


  return { cidr, range, name, org };
}


// --- RDAP: WHOIS
async function lookupRdapDomain(domain) {
  const url = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  const res = await fetch(url, { headers: { Accept: "application/rdap+json" } });
  if (!res.ok) throw new Error(`RDAP HTTP ${res.status}`);
  const data = await res.json();


  const registrar =
    (data.entities &&
      data.entities
        .filter((e) => (e.roles || []).includes("registrar"))
        .map((e) => e.vcardArray?.[1]?.find((f) => f[0] === "fn")?.[3])
        .filter(Boolean)[0]) || null;


  const events = data.events || [];
  const registration = events.find((e) => e.eventAction === "registration")?.eventDate || null;
  const expiration = events.find((e) => e.eventAction === "expiration")?.eventDate || null;


  const nameservers = (data.nameservers || []).map((ns) => ns.ldhName).filter(Boolean);


  return {
    registrar,
    registration,
    expiration,
    nameservers
  };
}


async function resolveDns(domain) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DNS HTTP ${res.status}`);
  const data = await res.json();
  return (data.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
}


async function gatherIpIntel(ip) {
  const result = { kind: "ip", ip };
  result.abuseipdbUrl = abuseIpDbUrl(ip);
  result.shodanUrl = shodanHostUrl(ip);


  const [rdap, tor, geo, asn] = await Promise.allSettled([
    lookupRdapIp(ip),
    isTorExitNode(ip),
    lookupGeo(ip),
    lookupAsn(ip)
  ]);


  if (rdap.status === "fulfilled") Object.assign(result, rdap.value);
  result.isTor = tor.status === "fulfilled" ? tor.value : null;
  if (geo.status === "fulfilled") result.geo = geo.value;
  if (asn.status === "fulfilled") Object.assign(result, asn.value);


  return result;
}


async function gatherUrlIntel(url, domain) {
  const result = { kind: "url", url, domain };
  result.virustotalUrl = virusTotalUrlLink(url);


  const [rdap, ipsResult] = await Promise.allSettled([
    lookupRdapDomain(domain),
    resolveDns(domain)
  ]);


  if (rdap.status === "fulfilled") result.rdap = rdap.value;
  result.ips = ipsResult.status === "fulfilled" ? ipsResult.value : [];


  if (result.ips.length > 0) {
    const firstIp = result.ips[0];
    const [geo, tor] = await Promise.allSettled([
      lookupGeo(firstIp),
      isTorExitNode(firstIp)
    ]);
    if (geo.status === "fulfilled") result.geo = geo.value;
    result.isTor = tor.status === "fulfilled" ? tor.value : null;
  } else {
    result.isTor = null;
  }


  return result;
}


// =============================================================================
// POPUP
// =============================================================================
function renderPopup(data) {
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


  // --- FIX: lo style tag viene sempre riscritto, mai "congelato" ---
  const STYLE_ID = "__ioc_recon_style__";
  let styleEl = document.getElementById(STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    @keyframes iocFadeIn { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform: translateY(0); } }
    #__ioc_recon_popup__ * { box-sizing: border-box; }
    #__ioc_recon_popup__ .ioc-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 0; font-size: 12.5px;
    }
    #__ioc_recon_popup__ .ioc-row + .ioc-row { border-top: 1px solid rgba(201,154,91,0.15); }
    #__ioc_recon_popup__ .ioc-label { color: #9fb0c9; font-weight: 500; }
    #__ioc_recon_popup__ .ioc-value { color: #f1f5f9; font-weight: 600; text-align: right; max-width: 60%; word-break: break-word; }
    #__ioc_recon_popup__ .ioc-section-title {
      font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em;
      color: #9fb0c9; font-weight: 700; margin: 14px 0 4px 0;
    }
    #__ioc_recon_popup__ .ioc-section-title:first-of-type { margin-top: 2px; }
    #__ioc_recon_popup__ .ioc-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 700;
    }
    #__ioc_recon_popup__ .ioc-badge.ok { background: rgba(34,197,94,0.15); color: #4ade80; }
    #__ioc_recon_popup__ .ioc-badge.bad { background: rgba(230,126,34,0.18); color: #f0a55e; }
    #__ioc_recon_popup__ .ioc-badge.na { background: rgba(201,154,91,0.15); color: #9fb0c9; }
    #__ioc_recon_popup__ .ioc-copy-btn, #__ioc_recon_popup__ .ioc-link-btn {
      all: unset; cursor: pointer; background: #c9691a; color: #fdecd8;
      padding: 7px 12px; border-radius: 8px; font-size: 11.5px; font-weight: 600;
      transition: background 0.15s ease, transform 0.1s ease;
    }
    #__ioc_recon_popup__ .ioc-copy-btn:hover, #__ioc_recon_popup__ .ioc-link-btn:hover { background: #e07a24; }
    #__ioc_recon_popup__ .ioc-copy-btn:active, #__ioc_recon_popup__ .ioc-link-btn:active { transform: scale(0.96); }
    #__ioc_recon_popup__ .ioc-link-btn.abuseipdb { background: #c9691a; color: #fdecd8; }
    #__ioc_recon_popup__ .ioc-link-btn.abuseipdb:hover { background: #e07a24; }
    #__ioc_recon_popup__ .ioc-link-btn.virustotal { background: #394eff; color: #ffffff; }
    #__ioc_recon_popup__ .ioc-link-btn.virustotal:hover { background: #2d3ecc; }
    #__ioc_recon_popup__ .ioc-link-btn.shodan { background: #cc0000; color: #ffffff; }
    #__ioc_recon_popup__ .ioc-link-btn.shodan:hover { background: #a30000; }
    #__ioc_recon_popup__ .ioc-close-btn {
      position: absolute; top: 10px; right: 12px; cursor: pointer;
      width: 22px; height: 22px; border-radius: 6px; display: flex;
      align-items: center; justify-content: center; color: #9fb0c9; font-size: 13px;
      transition: background 0.15s ease, color 0.15s ease;
    }
    #__ioc_recon_popup__ .ioc-close-btn:hover { background: rgba(201,154,91,0.15); color: #f1f5f9; }
    #__ioc_recon_popup__ ::-webkit-scrollbar { width: 6px; }
    #__ioc_recon_popup__ ::-webkit-scrollbar-thumb { background: #c9691a; border-radius: 999px; }
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
    background: "linear-gradient(180deg, #16233d 0%, #111b30 100%)",
    color: "#f1f5f9",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
    fontSize: "13px",
    borderRadius: "14px",
    boxShadow: "0 20px 40px -8px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,154,91,0.08)",
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


  // X or ESC quit
  const escHandler = (e) => {
    if (e.key === "Escape") {
      document.removeEventListener("keydown", escHandler);
      box.remove();
    }
  };
  document.addEventListener("keydown", escHandler);
  box.__escHandler = escHandler;


  // --- Error case ---
  if (data.error) {
    box.innerHTML = `<div style="font-weight:700; margin-bottom:4px;">⚠️ Error</div><div style="color:#9fb0c9;">${data.error}</div>`;
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
    borderTop: "1px solid rgba(201,154,91,0.15)",
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
    ? '<span style="font-weight:500; font-size:10.5px; color:#9fb0c9; background:rgba(201,154,91,0.12); padding:2px 7px; border-radius:999px; margin-left:6px;">cache</span>'
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
      <div style="font-size:11px; color:#9fb0c9; word-break:break-all; margin-bottom:6px;">${data.url}</div>


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


chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;


  const raw = (info.selectionText || "").trim();
  const classified = classifySelection(raw);


  if (classified.kind === "invalid") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: renderPopup,
      args: [{ error: "The selection is neither a valid IP nor URL/domain" }]
    });
    return;
  }


  const cacheKey =
    classified.kind === "ip" ? `ip:${classified.ip}` : `domain:${classified.domain}`;


  const cachedResult = await cacheGet(cacheKey);
  if (cachedResult) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: renderPopup,
      args: [{ ...cachedResult, cached: true }]
    });
    return;
  }


  const result =
    classified.kind === "ip"
      ? await gatherIpIntel(classified.ip)
      : await gatherUrlIntel(classified.url, classified.domain);


  await cacheSet(cacheKey, result, CACHE_TTL_RESULT_MS);


  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: renderPopup,
    args: [result]
  });
});