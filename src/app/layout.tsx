import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Familienplaner",
  description: "Kalender, Einkauf, Essen und Aufgaben für die ganze Familie.",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Familie",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

/**
 * Erkennt den iOS-Fehler, bei dem eine Home-Bildschirm-App kürzer als das Display ist und das System
 * den unteren Rand selbst belegt. Nur wenn oben ein Sicherheitsabstand existiert, liegt die Lücke unten.
 */
const GAP_SCRIPT = `(function(){function c(){try{var d=document.documentElement;var s=navigator.standalone||matchMedia("(display-mode: standalone)").matches;var p=document.createElement("div");p.style.cssText="position:fixed;top:0;height:env(safe-area-inset-top);visibility:hidden";d.appendChild(p);var top=p.offsetHeight;p.remove();var full=Math.max(screen.width,screen.height);var gap=innerHeight>innerWidth?full-innerHeight:0;d.classList.toggle("ios-gap",!!s&&top>0&&gap>20)}catch(e){}}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",c);else c();addEventListener("resize",c)})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: GAP_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
