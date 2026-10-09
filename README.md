# IOC Recon — Chromium Extension

![License](https://img.shields.io/badge/license-MIT-blue)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black&labelColor=F7DF1E)
![VirusTotal](https://img.shields.io/badge/VirusTotal-394EFF?style=flat&logo=virustotal&logoColor=white)
![Spur](https://img.shields.io/badge/Spur-7C3AED?style=flat)
![AbuseIPDB](https://img.shields.io/badge/AbuseIPDB-1E1E1E?style=flat)

![IOC Recon](https://github.com/RykerWilder/static_files/blob/main/ioc-recon.gif)

A lightweight Chromium extension (Manifest V3) that lets you select any IP address, URL, or domain on a web page, right-click it, and instantly get a recon card injected right into the page — no external site, no API key.

Since it's built on Manifest V3, it works on any Chromium-based browser (Chrome, Edge, Brave, Opera, etc.), not just Chrome.

## How to use

1. Load the extension (see "Installation" below).
2. Select/highlight an IP address, a URL, or a domain on any web page.
3. Press **Alt+R** (**Option+R** on macOS), or right-click the selection → **"IOC recon of \"...\""**.
4. A card appears right next to the selected IOC (below it, or above if there isn't enough room) with the results. By default it stays open until you close it — either with the ✕ button or by pressing **Esc**. If you prefer, you can enable **Auto-close result card** from the toolbar popup: the card then disappears by itself after 5 seconds (✕ and **Esc** keep working).

The extension also understands "defanged" IOCs copied from reports or threat intel feeds (e.g. `hxxp://evil[.]com`) and automatically converts them back before running the lookup.

### Keyboard shortcut

The default shortcut is **Alt+R** (**Option+R** on macOS). You can change it at `chrome://extensions/shortcuts` (or the equivalent page in your browser). If another extension already uses the same combination, Chrome leaves the shortcut unassigned and you'll need to set it manually from that page.

## What it shows

### If you select an IP

- **CIDR / Range** — the network block the IP belongs to (via RDAP, rdap.org)
- **Network name** and **Organization**
- **ASN** (via ipinfo.io)
- **Location** (city, region, country — via GeoJS)
- **Tor Exit Node** — True/False, checked against the official Tor exit list
- Quick links to **AbuseIPDB** and **Spur**

### If you select a URL or domain

- **Registrar**, **registration date**, and **expiration date** (WHOIS via RDAP)
- **Resolved IP** (via Google DNS)
- **Location** and **Organization** of the resolved IP
- **Tor Exit Node**, checked against the resolved IP
- Quick links to **VirusTotal** and **WHOIS**

If the selected text is neither a valid IP nor a valid URL/domain, the card shows an error message instead.

## Copying IOCs safely

Every card includes buttons to copy a **defanged** version of the IOC (e.g. `1[.]2[.]3[.]4` or `hxxps://evil[.]com`), so you can paste it into a report or ticket without it becoming a clickable link or a resolvable address.

## IOC history

Click the extension icon in the toolbar to see the last 10 IOCs you've analyzed, most recent first. Each entry shows the IOC value, how long ago it was checked, and a one-click button to copy its defanged form — handy for quickly re-pasting an IOC into a report without re-running the lookup.

## Installation (developer mode)

1. Extract the folder to your disk.
2. Go to `chrome://extensions` (or the equivalent extensions page in your Chromium-based browser).
3. Enable **"Developer mode"** (top-right toggle).
4. Click **"Load unpacked"** and select the `ioc-recon` folder.
5. Done — select an IP, URL, or domain on any page and use **Alt+R** or the context menu entry.

## Caching

To keep things fast, results are cached locally with `chrome.storage.local`:

- **Full per-IOC result**: cached for 30 minutes. Re-selecting the same IOC within that window shows the card instantly, labeled `(cache)`.
- **Tor exit node list**: cached for 1 hour, so it isn't re-downloaded on every lookup.

Expired entries are automatically discarded on next access.

## Data sources (no API key required)

- RDAP: https://rdap.org
- Google DNS-over-HTTPS: https://dns.google
- GeoJS: https://get.geojs.io
- ipinfo.io: https://ipinfo.io
- Tor Project bulk exit list: https://check.torproject.org/torbulkexitlist
- AbuseIPDB (link only): https://www.abuseipdb.com
- Spur (link only): https://spur.us
- VirusTotal (link only): https://www.virustotal.com
- WHOIS (link only): https://whois.domaintools.com