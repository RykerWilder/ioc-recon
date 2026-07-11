# IOC Recon — Chrome Extension

![IOC Recon](https://github.com/RykerWilder/static_files/blob/main/ioc-recon.gif)

A lightweight Chrome extension (Manifest V3) that lets you select any
IP address, URL, or domain on a web page, right-click it, and instantly
get a recon card injected right into the page — no external site, no
API key.

This is the merged successor of **IP Recon** and **URL Recon**: one
context menu entry that automatically detects whether you selected an
IP or a URL/domain, and shows the right data for each.

## How to use

1. Load the extension in Chrome (see Installation below).
2. On any web page, select/highlight an IP address, a URL, or a bare
   domain with your mouse.
3. Right-click the selection → click **"IOC recon of \"...\""**.
4. A small card appears in the top-right corner of the page with the
   results. It stays open until you close it — either with the ✕
   button or by pressing **Esc**. It does not close automatically.

The extension also understands "defanged" IOCs copied from reports or
threat intel feeds (e.g. `hxxp://evil[.]com`) and automatically converts
them back before running the lookup.

## What it returns

### If you selected an IP address

- **CIDR** — the subnet/netblock the IP belongs to (or a start–end
  range if a CIDR isn't available), resolved via **RDAP** (rdap.org).
- **Network** — the name/handle of the registered network block.
- **Organization** — the entity the block is registered to, if
  available.
- **Location** — city, region, and country, resolved via **GeoJS**
  (get.geojs.io).
- **Reputation** — number of attacks/reports associated with the IP,
  from **Blocklist.de**.
- **Tor Exit Node** — `True`/`False`, checked against the official
  Tor Project bulk exit list.

### If you selected a URL or domain

- **Registrar** — who the domain is registered with.
- **Registered on / Expires on** — key WHOIS dates, resolved via
  **RDAP** (rdap.org).
- **Status** — domain status codes (e.g. `clientTransferProhibited`),
  if present.
- **Resolved IP** — the domain's current A record, via **Google DNS**
  (dns.google).
- **Location** and **Organization** — geolocation of the resolved IP,
  via **GeoJS**.
- **Reputation** and **Tor Exit Node** — same checks as above, run
  against the domain's resolved IP.
- **urlscan.io verdict** — if the domain has been scanned before,
  shows whether it was flagged malicious or clean, plus a link to the
  full public report. If it has never been scanned, the card says so
  instead of triggering a new scan.

If the selected text is neither a valid IP nor a valid URL/domain, the
card shows an error message instead.

## Copying IOCs safely

Every card includes one-click copy buttons for a **defanged** version
of the IOC (e.g. `1[.]2[.]3[.]4` or `hxxps://evil[.]com`), so you can
paste it straight into a report or ticket without it becoming a live
link or a resolvable address.

## Installation (developer mode)

1. Extract this folder to your disk.
2. Go to `chrome://extensions`.
3. Enable **"Developer mode"** (top-right toggle).
4. Click **"Load unpacked"** and select the `ioc-recon` folder.
5. Done — select an IP, URL, or domain on any page and use the context
   menu entry.

## Caching

To keep things fast, results are cached locally using
`chrome.storage.local`:

- **Full per-IOC result** (all lookups above): cached for 30 minutes.
  Re-selecting the same IOC within that window shows the card
  instantly, labeled `(cache)`.
- **Tor exit node list**: cached for 1 hour, so the (potentially large)
  list isn't re-downloaded on every single lookup.

Expired entries are automatically discarded on next access.

## Data sources (no API key required)

- RDAP: https://rdap.org
- Google DNS-over-HTTPS: https://dns.google
- Blocklist.de: https://api.blocklist.de
- Tor Project bulk exit list: https://check.torproject.org/torbulkexitlist
- GeoJS: https://get.geojs.io
- urlscan.io (public search only): https://urlscan.io