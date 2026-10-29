import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ error: "push_missing" }, { status: 503 });
  return NextResponse.json({ key });
}
