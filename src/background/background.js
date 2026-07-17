importScripts(
  "../shared/theme.js",
  "./ioc-classifier.js",
  "./storage.js",
  "./intel.js",
  "./inject-popup.js"
);

const MENU_ID = "ioc-recon";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'IOC recon of "%s"',
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const raw = (info.selectionText || "").trim();
  const classified = classifySelection(raw);

  if (classified.kind === "invalid") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
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
    classified.kind === "ip" ? `ip:${classified.ip}` : `domain:${classified.domain}`;

  const cachedResult = await cacheGet(cacheKey);
  if (cachedResult) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
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
    target: { tabId: tab.id },
    func: renderPopup,
    args: [result, IOC_THEME]
  });
});