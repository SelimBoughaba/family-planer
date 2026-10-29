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
 * den unteren Rand selbst belegt. Dann entfällt der zusätzliche Abstand für den Home-Balken.
 * Schickt einmal pro Start die Maße ans Protokoll, solange wir das Verhalten noch eingrenzen.
 */
const GAP_SCRIPT = `(function(){
function probe(side){var p=document.createElement("div");p.style.cssText="position:fixed;top:0;left:0;width:1px;visibility:hidden;height:env(safe-area-inset-"+side+")";document.documentElement.appendChild(p);var v=p.offsetHeight;p.remove();return v}
function c(){try{var d=document.documentElement;var s=!!(navigator.standalone||matchMedia("(display-mode: standalone)").matches);
var full=Math.max(screen.width,screen.height);var portrait=innerHeight>innerWidth;var gap=portrait?full-innerHeight:0;
var on=s&&gap>20;d.classList.toggle("ios-gap",on);
return {standalone:s,innerH:innerHeight,innerW:innerWidth,screenH:screen.height,screenW:screen.width,vvH:window.visualViewport?Math.round(visualViewport.height):null,vvTop:window.visualViewport?Math.round(visualViewport.offsetTop):null,safeTop:probe("top"),safeBottom:probe("bottom"),gap:gap,applied:on}}catch(e){return {error:String(e)}}}
function start(){var m=c();try{if(m.standalone&&!sessionStorage.getItem("fp_vp")){sessionStorage.setItem("fp_vp","1");setTimeout(function(){var m2=c();fetch("/api/log-error",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"Bildschirmmaße (Diagnose)",detail:JSON.stringify({start:m,later:m2,ua:navigator.userAgent})})}).catch(function(){})},1500)}}catch(e){}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();addEventListener("resize",c)})();`;

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
