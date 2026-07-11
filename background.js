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

  // Caso 2: dominio nudo (con eventuale path), senza schema -> assume https
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

async function lookupBlocklistDe(ip) {
  const url = `https://api.blocklist.de/api.php?ip=${encodeURIComponent(ip)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Blocklist.de HTTP ${res.status}`);
  const text = (await res.text()).trim();

  const attacksMatch = text.match(/attacks:\s*(\d+)/i);
  const reportsMatch = text.match(/reports?:\s*(\d+)/i);

  const attacks = attacksMatch ? Number(attacksMatch[1]) : null;
  const reports = reportsMatch ? Number(reportsMatch[1]) : null;
  const malicious = (attacks && attacks > 0) || (reports && reports > 0);

  return { attacks, reports, malicious };
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
    nameservers,
    status: (data.status || []).join(", ") || null
  };
}

async function resolveDns(domain) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DNS HTTP ${res.status}`);
  const data = await res.json();
  return (data.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
}

async function lookupUrlscan(domain) {
  const url = `https://urlscan.io/api/v1/search/?q=domain:${encodeURIComponent(domain)}&size=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`urlscan.io HTTP ${res.status}`);
  const data = await res.json();
  const hit = data.results && data.results[0];
  if (!hit) return null;

  return {
    scanDate: hit.task?.time || null,
    reportUrl: hit.result || null,
    malicious: hit.verdicts?.overall?.malicious ?? null,
    score: hit.verdicts?.overall?.score ?? null
  };
}

async function gatherIpIntel(ip) {
  const result = { kind: "ip", ip };

  const [rdap, blocklist, tor, geo] = await Promise.allSettled([
    lookupRdapIp(ip),
    lookupBlocklistDe(ip),
    isTorExitNode(ip),
    lookupGeo(ip)
  ]);

  if (rdap.status === "fulfilled") Object.assign(result, rdap.value);
  if (blocklist.status === "fulfilled") result.blocklist = blocklist.value;
  result.isTor = tor.status === "fulfilled" ? tor.value : null;
  if (geo.status === "fulfilled") result.geo = geo.value;

  return result;
}

