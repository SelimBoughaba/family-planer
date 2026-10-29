import "server-only";

export const SYNC_TOPIC = "familienplaner-sync";

/**
 * Sendet allen offenen Geräten ein Signal "es hat sich etwas geändert".
 * Es werden keine Daten übertragen, die Geräte laden selbst über die geschützte API nach.
 */
export async function broadcastChange(scope: string, by?: string) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: SYNC_TOPIC, event: "changed", payload: { scope, by } }] }),
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // Live-Signal ist nur Komfort; die Geräte gleichen zusätzlich regelmäßig ab
  }
}
