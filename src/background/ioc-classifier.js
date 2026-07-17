// Riconoscimento e normalizzazione degli IOC selezionati dall'utente.

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