async function gatherUrlIntel(url, domain) {
  const result = { kind: "url", url, domain };

  const [rdap, ipsResult, urlscan] = await Promise.allSettled([
    lookupRdapDomain(domain),
    resolveDns(domain),
    lookupUrlscan(domain)
  ]);

  if (rdap.status === "fulfilled") result.rdap = rdap.value;
  result.ips = ipsResult.status === "fulfilled" ? ipsResult.value : [];
  result.urlscan = urlscan.status === "fulfilled" ? urlscan.value : null;

  if (result.ips.length > 0) {
    const firstIp = result.ips[0];
    const [blocklist, geo, tor] = await Promise.allSettled([
      lookupBlocklistDe(firstIp),
      lookupGeo(firstIp),
      isTorExitNode(firstIp)
    ]);
    if (blocklist.status === "fulfilled") result.blocklist = blocklist.value;
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

  // --- Helper di defanging locali (niente dipendenze esterne nel contesto pagina) ---
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

  // --- Box base ---
  const box = document.createElement("div");
  box.id = EXISTING_ID;
  Object.assign(box.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: 2147483647,
    width: "340px",
    background: "#1e293b",
    color: "#f1f5f9",
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
    fontSize: "13px",
    borderRadius: "10px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    padding: "14px 16px",
    lineHeight: "1.5",
    maxHeight: "80vh",
    overflowY: "auto"
  });

  const closeBtn = document.createElement("div");
  closeBtn.textContent = "✕";
  Object.assign(closeBtn.style, {
    position: "absolute",
    top: "8px",
    right: "10px",
    cursor: "pointer",
    opacity: "0.7",
    fontSize: "14px"
  });
  closeBtn.onclick = () => {
    document.removeEventListener("keydown", escHandler);
    box.remove();
  };

  // Chiusura solo con X o ESC: nessuna chiusura automatica a tempo
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
    box.innerHTML = `<b>Error</b><br>${data.error}`;
    box.appendChild(closeBtn);
    document.body.appendChild(box);
    return;
  }

  const torIcon = data.isTor === null ? "N/D" : data.isTor ? "🔴 True" : "🟢 False";

  const copyRow = document.createElement("div");
  Object.assign(copyRow.style, {
    marginTop: "10px",
    paddingTop: "8px",
    borderTop: "1px solid #334155",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap"
  });

  const makeCopyButton = (label, textToCopy) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    Object.assign(btn.style, {
      all: "unset",
      cursor: "pointer",
      background: "#334155",
      color: "#f1f5f9",
      padding: "6px 10px",
      borderRadius: "6px",
      fontSize: "12px",
      fontWeight: "600"
    });
    btn.onclick = () => {
      copyText(textToCopy);
      const original = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = original), 1200);
    };
    return btn;
  };

  // ---------------------------------------------------------------------
  // IP
  // ---------------------------------------------------------------------
  if (data.kind === "ip") {
    box.innerHTML = `
      <div style="font-weight:600; font-size:14px; margin-bottom:6px;">🔎 ${data.ip} ${
        data.cached ? '<span style="font-weight:400; font-size:11px; opacity:0.7;">(cache)</span>' : ""
      }</div>
      <div><b>CIDR:</b> ${data.cidr || "N/D"}</div>
      ${data.range && !data.cidr ? `<div><b>Range:</b> ${data.range}</div>` : ""}
      <div><b>Network:</b> ${data.name || "N/D"}</div>
      ${data.org ? `<div><b>Organization:</b> ${data.org}</div>` : ""}
      <div><b>Location:</b> ${data.geo?.label || "N/D"}</div>
      <hr style="border-color:#334155; margin:8px 0;">
      <div><b>Reputation:</b> ${
        data.blocklist
          ? `attacks=${data.blocklist.attacks ?? 0}, reports=${data.blocklist.reports ?? 0}`
          : "N/D"
      }</div>
      <div><b>Tor Exit Node:</b> ${torIcon}</div>
    `;

    copyRow.appendChild(makeCopyButton("Copy defanged IP", defangIp(data.ip)));
  }

  if (data.kind === "url") {
    const urlscanVerdict =
      data.urlscan === null
        ? "No previous scans found"
        : data.urlscan.malicious === true
        ? `🔴 Malicious (score ${data.urlscan.score ?? "N/D"})`
        : data.urlscan.malicious === false
        ? `🟢 Clean (score ${data.urlscan.score ?? "N/D"})`
        : "N/D";

    box.innerHTML = `
      <div style="font-weight:600; font-size:14px; margin-bottom:6px; word-break:break-all;">
        🔎 ${data.domain} ${data.cached ? '<span style="font-weight:400; font-size:11px; opacity:0.7;">(cache)</span>' : ""}
      </div>
      <div style="font-size:11px; opacity:0.75; word-break:break-all; margin-bottom:8px;">${data.url}</div>

      <div><b>Registrar:</b> ${data.rdap?.registrar || "N/D"}</div>
      <div><b>Registration:</b> ${data.rdap?.registration ? new Date(data.rdap.registration).toLocaleDateString() : "N/D"}</div>
      <div><b>Expiration:</b> ${data.rdap?.expiration ? new Date(data.rdap.expiration).toLocaleDateString() : "N/D"}</div>
      ${data.rdap?.status ? `<div><b>Status:</b> ${data.rdap.status}</div>` : ""}

      <hr style="border-color:#334155; margin:8px 0;">

      <div><b>Resolved IP:</b> ${data.ips && data.ips.length ? data.ips.join(", ") : "N/D"}</div>
      <div><b>Location:</b> ${data.geo?.label || "N/D"}</div>
      ${data.geo?.org ? `<div><b>Organization:</b> ${data.geo.org}</div>` : ""}
      <div><b>Tor Exit Node:</b> ${torIcon}</div>
      <div><b>IP reputation:</b> ${
        data.blocklist ? `attacks=${data.blocklist.attacks ?? 0}, reports=${data.blocklist.reports ?? 0}` : "N/D"
      }</div>

      <hr style="border-color:#334155; margin:8px 0;">
    `;

    copyRow.appendChild(makeCopyButton("Copy defanged URL", defangUrl(data.url)));
    copyRow.appendChild(makeCopyButton("Copy defanged domain", defangUrl(data.domain)));
  }

  box.appendChild(copyRow);
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