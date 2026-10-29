import "server-only";
import postgres from "postgres";

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;

declare global {
  var __fpSql: ReturnType<typeof postgres> | undefined;
}

function create() {
  if (!url) throw new Error("Keine Datenbank-URL konfiguriert (POSTGRES_URL).");
  const local = /localhost|127\.0\.0\.1/.test(url);
  return postgres(url, {
    prepare: false, // nötig für den Transaction-Pooler von Supabase
    max: 3,
    idle_timeout: 20,
    ssl: local ? false : "require",
    onnotice: () => {},
  });
}

export function db() {
  if (!globalThis.__fpSql) globalThis.__fpSql = create();
  return globalThis.__fpSql;
}
