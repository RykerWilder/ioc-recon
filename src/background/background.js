importScripts(
  "../shared/theme.js",
  "./ioc-classifier.js",
  "./storage.js",
  "./intel.js",
  "./inject-popup.js"
);

const MENU_ID = "ioc-recon";
const COMMAND_ID = "ioc-recon-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'IOC recon of "%s"',
    contexts: ["selection"]
  });
});

// Minimum frame viewport in which the card is rendered inside a sub-frame.
// Smaller iframes would clip the card, so we fall back to the top frame.
const MIN_FRAME_WIDTH = 400;
const MIN_FRAME_HEIGHT = 300;

// ctx = { frameId, anchor, vw, vh } -> position of the selected IOC (see getPageSelection)
async function showCard(tabId, data, ctx = {}) {
  const autoCloseMs = await getAutoCloseMs();
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

async function runRecon(rawSelection, tabId, ctx = {}) {
  const raw = (rawSelection || "").trim();
  const classified = classifySelection(raw);

  if (classified.kind === "invalid") {
    showCard(tabId, { error: "The selection is neither a valid IP nor URL/domain" }, ctx);
    return;
  }

  const historyEntry =
    classified.kind === "ip"
      ? {
          kind: "ip",
          value: classified.ip,
          defanged: defangIpValue(classified.ip),
          timestamp: Date.now()
        }
      : {
          kind: "url",
          value: classified.url,
          domain: classified.domain,
          defanged: defangUrlValue(classified.url),
          timestamp: Date.now()
        };
  await saveToHistory(historyEntry);

  const cacheKey =
    classified.kind === "ip" ? `v2:ip:${classified.ip}` : `v2:domain:${classified.domain}`;

  const cachedResult = await cacheGet(cacheKey);
  if (cachedResult) {
    showCard(tabId, { ...cachedResult, cached: true }, ctx);
    return;
  }

  const result =
    classified.kind === "ip"
      ? await gatherIpIntel(classified.ip)
      : await gatherUrlIntel(classified.url, classified.domain);

  await cacheSet(cacheKey, result, CACHE_TTL_RESULT_MS);

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