// Threat intel lookups: AbuseIPDB (reputation + ISP/usage/country) and
// Proxycheck.io (proxy / VPN flags + city). Google DNS-over-HTTPS is only used to
// resolve a domain to the IP that is then analyzed.

const CACHE_TTL_RESULT_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;
const ABUSEIPDB_MAX_AGE_DAYS = 90;

function toBase64Url(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function virusTotalUrlLink(url) {
  return `https://www.virustotal.com/gui/url/${toBase64Url(url)}`;
}

function whoisUrl(domain) {
  return `https://whois.domaintools.com/${encodeURIComponent(domain)}`;
}

async function loadApiKeys() {
  const [abuseipdb, proxycheck] = await Promise.all([
    SecureStore.getSecret("abuseipdb"),
    SecureStore.getSecret("proxycheck")
  ]);
  return { abuseipdb, proxycheck };
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {}
  return { res, body };
}

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

function countryName(code) {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || null;
  } catch (_) {
    return null;
  }
}

// --- AbuseIPDB: https://docs.abuseipdb.com/#check-endpoint ---
async function lookupAbuseIpDb(ip, key) {
  const url =
    `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}` +
    `&maxAgeInDays=${ABUSEIPDB_MAX_AGE_DAYS}`;
  const { res, body } = await fetchJson(url, {
    headers: { Key: key, Accept: "application/json" }
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("AbuseIPDB rejected the API key. Check it in Settings.");
    }
    if (res.status === 429) {
      throw new Error("AbuseIPDB daily request limit reached.");
    }
    const detail = body?.errors?.[0]?.detail;
    throw new Error(`AbuseIPDB: ${detail || `HTTP ${res.status}`}`);
  }

  const d = body?.data;
  if (!d) throw new Error("AbuseIPDB: unexpected response");

  return {
    score: Number.isFinite(d.abuseConfidenceScore) ? d.abuseConfidenceScore : null,
    totalReports: Number.isFinite(d.totalReports) ? d.totalReports : null,
    isp: str(d.isp),
    usageType: str(d.usageType),
    countryCode: str(d.countryCode),
    isTor: d.isTor === true
  };
}

// --- Proxycheck.io v3: https://proxycheck.io/api/ ---
// Works without a key (100 queries/day); a free key raises it to 1,000/day.
async function lookupProxycheck(ip, key) {
  if (!/^[0-9a-fA-F:.]+$/.test(ip)) throw new Error("Proxycheck: invalid IP");
  const url = `https://proxycheck.io/v3/${ip}${key ? `?key=${encodeURIComponent(key)}` : ""}`;
  const { res, body } = await fetchJson(url);

  if (!body || typeof body !== "object") throw new Error(`Proxycheck: HTTP ${res.status}`);
  if (body.status === "denied" || body.status === "error" || !res.ok) {
    throw new Error(`Proxycheck: ${str(body.message) || `HTTP ${res.status}`}`);
  }

  const entry =
    body[ip] ||
    body[ip.toLowerCase()] ||
    Object.values(body).find((v) => v && typeof v === "object" && (v.detections || v.location));
  if (!entry) throw new Error("Proxycheck: no result for this IP");

  const det = entry.detections || {};
  const loc = entry.location || {};
  const op = entry.operator && typeof entry.operator === "object" ? entry.operator : null;

  const opName = str(op?.name);
  const protocols = Array.isArray(op?.protocols)
    ? op.protocols.filter((p) => typeof p === "string").join(", ") || null
    : null;

  const flag = (value, detail) => ({
    state: typeof value === "boolean" ? value : null,
    detail: value === true ? detail : null
  });

  return {
    // v3 does not expose a dedicated proxy/VPN "type": the operator (e.g. a VPN
    // provider) and its protocols are the closest thing, shown when available.
    // (when the IP is also a VPN, the operator/protocols describe the VPN, not the proxy)
    proxy: flag(det.proxy, det.vpn === true ? null : protocols || opName),
    vpn: flag(det.vpn, opName && protocols ? `${opName} · ${protocols}` : opName || protocols),
    isTor: det.tor === true,
    risk: Number.isFinite(det.risk) ? det.risk : null,
    city: str(loc.city_name) || str(loc.city),
    country: str(loc.country_name) || str(loc.country),
    countryCode: str(loc.country_code) || str(loc.isocode)
  };
}

// --- Domain -> IP (Google DNS-over-HTTPS) ---
async function resolveDns(domain) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`;
  const { res, body } = await fetchJson(url);
  if (!res.ok) throw new Error(`DNS HTTP ${res.status}`);
  return (body?.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
}

// Merges AbuseIPDB (everything except proxy/VPN) and Proxycheck (proxy/VPN, and city,
// which AbuseIPDB does not provide) into the fields shown by the card.
async function gatherIpIntel(ip, keys) {
  const [abuse, pc] = await Promise.allSettled([
    lookupAbuseIpDb(ip, keys.abuseipdb),
    lookupProxycheck(ip, keys.proxycheck)
  ]);

  const warnings = [];
  const a = abuse.status === "fulfilled" ? abuse.value : null;
  const p = pc.status === "fulfilled" ? pc.value : null;
  if (!a) warnings.push(abuse.reason?.message || "AbuseIPDB lookup failed");
  if (!p) warnings.push(pc.reason?.message || "Proxycheck lookup failed");

  const countryCode = a?.countryCode || p?.countryCode || null;
  const country = countryName(a?.countryCode) || p?.country || null;

  return {
    kind: "ip",
    ip,
    score: a?.score ?? null,
    totalReports: a?.totalReports ?? null,
    isp: a?.isp || null,
    usageType: a?.usageType || null,
    countryCode,
    country: country ? (countryCode ? `${country} (${countryCode})` : country) : countryCode,
    city: p?.city || null,
    proxy: p?.proxy || { state: null, detail: null },
    vpn: p?.vpn || { state: null, detail: null },
    risk: p?.risk ?? null,
    isTor: a?.isTor === true || p?.isTor === true,
    warnings,
    incomplete: !a || !p
  };
}

async function gatherUrlIntel(url, domain, keys) {
  const result = { kind: "url", url, domain };
  result.virustotalUrl = virusTotalUrlLink(url);
  result.whoisUrl = whoisUrl(domain);

  let ips = [];
  let dnsError = null;
  try {
    ips = await resolveDns(domain);
  } catch (e) {
    dnsError = e.message;
  }
  result.ips = ips;

  if (ips.length === 0) {
    result.warnings = [dnsError ? `DNS lookup failed: ${dnsError}` : "The domain does not resolve to an IPv4 address."];
    result.incomplete = true;
    return result;
  }

  // The first resolved IP is the one analyzed (the others are listed)
  const { kind, ip, ...intel } = await gatherIpIntel(ips[0], keys);
  return { ...result, ...intel, resolvedIp: ip };
}
