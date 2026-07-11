# IOC Recon — Chromium Extension
![IOC Recon](https://github.com/RykerWilder/static_files/blob/main/ioc-recon.gif)

A lightweight Chromium extension (Manifest V3) that lets you select any IP address, URL, or domain on a web page, right-click it, and instantly get a recon card injected right into the page — no external site, no API key.

Since it's built on Manifest V3, it works on any Chromium-based browser (Chrome, Edge, Brave, Opera, etc.), not just Chrome.

## How to use

1. Load the extension (see "Installation" below).
2. Select/highlight an IP address, a URL, or a domain on any web page.
3. Right-click the selection → **"IOC recon of \"...\""**.
4. A card appears in the top-right corner with the results. It stays open until you close it — either with the ✕ button or by pressing **Esc**.

The extension also understands "defanged" IOCs copied from reports or threat intel feeds (e.g. `hxxp://evil[.]com`) and automatically converts them back before running the lookup.

## What it shows

### If you select an IP

- **CIDR / Range** — the network block the IP belongs to (via RDAP, rdap.org)
- **Network name** and **Organization**
- **ASN** and **AS Name** (via ipinfo.io)
- **Location** (city, region, country — via GeoJS)
- **Tor Exit Node** — True/False, checked against the official Tor exit list
- Quick links to **AbuseIPDB** and **Shodan**

### If you select a URL or domain

- **Registrar**, **registration date**, and **expiration date** (WHOIS via RDAP)
- **Resolved IP** (via Google DNS)
- **Location** and **Organization** of the resolved IP
- **Tor Exit Node**, checked against the resolved IP
- Quick link to **VirusTotal**

If the selected text is neither a valid IP nor a valid URL/domain, the card shows an error message instead.

## Copying IOCs safely

Every card includes buttons to copy a **defanged** version of the IOC (e.g. `1[.]2[.]3[.]4` or `hxxps://evil[.]com`), so you can paste it into a report or ticket without it becoming a clickable link or a resolvable address.

## Installation (developer mode)

1. Extract the folder to your disk.
2. Go to `chrome://extensions` (or the equivalent extensions page in your Chromium-based browser).
3. Enable **"Developer mode"** (top-right toggle).
4. Click **"Load unpacked"** and select the `ioc-recon` folder.
5. Done — select an IP, URL, or domain on any page and use the context menu entry.

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
- Shodan (link only): https://www.shodan.io
- VirusTotal (link only): https://www.virustotal.com