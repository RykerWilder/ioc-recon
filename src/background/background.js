importScripts(
  "../shared/theme.js",
  "./ioc-classifier.js",
  "../shared/secure-store.js",
  "./storage.js",
  "./intel.js",
  "./inject-popup.js"
);

const MENU_ID = "ioc-recon";
const COMMAND_ID = "ioc-recon-selection";

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'IOC recon of "%s"',
    contexts: ["selection"]
  });
  // Results cached by older versions use a different format: drop them
  try {
    const all = await chrome.storage.local.get(null);
    const stale = Object.keys(all).filter((k) => /^v[1-3]:/.test(k) || k === "tor:list");
    if (stale.length) await chrome.storage.local.remove(stale);
  } catch (_) {}
});

// The injected result card asks us to open the settings page
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id === chrome.runtime.id && msg?.type === "open-options") {
    chrome.runtime.openOptionsPage();
  }
});

// Minimum frame viewport in which the card is rendered inside a sub-frame.
// Smaller iframes would clip the card, so we fall back to the top frame.
const MIN_FRAME_WIDTH = 400;
const MIN_FRAME_HEIGHT = 300;

// ctx = { frameId, anchor, vw, vh } -> position of the selected IOC (see getPageSelection)
async function showCard(tabId, data, ctx = {}) {
  const autoCloseMs = data.loading ? 0 : await getAutoCloseMs();
  const { frameId = 0, anchor = null, vw = 0, vh = 0 } = ctx;

  const canAnchorInFrame =
    !!anchor && (frameId === 0 || (vw >= MIN_FRAME_WIDTH && vh >= MIN_FRAME_HEIGHT));

  const inject = (target, withAnchor) =>
    chrome.scripting.executeScript({
      target,
      func: renderPopup,
      args: [data, IOC_THEME, { autoCloseMs, anchor: withAnchor ? anchor : null }]
    });

  try {
    if (canAnchorInFrame) {
      await inject(frameId ? { tabId, frameIds: [frameId] } : { tabId }, true);
    } else {
      await inject({ tabId }, false);
    }
  } catch (_) {
    // Injection into the sub-frame failed: fall back to the top frame (default position)
    try {
      await inject({ tabId }, false);
    } catch (__) {}
  }
}

// Max parallel IP lookups: each IP fires 2 requests (AbuseIPDB + Proxycheck)
const IP_LOOKUP_CONCURRENCY = 3;

// Runs fn over items with at most `limit` in flight, preserving the order of results
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

const ipCacheKey = (ip) => `v4:ip:${ip}`;

async function lookupIp(ip, keys) {
  const cached = await cacheGet(ipCacheKey(ip));
  if (cached) return { ...cached, cached: true };

  let result;
  try {
    result = await gatherIpIntel(ip, keys);
  } catch (_) {
    // One failing IP must not take down the whole batch
    return { kind: "ip", ip, warnings: ["Lookup failed"], incomplete: true };
  }
  // Partial results (a service failed or was rate limited) are not cached, so the
  // next attempt asks again instead of repeating the gap for 30 minutes
  if (!result.incomplete) await cacheSet(ipCacheKey(ip), result, CACHE_TTL_RESULT_MS);
  return result;
}

async function runIpRecon({ ips, total }, keys, tabId, ctx) {
  // History: saved in reverse so the first IP of the selection ends up on top
  for (const ip of [...ips].reverse()) {
    await saveToHistory({
      kind: "ip",
      value: ip,
      defanged: defangIpValue(ip),
      timestamp: Date.now()
    });
  }

  // With several IPs the lookup takes a few seconds: show a placeholder card,
  // unless everything is already cached
  if (ips.length > 1) {
    const cachedFlags = await Promise.all(ips.map((ip) => cacheGet(ipCacheKey(ip))));
    if (!cachedFlags.every(Boolean)) {
      await showCard(tabId, { loading: `Analyzing ${ips.length} IPs…` }, ctx);
    }
  }

  const results = await mapWithConcurrency(ips, IP_LOOKUP_CONCURRENCY, (ip) => lookupIp(ip, keys));

  if (results.length === 1) {
    showCard(tabId, results[0], ctx);
  } else {
    showCard(tabId, { kind: "ips", items: results, total }, ctx);
  }
}

