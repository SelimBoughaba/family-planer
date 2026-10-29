import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { ClientApp } from "@/components/ClientApp";
import { LoginScreen } from "@/components/LoginScreen";
import { passwordConfigured, SESSION_COOKIE, verifySession } from "@/lib/server/session";

async function Gatekeeper() {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySession(token))) return <LoginScreen ready={passwordConfigured()} />;
  return <ClientApp />;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Gatekeeper />
    </Suspense>
  );
}
