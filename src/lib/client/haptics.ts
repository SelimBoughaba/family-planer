"use client";

/**
 * Spürbare Rückmeldung. Android kennt navigator.vibrate; Safari auf dem iPhone (ab iOS 18)
 * gibt beim Umschalten eines Schalters (input switch) ein kurzes Tippen aus. Das nutzen wir unsichtbar.
 * Muss aus einer Nutzeraktion heraus aufgerufen werden (Tippen, Loslassen).
 */
let label: HTMLLabelElement | null = null;

export function haptic() {
  if (typeof document === "undefined") return;
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof navigator.vibrate === "function" && !/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      navigator.vibrate(8);
      return;
    }
    if (!label) {
      label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label.appendChild(input);
      label.setAttribute("aria-hidden", "true");
      Object.assign(label.style, { position: "fixed", width: "1px", height: "1px", overflow: "hidden", opacity: "0", pointerEvents: "none", left: "-10px", top: "0" });
      document.body.appendChild(label);
    }
    label.click();
  } catch {}
}
