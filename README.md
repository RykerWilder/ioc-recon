# IOC Recon — Chromium Extension

![License](https://img.shields.io/badge/license-MIT-blue)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black&labelColor=F7DF1E)
![VirusTotal](https://img.shields.io/badge/VirusTotal-394EFF?style=flat&logo=virustotal&logoColor=white)
![AbuseIPDB](https://img.shields.io/badge/AbuseIPDB-1E1E1E?style=flat)
![Proxycheck](https://img.shields.io/badge/Proxycheck.io-1E1E1E?style=flat)

![IOC Recon](https://github.com/RykerWilder/static_files/blob/main/ioc-recon.gif)

A lightweight Chromium extension (Manifest V3) that lets you select any IP address, URL, or domain on a web page, right-click it, and instantly get a recon card injected right into the page — no external site to open. Lookups use [AbuseIPDB](https://www.abuseipdb.com) (free API key required) and [Proxycheck.io](https://proxycheck.io) (API key optional).

Since it's built on Manifest V3, it works on any Chromium-based browser (Chrome, Edge, Brave, Opera, etc.), not just Chrome.

## How to use

1. Load the extension (see "Installation" below) and add your AbuseIPDB API key in **Settings** (see "Settings and API keys").
2. Select/highlight an IP address, a URL, or a domain on any web page.
3. Press **Alt+R** (**Option+R** on macOS), or right-click the selection → **"IOC recon of \"...\""**.
4. A card appears right next to the selected IOC (below it, or above if there isn't enough room) with the results. By default it stays open until you close it — either with the ✕ button or by pressing **Esc**. If you prefer, you can enable **Auto-close result card** in **Settings**: the card then disappears by itself after 10 seconds (✕ and **Esc** keep working).
   The card can be **moved anywhere in the window**: drag the small grip bar (⠿) at the top of the card to reposition it, and double-click the bar to snap it back next to the IOC. While you drag, auto-close is paused.

The extension also understands "defanged" IOCs copied from reports or threat intel feeds (e.g. `hxxp://evil[.]com`) and automatically converts them back before running the lookup.

### Multiple IPs and messy selections

You don't need to select an IP precisely, nor one at a time:

- **Surrounding noise is ignored.** `,;.10.10.10.10`, `"10.10.10.10",` or `(10.10.10.10)` are all analyzed as `10.10.10.10`.
- **Several IPs at once.** Select a block of text containing multiple IPs, separated by commas, semicolons, spaces, pipes or new lines (e.g. `10.10.10.10, 10.10.10.20; 30.30.30.30`) and every IP is analyzed. Defanged IPs (`10[.]10[.]10[.]10`) work too, and duplicates are analyzed only once.
- **IPs inside text.** A whole log line works: only the valid IPs are picked up (`src=10.10.10.10`, `10.10.10.10:8080`, ...). Timestamps, MAC addresses and version strings (`1.2.3.4.5`) are not mistaken for IPs.
- **One card, one entry per IP.** With more than one IP the card shows a collapsible entry per address (country · score · ISP at a glance, plus Tor / Proxy / VPN tags), a **Copy all defanged** button, and the full details of each IP when expanded.
- **Limit: 10 IPs per selection.** If more are found, the first 10 are analyzed and the card says how many were skipped.

URLs and domains are still analyzed one at a time. If a selection contains both IPs and a URL/domain, only the IPs are analyzed.

### Keyboard shortcut

The default shortcut is **Alt+R** (**Option+R** on macOS). You can change it at `chrome://extensions/shortcuts` (or the equivalent page in your browser). If another extension already uses the same combination, Chrome leaves the shortcut unassigned and you'll need to set it manually from that page.

## What it shows

### If you select an IP

| Field | Source |
|---|---|
| **Score** — AbuseIPDB confidence of abuse (0–100%, last 90 days) and number of reports | AbuseIPDB |
| **ISP** | AbuseIPDB |
| **Usage type** (e.g. *Fixed Line ISP*, *Data Center/Web Hosting/Transit*) | AbuseIPDB |
| **Country** | AbuseIPDB |
| **City** — AbuseIPDB does not provide it | Proxycheck.io |
| **Proxy** yes/no, with the operator/protocols when known | Proxycheck.io |
| **VPN** yes/no, with the VPN operator/protocols when known | Proxycheck.io |

A **Tor** tag is shown when either service flags the IP as a Tor exit node. If one of the two services fails (rate limit, wrong key, network error) the card still shows what the other one returned, with a note explaining what is missing; incomplete results are never cached.

### If you select a URL or domain

The domain is resolved to an IPv4 address with Google DNS-over-HTTPS and the **first resolved IP** is analyzed with the same fields as above. All resolved IPs are listed, and the card has **VirusTotal** and **WHOIS** link buttons plus defanged-copy buttons.

If the selected text contains no valid IP and is not a valid URL/domain, the card shows an error message instead.

## Copying IOCs safely

Every card includes buttons to copy a **defanged** version of the IOC (e.g. `1[.]2[.]3[.]4` or `hxxps://evil[.]com`), so you can paste it into a report or ticket without it becoming a clickable link or a resolvable address.

## IOC history

Click the extension icon in the toolbar to see the last 10 IOCs you've analyzed (every IP of a multi-IP selection gets its own entry), most recent first. Each entry shows the IOC value, how long ago it was checked, and a one-click button to copy its defanged form — handy for quickly re-pasting an IOC into a report without re-running the lookup.

## Settings and API keys

Click the extension icon and press **[ Settings ]** (also reachable from the card, when the key is missing). The page contains:

- **Auto-close result card** — hide the card after 10 seconds.
- **AbuseIPDB API key** (required) — get a free key at <https://www.abuseipdb.com/account/api>. Free accounts have 1,000 checks per day.
- **Proxycheck.io API key** (optional) — works without a key at 100 queries per day; a free key from <https://proxycheck.io/dashboard/> raises it to 1,000.

### How the keys are encrypted

Keys are never stored in plain text. They are encrypted by `src/shared/secure-store.js`:

1. A random **AES-GCM 256-bit** key is generated with WebCrypto as **non-extractable** and stored in the extension's private IndexedDB. Code can use it to encrypt/decrypt but can never read or export its raw bytes.
2. Each API key is encrypted with it, using a fresh random 96-bit IV, and only `{ iv, ciphertext }` is saved in `chrome.storage.local`.
3. The key's name is bound to the ciphertext as AES-GCM *additional data*, so an encrypted blob cannot be moved from one slot to another, and any tampering makes decryption fail.
4. Only the extension's service worker decrypts the keys, right before a request. The result card injected in web pages never sees them.

Limits: this protects keys at rest (storage files, backups, sync, tools that scan the profile for strings), not against someone who can already run code as the extension or who copies the whole browser profile and its IndexedDB. Proxycheck.io only accepts the key as a URL query parameter, so it travels inside the HTTPS request URL.

## Design

The UI (toolbar popup, settings page and result card) follows the look of Argus: warm black background with a subtle grid, a single mint accent (`#3dffc5`), square corners, bracketed mono links and the Geist / Geist Mono typefaces. The design tokens live in `src/shared/theme.js` (result card) and at the top of `src/popup/popup.css` and `src/options/options.css` (popup and settings).

The Geist fonts are bundled in `fonts/` (SIL Open Font License 1.1, see `fonts/OFL.txt`), so the card looks the same on every page without loading anything from the web.

## Installation (developer mode)

1. Extract the folder to your disk.
2. Go to `chrome://extensions` (or the equivalent extensions page in your Chromium-based browser).
3. Enable **"Developer mode"** (top-right toggle).
4. Click **"Load unpacked"** and select the `ioc-recon` folder.
5. Done — select an IP, URL, or domain on any page and use **Alt+R** or the context menu entry.

## Caching

To keep things fast (and to save your daily API quota), complete results are cached locally with `chrome.storage.local` for 30 minutes. Re-selecting the same IOC within that window shows the card instantly, labeled `cache`. Expired entries are automatically discarded on next access.

## Data sources

- AbuseIPDB API v2 (`/check`): https://docs.abuseipdb.com — API key required
- Proxycheck.io API v3: https://proxycheck.io/api/ — API key optional
- Google DNS-over-HTTPS (domain → IP): https://dns.google
- VirusTotal (link only): https://www.virustotal.com
- WHOIS (link only): https://whois.domaintools.com

The IPs you select (or the IP a selected domain resolves to) are sent to AbuseIPDB and Proxycheck.io, and domains to Google DNS.
