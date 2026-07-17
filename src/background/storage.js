// Storico IOC (letto anche dal popup della toolbar) + cache generica TTL.

const HISTORY_KEY = "iocHistory";
const HISTORY_MAX = 10;

async function saveToHistory(entry) {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  let history = stored[HISTORY_KEY] || [];
  // rimuove eventuali voci precedenti dello stesso IOC così torna in cima
  history = history.filter((h) => !(h.kind === entry.kind && h.value === entry.value));
  history.unshift(entry);
  history = history.slice(0, HISTORY_MAX);
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

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