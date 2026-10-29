// Legt den PDF-Arbeiter für die Vorschaubilder der Pinnwand in public/ ab (gleiche Version wie das Paket)
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync(new URL("../public/vendor/", import.meta.url), { recursive: true });
copyFileSync(new URL("../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), new URL("../public/vendor/pdf.worker.min.mjs", import.meta.url));
console.log("[assets] PDF-Arbeiter kopiert");
