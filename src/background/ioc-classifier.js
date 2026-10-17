const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// Max number of IPs analyzed in one go (keeps the number of API calls reasonable)
const MAX_IOCS = 10;

// Separators between IOCs in a selection: whitespace, comma, semicolon, pipe
const SELECTION_SPLIT_RE = /[\s,;|]+/;

// Anything that is not a letter, digit or ":" at the edges of a token is noise
// (",;.10.10.10.10" -> "10.10.10.10"). ":" is handled separately because of IPv6 ("::1").
const EDGE_JUNK_RE = /^[^\p{L}\p{N}:]+|[^\p{L}\p{N}:]+$/gu;

// IPv4 embedded in a token ("ip=1.2.3.4", "1.2.3.4:8080"), but not inside
// hostnames ("1.2.3.4.example.com") or version strings ("1.2.3.4.5")
const IPV4_EMBEDDED_RE =
  /(?<![A-Za-z0-9_.-])(?:\d{1,3}\.){3}\d{1,3}(?![A-Za-z0-9_-]|\.[A-Za-z0-9])/g;

function isValidIPv4(ip) {
  const m = ip.match(IPV4_RE);
  if (!m) return false;
  return m.slice(1).every((n) => Number(n) >= 0 && Number(n) <= 255);
}

// Strict check: the old regex also accepted things like "12:30:45" or MAC addresses,
// which is a problem now that whole blocks of text can be scanned.
function isValidIPv6(ip) {
  if (!ip.includes(":")) return false;
  if (!/^[0-9a-fA-F:.]+$/.test(ip) || !/[0-9a-fA-F]/.test(ip)) return false;
  try {
    new URL(`http://[${ip}]/`);
    return true;
  } catch (_) {
    return false;
  }
}

function isValidIP(value) {
  const ip = value.trim();
  return isValidIPv4(ip) || isValidIPv6(ip);
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

function trimEdges(token) {
  let t = token;
  let prev;
  do {
    prev = t;
    t = t.replace(EDGE_JUNK_RE, "");
    if (t.endsWith(":") && !t.endsWith("::")) t = t.slice(0, -1);
    if (t.startsWith(":") && !t.startsWith("::")) t = t.slice(1);
  } while (t !== prev);
  return t;
}

// Returns every distinct valid IP found in the selection, in order of appearance.
function extractIps(rawSelection) {
  const text = refangSelection(rawSelection);
  const found = [];
  const seen = new Set();

  const add = (ip) => {
    const norm = ip.includes(":") ? ip.toLowerCase() : ip;
    if (!seen.has(norm)) {
      seen.add(norm);
      found.push(norm);
    }
  };

  for (const token of text.split(SELECTION_SPLIT_RE)) {
    const t = trimEdges(token);
    if (!t) continue;

    if (isValidIP(t)) {
      add(t);
      continue;
    }

    // URLs and CIDR blocks are not plain IPs: leave them to the URL/domain path
    if (t.includes("/")) continue;

    for (const m of t.match(IPV4_EMBEDDED_RE) || []) {
      if (isValidIPv4(m)) add(m);
    }
  }
  return found;
}

function classifySelection(rawSelection) {
  const ips = extractIps(rawSelection);
  if (ips.length > 0) {
    return { kind: "ips", ips: ips.slice(0, MAX_IOCS), total: ips.length };
  }

  // No IPs: the selection may be a single URL / domain (surrounding noise removed)
  const cleaned = refangSelection(rawSelection).replace(
    /^[\s,;.'"`<>\[\]{}]+|[\s,;.'"`<>\[\]{}]+$/g,
    ""
  );
  const parsed = extractUrlOrDomain(cleaned);
  if (parsed) {
    return { kind: "url", ...parsed };
  }

  return { kind: "invalid" };
}

function defangIpValue(value) {
  return value ? value.replace(/\./g, "[.]") : value;
}

function defangUrlValue(value) {
  return value
    ? value
        .replace(/http/gi, (m) => (m === m.toUpperCase() ? "HXXP" : "hxxp"))
        .replace(/\./g, "[.]")
    : value;
}