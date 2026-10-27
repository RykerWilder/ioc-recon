const AUTO_CLOSE_KEY = "autoCloseCard";

// --- Auto-close toggle -----------------------------------------------------
const autoCloseToggle = document.getElementById("auto-close-toggle");

chrome.storage.local.get({ [AUTO_CLOSE_KEY]: false }, (stored) => {
  autoCloseToggle.checked = !!stored[AUTO_CLOSE_KEY];
});

autoCloseToggle.addEventListener("change", () => {
  chrome.storage.local.set({ [AUTO_CLOSE_KEY]: autoCloseToggle.checked });
});

// --- API keys (encrypted by SecureStore) -------------------------------------
document.querySelectorAll(".key-field").forEach((form) => {
  const name = form.dataset.name;
  const input = form.querySelector(".key-input");
  const status = document.getElementById(`status-${name}`);
  const removeBtn = form.querySelector(".btn-remove");

  const setStatus = (text, kind = "") => {
    status.textContent = text;
    status.className = `key-status mono ${kind}`;
  };

  async function refresh() {
    let saved = false;
    try {
      saved = await SecureStore.hasSecret(name);
    } catch (_) {}
    removeBtn.hidden = !saved;
    input.placeholder = saved ? "•••••••••••••••• (saved, type to replace)" : "Paste your API key";
    setStatus(saved ? "Saved · encrypted" : "Not set", saved ? "ok" : "");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return setStatus("Enter a key first", "warn");
    if (/\s/.test(value) || value.length < 8 || value.length > 256) {
      return setStatus("That does not look like a valid key", "warn");
    }
    try {
      await SecureStore.setSecret(name, value);
      input.value = "";
      await refresh();
      setStatus("Saved · encrypted", "ok");
    } catch (_) {
      setStatus("Could not save the key", "warn");
    }
  });

  removeBtn.addEventListener("click", async () => {
    try {
      await SecureStore.removeSecret(name);
      input.value = "";
    } catch (_) {}
    await refresh();
  });

  refresh();
});
