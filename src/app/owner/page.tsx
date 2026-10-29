import { Suspense } from "react";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { OwnerApp, OwnerGate } from "@/components/owner/OwnerApp";
import { OWNER_COOKIE, ownerConfigured, SESSION_COOKIE, verifyOwnerSession, verifySession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Verwaltung", robots: { index: false, follow: false } };

async function Gate() {
  const jar = await cookies();
  if (!(await verifySession(jar.get(SESSION_COOKIE)?.value))) return <OwnerGate state="family" />;
  if (!ownerConfigured()) return <OwnerGate state="missing" />;
  if (!verifyOwnerSession(jar.get(OWNER_COOKIE)?.value)) return <OwnerGate state="login" />;
  return <OwnerApp />;
}

export default function OwnerPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Gate />
    </Suspense>
  );
}
