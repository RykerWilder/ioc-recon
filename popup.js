const HISTORY_KEY = "iocHistory";

function timeAgo(ts) {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} g ago`;
}

function copyIconSvg() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" stroke-width="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2"/>
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

function render(history) {
  const list = document.getElementById("history-list");
  list.innerHTML = "";

  if (!history || history.length === 0) {
    list.innerHTML =
      '<div class="empty-state">No IOCs analyzed</div>';
    return;
  }

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
      copyBtn.innerHTML = "✓";
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

// keep the popup in sync if it stays open while a new IOC is analyzed
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[HISTORY_KEY]) {
    render(changes[HISTORY_KEY].newValue || []);
  }
});