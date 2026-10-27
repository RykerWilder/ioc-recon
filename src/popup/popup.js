const HISTORY_KEY = "iocHistory";

function timeAgo(ts) {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

function copyIconSvg() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="9" width="12" height="12" stroke="currentColor" stroke-width="1.75"/>
    <path d="M5 15H3V3h12v2" stroke="currentColor" stroke-width="1.75"/>
  </svg>`;
}

function checkIconSvg() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" stroke-width="2"/>
  </svg>`;
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function updateCount(n) {
  document.getElementById("history-count").textContent = n ? `${n} / 10` : "";
}

function render(history) {
  const list = document.getElementById("history-list");
  list.innerHTML = "";

  if (!history || history.length === 0) {
    list.innerHTML =
      '<div class="empty-state">No IOCs analyzed yet</div>';
    updateCount(0);
    return;
  }

  updateCount(Math.min(history.length, 10));

  history.slice(0, 10).forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-row";

    const kindBadge = document.createElement("span");
    kindBadge.className = `kind-badge ${item.kind}`;
    kindBadge.textContent = item.kind === "ip" ? "IP" : "URL";

    const info = document.createElement("div");
    info.className = "history-info";

    const valueEl = document.createElement("div");
    valueEl.className = "history-value";
    valueEl.textContent = item.value;
    valueEl.title = item.value;

    const timeEl = document.createElement("div");
    timeEl.className = "history-time";
    timeEl.textContent = timeAgo(item.timestamp);

    info.appendChild(valueEl);
    info.appendChild(timeEl);

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.type = "button";
    copyBtn.title = "Copy defanged IOC";
    copyBtn.innerHTML = copyIconSvg();
    copyBtn.addEventListener("click", () => {
      copyText(item.defanged);
      copyBtn.classList.add("copied");
      const original = copyBtn.innerHTML;
      copyBtn.innerHTML = checkIconSvg();
      setTimeout(() => {
        copyBtn.innerHTML = original;
        copyBtn.classList.remove("copied");
      }, 1000);
    });

    row.appendChild(kindBadge);
    row.appendChild(info);
    row.appendChild(copyBtn);
    list.appendChild(row);
  });
}

chrome.storage.local.get(HISTORY_KEY, (stored) => {
  render(stored[HISTORY_KEY] || []);
});

// Settings page (auto-close and API keys)
document.getElementById("open-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// Reminder when the (required) AbuseIPDB key has not been saved yet.
// Only checks that an encrypted record exists: nothing is decrypted here.
const API_KEYS_STORAGE_KEY = "apiKeys";
function updateKeyHint(apiKeys) {
  document.getElementById("key-hint").hidden = !!(apiKeys && apiKeys.abuseipdb);
}
chrome.storage.local.get(API_KEYS_STORAGE_KEY, (stored) => updateKeyHint(stored[API_KEYS_STORAGE_KEY]));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[HISTORY_KEY]) render(changes[HISTORY_KEY].newValue || []);
  if (changes[API_KEYS_STORAGE_KEY]) updateKeyHint(changes[API_KEYS_STORAGE_KEY].newValue);
});