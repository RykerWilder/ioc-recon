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

// --- ASN / AS name ---
async function lookupAsn(ip) {
  const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ipinfo HTTP ${res.status}`);
  const data = await res.json();

  // data.org è tipicamente nella forma "AS15169 Google LLC"
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