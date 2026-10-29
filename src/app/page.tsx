import { Suspense } from "react";
import { cookies } from "next/headers";
import { ClientApp } from "@/components/ClientApp";
import { LoginScreen } from "@/components/LoginScreen";
import { passwordConfigured, SESSION_COOKIE, verifySession } from "@/lib/server/session";

async function Gatekeeper() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySession(token)) return <LoginScreen ready={passwordConfigured()} />;
  return <ClientApp />;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Gatekeeper />
    </Suspense>
  );
}
