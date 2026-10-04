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

async function runRecon(rawSelection, tabId) {
  const raw = (rawSelection || "").trim();
  const classified = classifySelection(raw);

  if (classified.kind === "invalid") {
    chrome.scripting.executeScript({
      target: { tabId },
      func: renderPopup,
      args: [{ error: "The selection is neither a valid IP nor URL/domain" }, IOC_THEME]
    });
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
    chrome.scripting.executeScript({
      target: { tabId },
      func: renderPopup,
      args: [{ ...cachedResult, cached: true }, IOC_THEME]
    });
    return;
  }

  const result =
    classified.kind === "ip"
      ? await gatherIpIntel(classified.ip)
      : await gatherUrlIntel(classified.url, classified.domain);

  await cacheSet(cacheKey, result, CACHE_TTL_RESULT_MS);

  chrome.scripting.executeScript({
    target: { tabId },
    func: renderPopup,
    args: [result, IOC_THEME]
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  runRecon(info.selectionText, tab.id);
});


function getPageSelection() {
  const sel = (window.getSelection()?.toString() || "").trim();
  if (sel) return sel;
  try {
    const el = document.activeElement;
    if (el && typeof el.selectionStart === "number" && el.selectionStart !== el.selectionEnd) {
      return (el.value || "").slice(el.selectionStart, el.selectionEnd).trim();
    }
  } catch (_) {}
  return "";
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== COMMAND_ID || !tab?.id) return;

  let raw = "";
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: getPageSelection
    });
    raw = frames.map((f) => f.result).find(Boolean) || "";
  } catch (_) {
    return;
  }

  if (!raw) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: renderPopup,
      args: [{ error: "No text selected. Select an IP, URL or domain first." }, IOC_THEME]
    });
    return;
  }

  runRecon(raw, tab.id);
});