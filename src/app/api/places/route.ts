import { NextResponse, type NextRequest } from "next/server";
import { unauthorized } from "@/lib/server/auth";
import type { PlaceHit } from "@/lib/types";

export const maxDuration = 10;

// Adresssuche über Photon (OpenStreetMap, komoot). Der Server fragt stellvertretend,
// so sieht der Dienst nur unsere Anfrage und nicht die Geräte der Familie.
const PHOTON = process.env.PLACES_URL || "https://photon.komoot.io/api/";

type Feature = {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
};

const cache = new Map<string, { at: number; hits: PlaceHit[] }>();
const TTL = 10 * 60 * 1000;

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** aus einem Treffer zwei Zeilen machen: Name und Anschrift */
function toHit(f: Feature): PlaceHit | null {
  const c = f.geometry?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return null;
  const lon = Number(c[0]);
  const lat = Number(c[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = f.properties ?? {};
  const street = [s(p.street), s(p.housenumber)].filter(Boolean).join(" ") || null;
  const town = [s(p.postcode), s(p.city) ?? s(p.town) ?? s(p.village) ?? s(p.locality)].filter(Boolean).join(" ") || null;
  const name = s(p.name);
  const country = s(p.countrycode)?.toUpperCase() === "DE" ? null : s(p.country);
  const label = name ?? street ?? town ?? s(p.state);
  if (!label) return null;
  const detail = [name ? street : null, town !== label ? town : null, s(p.district) && !street ? s(p.district) : null, country]
    .filter((x): x is string => !!x && x !== label)
    .join(", ");
  return { label, detail, lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}

export async function GET(req: NextRequest) {
  const denied = await unauthorized(req);
  if (denied) return denied;

  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ hits: [] });
  const lat = Number(p.get("lat"));
  const lon = Number(p.get("lon"));
  const bias = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);

  const key = `${q.toLowerCase()}|${bias ? `${lat.toFixed(2)},${lon.toFixed(2)}` : ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ hits: hit.hits });

  const url = new URL(PHOTON);
  url.searchParams.set("q", q);
  url.searchParams.set("lang", "de");
  url.searchParams.set("limit", "6");
  // Nähe zu bekannten Orten der Familie bevorzugen, ohne andere auszuschließen
  if (bias) {
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("zoom", "10");
    url.searchParams.set("location_bias_scale", "0.3");
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Familienplaner (private Familien-App)", Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ hits: [], error: "unavailable" }, { status: 502 });
    const data = (await res.json()) as { features?: Feature[] };
    const seen = new Set<string>();
    const hits = (data.features ?? [])
      .map(toHit)
      .filter((h): h is PlaceHit => {
        if (!h) return false;
        const k = `${h.label}|${h.detail}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 6);
    if (cache.size > 300) cache.clear();
    cache.set(key, { at: Date.now(), hits });
    return NextResponse.json({ hits }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ hits: [], error: "unavailable" }, { status: 502 });
  }
}
