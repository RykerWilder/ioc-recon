const CACHE_TTL_RESULT_MS = 30 * 60 * 1000;
const CACHE_TTL_TORLIST_MS = 60 * 60 * 1000;

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

function whoisUrl(domain) {
  return `https://whois.domaintools.com/${encodeURIComponent(domain)}`;
}

function spurContextUrl(ip) {
  return `https://spur.us/context/${encodeURIComponent(ip)}`;
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

// --- GeoJS ---
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

// --- ASN ---
async function lookupAsn(ip) {
  const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ipinfo HTTP ${res.status}`);
  const data = await res.json();

  // data.org è tipicamente nella forma "AS15169 Google LLC"
  const org = data.org || "";
  const match = org.match(/^(AS\d+)/i);

  return {
    asn: match ? match[1].toUpperCase() : null
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

// --- RDAP: WHOIS ---
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

  return { registrar, registration, expiration, nameservers };
}

async function resolveDns(domain) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DNS HTTP ${res.status}`);
  const data = await res.json();
  return (data.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
}


// --- Reverse DNS (PTR) via Google DoH ---
function ptrName(ip) {
  if (ip.includes(":")) {
    const [head, tail] = ip.split("::");
    const h = head ? head.split(":") : [];
    const t = ip.includes("::") && tail ? tail.split(":") : [];
    const fill = ip.includes("::") ? 8 - h.length - t.length : 0;
    const groups = [...h, ...Array(Math.max(fill, 0)).fill("0"), ...t].map((g) =>
      g.padStart(4, "0")
    );
    if (groups.length !== 8) return null;
    return groups.join("").split("").reverse().join(".") + ".ip6.arpa";
  }
  return ip.split(".").reverse().join(".") + ".in-addr.arpa";
}

async function lookupPtr(ip) {
  const name = ptrName(ip.trim());
  if (!name) return null;
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=PTR`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PTR HTTP ${res.status}`);
  const data = await res.json();
  const answer = (data.Answer || []).find((a) => a.type === 12);
  return answer ? answer.data.replace(/\.$/, "").toLowerCase() : null;
}