async function runRecon(rawSelection, tabId, ctx = {}) {
  const raw = (rawSelection || "").trim();
  const classified = classifySelection(raw);

  if (classified.kind === "invalid") {
    showCard(tabId, { error: "The selection contains no valid IP, URL or domain" }, ctx);
    return;
  }

  // AbuseIPDB needs an API key (Proxycheck works without one, with a lower daily quota)
  const keys = await loadApiKeys();
  if (!keys.abuseipdb) {
    showCard(
      tabId,
      {
        error: "AbuseIPDB API key not set. Add it in the extension settings to run lookups.",
        needsSettings: true
      },
      ctx
    );
    return;
  }

  if (classified.kind === "ips") {
    await runIpRecon(classified, keys, tabId, ctx);
    return;
  }

  // URL / domain
  await saveToHistory({
    kind: "url",
    value: classified.url,
    domain: classified.domain,
    defanged: defangUrlValue(classified.url),
    timestamp: Date.now()
  });

  const cacheKey = `v4:domain:${classified.domain}`;

  const cachedResult = await cacheGet(cacheKey);
  if (cachedResult) {
    showCard(tabId, { ...cachedResult, cached: true }, ctx);
    return;
  }

  const result = await gatherUrlIntel(classified.url, classified.domain, keys);

  if (!result.incomplete) await cacheSet(cacheKey, result, CACHE_TTL_RESULT_MS);

  showCard(tabId, result, ctx);
}

// Runs inside the page: returns the selected text and where it sits on screen.
// The anchor is stored in page coordinates (viewport + scroll) so it stays valid
// even if the page scrolls while the analysis is running.
function getPageSelection() {
  const build = (text, rect) => ({
    text,
    anchor:
      rect && (rect.width || rect.height)
        ? {
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            w: rect.width,
            h: rect.height
          }
        : null,
    vw: document.documentElement.clientWidth,
    vh: document.documentElement.clientHeight
  });

  const sel = window.getSelection();
  const text = (sel?.toString() || "").trim();
  if (text) {
    let rect = null;
    try {
      if (sel.rangeCount) rect = sel.getRangeAt(0).getBoundingClientRect();
    } catch (_) {}
    // Selections inside <input>/<textarea> have no usable range rect: use the field itself
    if (!rect || (!rect.width && !rect.height)) {
      const el = document.activeElement;
      if (el && el !== document.body) rect = el.getBoundingClientRect();
    }
    return build(text, rect);
  }

  try {
    const el = document.activeElement;
    if (el && typeof el.selectionStart === "number" && el.selectionStart !== el.selectionEnd) {
      const fieldText = (el.value || "").slice(el.selectionStart, el.selectionEnd).trim();
      if (fieldText) return build(fieldText, el.getBoundingClientRect());
    }
  } catch (_) {}
  return null;
}

async function getSelectionContext(tabId, frameId = 0) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: getPageSelection
    });
    const r = res?.result;
    return r?.anchor ? { frameId, anchor: r.anchor, vw: r.vw, vh: r.vh } : {};
  } catch (_) {
    return {};
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const ctx = await getSelectionContext(tab.id, info.frameId || 0);
  runRecon(info.selectionText, tab.id, ctx);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== COMMAND_ID || !tab?.id) return;

  let hit = null;
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: getPageSelection
    });
    hit = frames.find((f) => f.result?.text) || null;
  } catch (_) {
    return;
  }

  if (!hit) {
    showCard(tab.id, { error: "No text selected. Select an IP, URL or domain first." });
    return;
  }

  const { text, anchor, vw, vh } = hit.result;
  runRecon(text, tab.id, anchor ? { frameId: hit.frameId || 0, anchor, vw, vh } : {});
});