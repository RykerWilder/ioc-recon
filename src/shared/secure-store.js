// Encrypted storage for API keys.
//
// How it works:
//  1. A random AES-GCM 256-bit key is generated with WebCrypto as NON-EXTRACTABLE
//     (extractable: false) and kept in IndexedDB, which is private to this extension's
//     origin. JavaScript can use that key to encrypt/decrypt but can never read or
//     export its raw bytes.
//  2. Every API key is encrypted with it (fresh random 96-bit IV each time) and only
//     the ciphertext + IV are written to chrome.storage.local. The plain-text key is
//     never persisted.
//  3. The key name is bound to the ciphertext as AES-GCM "additional data", so one
//     encrypted blob cannot be copied into another slot (e.g. AbuseIPDB -> Proxycheck).
//
// Only extension contexts (service worker, options page) can reach IndexedDB and this
// storage. The injected result card and the web pages never see the keys: all API
// requests are made by the service worker.
(function (root) {
  const DB_NAME = "ioc-recon-secure";
  const DB_STORE = "keys";
  const MASTER_KEY_ID = "master-v1";
  const STORAGE_KEY = "apiKeys";
  const NAMES = ["abuseipdb", "proxycheck"];
  const FORMAT_VERSION = 1;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const toB64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  };
  const fromB64 = (str) => Uint8Array.from(atob(str), (ch) => ch.charCodeAt(0));

  const assertName = (name) => {
    if (!NAMES.includes(name)) throw new Error(`Unknown secret "${name}"`);
  };
  const aad = (name) => encoder.encode(`ioc-recon:v${FORMAT_VERSION}:${name}`);

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbGet(db, id) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // Returns the master key. With createIfMissing it is created atomically (get + put in
  // one transaction), so the options page and the service worker cannot end up creating
  // two different keys at the same time.
  async function getMasterKey(createIfMissing) {
    const db = await openDb();
    try {
      const existing = await idbGet(db, MASTER_KEY_ID);
      if (existing || !createIfMissing) return existing;

      const candidate = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false, // non-extractable
        ["encrypt", "decrypt"]
      );
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        const store = tx.objectStore(DB_STORE);
        let winner = candidate;
        const getReq = store.get(MASTER_KEY_ID);
        getReq.onsuccess = () => {
          if (getReq.result) winner = getReq.result;
          else store.put(candidate, MASTER_KEY_ID);
        };
        tx.oncomplete = () => resolve(winner);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async function readAll() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return stored[STORAGE_KEY] || {};
  }

  async function setSecret(name, plaintext) {
    assertName(name);
    const value = String(plaintext || "").trim();
    if (!value) return removeSecret(name);

    const key = await getMasterKey(true);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(name) },
      key,
      encoder.encode(value)
    );
    const all = await readAll();
    all[name] = { v: FORMAT_VERSION, iv: toB64(iv), ct: toB64(ct) };
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
  }

  // Returns the decrypted secret, or null if it is not set / cannot be decrypted
  // (for instance if the browser cleared the extension's IndexedDB).
  async function getSecret(name) {
    assertName(name);
    const record = (await readAll())[name];
    if (!record) return null;
    try {
      const key = await getMasterKey(false);
      if (!key) return null;
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromB64(record.iv), additionalData: aad(name) },
        key,
        fromB64(record.ct)
      );
      return decoder.decode(plain);
    } catch (_) {
      return null;
    }
  }

  async function hasSecret(name) {
    return (await getSecret(name)) !== null;
  }

  async function removeSecret(name) {
    assertName(name);
    const all = await readAll();
    delete all[name];
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
  }

  root.SecureStore = { STORAGE_KEY, NAMES, setSecret, getSecret, hasSecret, removeSecret };
})(typeof self !== "undefined" ? self : window);
