// Design tokens shared by the toolbar popup and the card injected into pages.
// They mirror Argus: warm black, near-white text, a single mint accent,
// square corners, Geist + Geist Mono and bracketed mono links.
const IOC_THEME = {
  color: {
    bg: "#151515",
    bgRaised: "#1b1b1b",
    line: "#2b2b2b",
    lineSoft: "#202020",
    lineStrong: "#4a4a47",
    text: "#f3f3f0",
    muted: "#8f8f8a",
    dim: "#5e5e5a",
    accent: "#3dffc5",
    accentHover: "#73ffd5",
    accentInk: "#151515",
    accentSoft: "rgba(61, 255, 197, 0.08)",
    warn: "#f6b54b",
    warnSoft: "rgba(246, 181, 75, 0.06)",
    danger: "#ff6b4f",
    dangerSoft: "rgba(255, 107, 79, 0.06)",
    grid: "rgba(255, 255, 255, 0.028)",
    scrollThumb: "#3d3d3b"
  },
  grid: "72px",
  fontFamily: {
    sans: '"Geist", "Helvetica Neue", Helvetica, Arial, sans-serif',
    mono: '"Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace'
  }
};

// Font files bundled with the extension. Only the service worker can resolve
// them (chrome.runtime.getURL); the popup loads them through popup.css instead.
// They are listed in manifest.json -> web_accessible_resources so pages can use them.
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
  IOC_THEME.fontFiles = {
    sans300: chrome.runtime.getURL("fonts/Geist-Light.woff2"),
    sans400: chrome.runtime.getURL("fonts/Geist-Regular.woff2"),
    sans500: chrome.runtime.getURL("fonts/Geist-Medium.woff2"),
    mono400: chrome.runtime.getURL("fonts/GeistMono-Regular.woff2"),
    mono500: chrome.runtime.getURL("fonts/GeistMono-Medium.woff2")
  };
}

if (typeof self !== "undefined") {
  self.IOC_THEME = IOC_THEME;
}
