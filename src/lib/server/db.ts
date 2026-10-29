import "server-only";
import postgres from "postgres";

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;

type Sql = ReturnType<typeof postgres>;

declare global {
  var __fpSql: Sql | undefined;
  var __fpGuarded: Sql | undefined;
}

/** Einzelne Abfrage: länger dauert bei dieser App nie etwas Legitimes */
const QUERY_TIMEOUT = 12_000;
/** Transaktionen (Wiederherstellen, Sicherung) dürfen etwas länger */
const TX_TIMEOUT = 45_000;

export class DbTimeout extends Error {
  constructor() {
    super("Datenbank antwortet nicht rechtzeitig");
  }
}

function create() {
  if (!url) throw new Error("Keine Datenbank-URL konfiguriert (POSTGRES_URL).");
  const local = /localhost|127\.0\.0\.1/.test(url);
  return postgres(url, {
    prepare: false, // nötig für den Transaction-Pooler von Supabase
    max: 3,
    idle_timeout: 20,
    max_lifetime: 10 * 60,
    connect_timeout: 8,
    ssl: local ? false : "require",
    onnotice: () => {},
  });
}

/**
 * Hängt eine Verbindung, würde der Pool sonst für immer blockieren und jede weitere Anfrage
 * dieser Instanz mitziehen. Deshalb: Pool verwerfen, nächste Anfrage baut frisch auf.
 */
function reset(stale: Sql) {
  if (globalThis.__fpSql === stale) {
    globalThis.__fpSql = undefined;
    globalThis.__fpGuarded = undefined;
  }
  void stale.end({ timeout: 0 }).catch(() => {});
}

function guard<T>(run: () => PromiseLike<T>, ms: number, pool: Sql): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reset(pool);
      reject(new DbTimeout());
    }, ms);
    run().then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Wie postgres(), aber jede Abfrage und Transaktion hat eine harte Zeitgrenze */
function guarded(pool: Sql): Sql {
  return new Proxy(pool, {
    apply(target, thisArg, args) {
      const q = Reflect.apply(target, thisArg, args);
      // Abfragen starten erst bei then(); Fragmente in anderen Abfragen werden nie awaited
      if (q && typeof q.then === "function") {
        const original = q.then.bind(q);
        let p: Promise<unknown> | null = null;
        q.then = (a?: (v: unknown) => unknown, b?: (e: unknown) => unknown) => {
          p ??= guard(() => original((v: unknown) => v), QUERY_TIMEOUT, pool);
          return p.then(a, b);
        };
      }
      return q;
    },
    get(target, prop, receiver) {
      if (prop === "begin") {
        return (...args: unknown[]) => guard(() => (target.begin as (...a: unknown[]) => PromiseLike<unknown>)(...args), TX_TIMEOUT, pool);
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  }) as Sql;
}

export function db() {
  if (!globalThis.__fpSql) {
    globalThis.__fpSql = create();
    globalThis.__fpGuarded = guarded(globalThis.__fpSql);
  }
  return globalThis.__fpGuarded!;
}
