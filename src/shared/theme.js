// Unica fonte di verità per lo stile dell'estensione.
// Caricato in due modi diversi ma dallo stesso identico file:
//  - nel service worker, via importScripts("../shared/theme.js"), per essere
//    passato come argomento a renderPopup() quando viene iniettato in pagina
//  - in popup.html, come <script> classico, per impostare le CSS custom
//    properties consumate da popup.css
//
// Cambiare un colore o un raggio qui si riflette automaticamente ovunque:
// niente più valori duplicati che possono disallinearsi tra loro.

const IOC_THEME = {
  radius: {
    popup: "14px",   // contenitore principale (popup toolbar + card iniettata)
    row: "8px",       // righe hover nella lista storico
    button: "8px",    // pulsanti azione (copia, link esterni)
    pill: "999px",    // badge tondeggianti (kind-badge, ioc-badge)
    close: "6px"      // pulsante di chiusura della card iniettata
  },
  color: {
    bgTop: "#16233d",
    bgBottom: "#111b30",
    text: "#f1f5f9",
    muted: "#9fb0c9",
    accent: "#c9691a",
    accentHover: "#e07a24",
    border: "rgba(201, 154, 91, 0.15)",
    borderSoft: "rgba(201, 154, 91, 0.1)",
    rowHover: "rgba(201, 154, 91, 0.08)",
    ok: "#4ade80",
    okBg: "rgba(34, 197, 94, 0.15)",
    bad: "#f0a55e",
    badBg: "rgba(230, 126, 34, 0.18)",
    na: "#9fb0c9",
    naBg: "rgba(201, 154, 91, 0.15)",
    ipBadge: "#97a4ff",
    ipBadgeBg: "rgba(57, 78, 255, 0.18)",
    urlBadge: "#4ade80",
    urlBadgeBg: "rgba(34, 197, 94, 0.15)",
    virustotal: "#394eff",
    virustotalHover: "#2d3ecc",
    shodan: "#cc0000",
    shodanHover: "#a30000",
    copied: "#22c55e"
  },
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif",
  shadow: "0 20px 40px -8px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,154,91,0.08)"
};

// Espone IOC_THEME sia in contesto service worker (self) sia in contesto
// finestra (self === window nel popup), senza bisogno di export/import ESM.
if (typeof self !== "undefined") {
  self.IOC_THEME = IOC_THEME;
}