const MENU_ID = "ip-subnet-lookup";

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_RE = /^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/;

function isValidIPv4(ip) {
  const m = ip.match(IPV4_RE);
  if (!m) return false;
  return m.slice(1).every((n) => Number(n) >= 0 && Number(n) <= 255);
}

function isValidIP(ip) {
  ip = ip.trim();
  if (isValidIPv4(ip)) return true;
  if (IPV6_RE.test(ip) && ip.includes(":")) return true;
  return false;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'IP recon of "%s"',
    contexts: ["selection"]
  });
});

// --- Generic TTL-based cache using chrome.storage.local ---
const CACHE_TTL_RESULT_MS = 30 * 60 * 1000; // 30 minutes for per-IP results
const CACHE_TTL_TORLIST_MS = 60 * 60 * 1000; // 1 hour for the Tor exit list

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

// --- RDAP: owner + CIDR ---
async function lookupRdap(ip) {
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

// --- Blocklist.de: number of abuse reports ---
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

  return { attacks, reports, malicious, raw: text };
}

// --- Tor Exit List: true/false (list cached for 1 hour) ---
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

// --- IP geolocation: city, region, country ---
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

// --- Inject popup into the page (executed in the tab's context) ---
// NOTA: questa funzione viene eseguita nel contesto della pagina tramite
// chrome.scripting.executeScript, quindi deve essere completamente
// autosufficiente (niente riferimenti a funzioni esterne come defang()).
function renderPopup({ ip, cidr, range, name, org, blocklist, isTor, geo, error, cached }) {
  const EXISTING_ID = "__ip_subnet_lookup_popup__";
  const old = document.getElementById(EXISTING_ID);
  if (old) old.remove();

  // Defanging locale dell'IP per uso sicuro nei report (es. 1.2.3.4 -> 1[.]2[.]3[.]4)
  const defangIp = (value) => (value ? value.replace(/\./g, "[.]") : value);

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

  const box = document.createElement("div");
  box.id = EXISTING_ID;
  Object.assign(box.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: 2147483647,
    width: "320px",
    background: "#1e293b",
    color: "#f1f5f9",
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
    fontSize: "13px",
    borderRadius: "10px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    padding: "14px 16px",
    lineHeight: "1.5"
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
    clearTimeout(box.__autoCloseTimer);
    box.remove();
  };

  if (error) {
    box.innerHTML = `<b>Lookup error${ip}</b><br>${error}`;
    box.appendChild(closeBtn);
    document.body.appendChild(box);
    box.__autoCloseTimer = setTimeout(() => box.remove(), 10000);
    return;
  }

  const malIcon = blocklist?.malicious ? "🔴" : "🟢";
  const torIcon = isTor ? "🔴 True" : "🟢 False";

  box.innerHTML = `
    <div style="font-weight:600; font-size:14px; margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span>🔎 ${ip} ${
        cached ? '<span style="font-weight:400; font-size:11px; opacity:0.7;">(cache)</span>' : ""
      }</span>
    </div>
    <div><b>CIDR:</b> ${cidr || "N/D"}</div>
    ${range && !cidr ? `<div><b>Range:</b> ${range}</div>` : ""}
    <div><b>Network:</b> ${name}</div>
    ${org ? `<div><b>Organization:</b> ${org}</div>` : ""}
    <div><b>Location:</b> ${geo?.label || "N/D"}</div>
    <hr style="border-color:#334155; margin:8px 0;">
    <div><b>Reputation:</b> ${
      blocklist
        ? `attacks=${blocklist.attacks ?? 0}, reports=${blocklist.reports ?? 0}`
        : "N/D"
    }</div>
    <div><b>Tor Exit Node:</b> ${isTor === null ? "N/D" : torIcon}</div>
  `;

  const copyRow = document.createElement("div");
  Object.assign(copyRow.style, {
    marginTop: "10px",
    paddingTop: "8px",
    borderTop: "1px solid #334155",
    display: "flex",
    alignItems: "center",
    gap: "8px"
  });

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy defanged IP";
  Object.assign(copyBtn.style, {
    all: "unset",
    cursor: "pointer",
    background: "#334155",
    color: "#f1f5f9",
    padding: "6px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600"
  });

  const feedback = document.createElement("span");
  feedback.style.fontSize = "11px";
  feedback.style.opacity = "0.8";

  copyBtn.onclick = () => {
    copyText(defangIp(ip));
    const original = copyBtn.textContent;
    copyBtn.textContent = "Copied";
    feedback.textContent = defangIp(ip);
    setTimeout(() => {
      copyBtn.textContent = original;
    }, 1200);
  };

  copyRow.appendChild(copyBtn);
  copyRow.appendChild(feedback);
  box.appendChild(copyRow);

  box.appendChild(closeBtn);
  document.body.appendChild(box);
  box.__autoCloseTimer = setTimeout(() => box.remove(), 20000);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const selected = (info.selectionText || "").trim();

  if (!isValidIP(selected)) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: renderPopup,
      args: [{ ip: selected, error: "The selected text is not a valid IP." }]
    });
    return;
  }

  const cacheKey = `ip:${selected}`;
  const cachedResult = await cacheGet(cacheKey);

  if (cachedResult) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: renderPopup,
      args: [{ ...cachedResult, cached: true }]
    });
    return;
  }

  const result = { ip: selected };

  const [rdap, blocklist, tor, geo] = await Promise.allSettled([
    lookupRdap(selected),
    lookupBlocklistDe(selected),
    isTorExitNode(selected),
    lookupGeo(selected)
  ]);

  if (rdap.status === "fulfilled") Object.assign(result, rdap.value);
  if (blocklist.status === "fulfilled") result.blocklist = blocklist.value;
  result.isTor = tor.status === "fulfilled" ? tor.value : null;
  if (geo.status === "fulfilled") result.geo = geo.value;

  await cacheSet(cacheKey, result, CACHE_TTL_RESULT_MS);

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: renderPopup,
    args: [result]
  });
});