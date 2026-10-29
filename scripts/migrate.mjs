// Spielt db/schema.sql gegen die Datenbank ein. Läuft vor jedem Build.
// Ohne Datenbank-URL (z. B. lokal ohne .env) wird übersprungen.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!url) {
  console.log("[migrate] Keine Datenbank-URL gesetzt, Migration übersprungen.");
  process.exit(0);
}

const local = /localhost|127\.0\.0\.1|host=\/tmp/.test(url);
const sql = postgres(url, {
  prepare: false,
  max: 1,
  ssl: local ? false : "require",
  onnotice: () => {},
  connect_timeout: 20,
});

try {
  const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  await sql.unsafe(schema);
  console.log("[migrate] Schema ist aktuell.");
} catch (err) {
  console.error("[migrate] Fehler:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
