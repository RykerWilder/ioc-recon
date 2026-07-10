# IP Recon — Chrome Extension

A lightweight Chrome extension (Manifest V3) that lets you select any
public IP address on a web page, right-click it, and instantly get a
recon card injected right into the page — no external site, no API key.

## How to use

1. Load the extension in Chrome (see Installation below).
2. On any web page, select/highlight a public IP address with your mouse.
3. Right-click the selection → click **"IP recon of \"...\""**.
4. A small card appears in the top-right corner of the page with the
   results. It closes automatically after ~20 seconds, or you can close
   it manually with the ✕ button.

## What it returns

For the selected IP, the card shows:

- **CIDR** — the subnet/netblock the IP belongs to (or a start–end range
  if a CIDR isn't available), resolved via **RDAP** (rdap.org).
- **Network** — the name/handle of the registered network block.
- **Organization** — the entity the block is registered to, if available.
- **Location** — city, region, and country, resolved via **GeoJS**
  (get.geojs.io).
- **Reputation** — number of attacks/reports associated with the IP,
  from **Blocklist.de**.
- **Tor Exit Node** — `True`/`False`, checked against the official
  Tor Project bulk exit list.

If the selected text isn't a valid IPv4/IPv6 address, the card shows an
error message instead.

## Installation (developer mode)

1. Extract this folder to your disk.
2. Go to `chrome://extensions`.
3. Enable **"Developer mode"** (top-right toggle).
4. Click **"Load unpacked"** and select the `ip-subnet-ext` folder.
5. Done — select an IP on any page and use the context menu entry.

## Caching

To keep things fast, results are cached locally using
`chrome.storage.local`:

- **Full per-IP result** (RDAP + Blocklist.de + Geo + Tor): cached for
  30 minutes. Re-selecting the same IP within that window shows the card
  instantly, labeled `(cache)`.
- **Tor exit node list**: cached for 1 hour, so the (potentially large)
  list isn't re-downloaded on every single lookup.

Expired entries are automatically discarded on next access.

## Data sources (no API key required)

- RDAP: https://rdap.org
- Blocklist.de: https://api.blocklist.de
- Tor Project bulk exit list: https://check.torproject.org/torbulkexitlist
- GeoJS: https://get.geojs.io