// --- ipapi.is: ISP / ASN type / mobile-datacenter-proxy flags (no API key) ---
async function lookupIpapiIs(ip) {
  const url = `https://api.ipapi.is/?q=${encodeURIComponent(ip)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ipapi.is HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`ipapi.is: ${data.error}`);

  return {
    asnOrg: data.asn?.org || null,
    companyName: data.company?.name || null,
    asnType: (data.asn?.type || "").toLowerCase(),
    companyType: (data.company?.type || "").toLowerCase(),
    isMobile: data.is_mobile === true,
    isDatacenter: data.is_datacenter === true,
    isProxy: data.is_proxy === true,
    isVpn: data.is_vpn === true,
    isTor: data.is_tor === true
  };
}

// --- ISP: the AS operator is the most reliable proxy for "who is the ISP" ---
function pickIsp(ipapi, rdapOrg) {
  return (
    ipapi?.asnOrg || ipapi?.companyName || rdapOrg || null
  );
}

// --- Connection type (heuristic: no database states "fixed line" with certainty) ---
const PTR_MOBILE_RE = /(mobile|\blte\b|umts|gprs|hsdpa|cellular|gsm|cgnat|(^|[.-])[345]g([.-]|\d|$))/i;
const PTR_HOSTING_RE = /(compute|amazonaws|cloud|vps|server|hosting|datacenter|colo|googleusercontent|azure)/i;
const PTR_FIXED_RE = /(dsl|fttc|fttx|ftth|fiber|fibre|cable|docsis|broadband|dialup|dynamic|dyn-|pool|cust|resident|ppp|static)/i;

function classifyConnection(ipapi, ptr) {
  const mk = (type, confidence, basis) => ({ type, confidence, basis });
  const ptrTxt = ptr || "";

  if (ipapi) {
    const types = [ipapi.asnType, ipapi.companyType];

    if (ipapi.isMobile) return mk("Mobile", "high", "Flagged mobile by ipapi.is");
    if (ipapi.isDatacenter || types.includes("hosting")) {
      return mk("Hosting / Datacenter", "high", "Datacenter/hosting ASN (ipapi.is)");
    }
    if (ipapi.isVpn || ipapi.isProxy || ipapi.isTor) {
      return mk("VPN / Proxy", "high", "Flagged VPN/proxy/Tor by ipapi.is");
    }
    if (PTR_MOBILE_RE.test(ptrTxt)) {
      return mk("Mobile", "medium", `Mobile hint in reverse DNS (${ptrTxt})`);
    }
    if (types.includes("isp")) {
      return PTR_FIXED_RE.test(ptrTxt)
        ? mk("Fixed line", "high", `ISP ASN + fixed-line hint in reverse DNS (${ptrTxt})`)
        : mk("Fixed line", "medium", "ISP ASN, not flagged mobile/hosting/proxy");
    }
    if (types.some((t) => ["business", "education", "government", "banking"].includes(t))) {
      return mk("Business network", "medium", `ASN type: ${types.filter(Boolean).join("/")}`);
    }
  }

  // fallback when ipapi.is is unavailable: reverse DNS only
  if (ptrTxt) {
    if (PTR_HOSTING_RE.test(ptrTxt)) return mk("Hosting / Datacenter", "low", `Reverse DNS: ${ptrTxt}`);
    if (PTR_MOBILE_RE.test(ptrTxt)) return mk("Mobile", "low", `Reverse DNS: ${ptrTxt}`);
    if (PTR_FIXED_RE.test(ptrTxt)) return mk("Fixed line", "low", `Reverse DNS: ${ptrTxt}`);
  }
  return mk("Unknown", "low", "Not enough data");
}

async function gatherIpIntel(ip) {
  const result = { kind: "ip", ip };
  result.abuseipdbUrl = abuseIpDbUrl(ip);
  result.spurUrl = spurContextUrl(ip);

  const [rdap, tor, geo, asn, ipapi, ptr] = await Promise.allSettled([
    lookupRdapIp(ip),
    isTorExitNode(ip),
    lookupGeo(ip),
    lookupAsn(ip),
    lookupIpapiIs(ip),
    lookupPtr(ip)
  ]);

  if (rdap.status === "fulfilled") Object.assign(result, rdap.value);
  result.isTor = tor.status === "fulfilled" ? tor.value : null;
  if (geo.status === "fulfilled") result.geo = geo.value;
  if (asn.status === "fulfilled") Object.assign(result, asn.value);

  const ipapiVal = ipapi.status === "fulfilled" ? ipapi.value : null;
  result.ptr = ptr.status === "fulfilled" ? ptr.value : null;
  result.isp = pickIsp(ipapiVal, result.org);
  result.connection = classifyConnection(ipapiVal, result.ptr);

  return result;
}

async function gatherUrlIntel(url, domain) {
  const result = { kind: "url", url, domain };
  result.virustotalUrl = virusTotalUrlLink(url);
  result.whoisUrl = whoisUrl(domain);

  const [rdap, ipsResult] = await Promise.allSettled([
    lookupRdapDomain(domain),
    resolveDns(domain)
  ]);

  if (rdap.status === "fulfilled") result.rdap = rdap.value;
  result.ips = ipsResult.status === "fulfilled" ? ipsResult.value : [];

  if (result.ips.length > 0) {
    const firstIp = result.ips[0];
    const [geo, tor, ipapi, ptr] = await Promise.allSettled([
      lookupGeo(firstIp),
      isTorExitNode(firstIp),
      lookupIpapiIs(firstIp),
      lookupPtr(firstIp)
    ]);
    if (geo.status === "fulfilled") result.geo = geo.value;
    result.isTor = tor.status === "fulfilled" ? tor.value : null;

    const ipapiVal = ipapi.status === "fulfilled" ? ipapi.value : null;
    result.ptr = ptr.status === "fulfilled" ? ptr.value : null;
    result.isp = pickIsp(ipapiVal, result.geo?.org);
    result.connection = classifyConnection(ipapiVal, result.ptr);
  } else {
    result.isTor = null;
  }

  return result;
}