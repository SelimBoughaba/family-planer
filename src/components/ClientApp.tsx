"use client";

import dynamic from "next/dynamic";

// Die App lebt komplett im Browser: Uhrzeit, Gesten und später Live-Daten
const AppShell = dynamic(() => import("./AppShell").then((m) => m.AppShell), {
  ssr: false,
  loading: () => <div className="min-h-dvh" />,
});

export function ClientApp() {
  return <AppShell />;
}
