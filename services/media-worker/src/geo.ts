// Locator-map support: country outlines (Natural Earth, public domain, data/geo/countries.json) and a cached place
// lookup (OpenStreetMap Nominatim, 1 request/second, identifying User-Agent, results cached on disk).
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DATA_DIR } from "./genspend.js";

export interface Country { n: string; i: string; p: [number, number][][][] }
export interface Place { name: string; lat: number; lon: number }

let countries: Country[] | undefined;
export function loadCountries(): Country[] {
  countries ??= JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../data/geo/countries.json"), "utf8")) as Country[];
  return countries;
}

function inRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The country polygon (part) that contains the point, or the nearest country part within 3 degrees (coast, small islands). */
export function countryAt(lon: number, lat: number): { country: Country; part: [number, number][] } | undefined {
  let near: { country: Country; part: [number, number][]; d: number } | undefined;
  for (const c of loadCountries())
    for (const poly of c.p) {
      const ring = poly[0]!;
      if (inRing(lon, lat, ring)) return { country: c, part: ring };
      for (const [x, y] of ring) {
        const d = Math.hypot(x - lon, y - lat);
        if (d < 3 && (!near || d < near.d)) near = { country: c, part: ring, d };
      }
    }
  return near ? { country: near.country, part: near.part } : undefined;
}

/** Bounding box of a ring plus the pin, widened to at least `minSpan` degrees and padded so the outline does not touch the card edge. */
export function viewBox(part: [number, number][], pin: { lon: number; lat: number }, minSpan = 6): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = Math.min(pin.lon, ...part.map((p) => p[0])), x1 = Math.max(pin.lon, ...part.map((p) => p[0]));
  const y0 = Math.min(pin.lat, ...part.map((p) => p[1])), y1 = Math.max(pin.lat, ...part.map((p) => p[1]));
  const padX = Math.max(0, (minSpan - (x1 - x0)) / 2) + (x1 - x0) * 0.12, padY = Math.max(0, (minSpan - (y1 - y0)) / 2) + (y1 - y0) * 0.12;
  return { x0: x0 - padX, x1: x1 + padX, y0: y0 - padY, y1: y1 + padY };
}

const UA = `OpenLens/0.1 (${process.env.OPENLENS_PUBLIC_URL?.trim() || "https://github.com/akashmeruva9/open-lens"}; newsroom locator maps)`;
const CACHE = () => resolve(DATA_DIR, "geocode-cache.json");
let lastCall = 0;

/** Nominatim lookup with an on-disk cache and the 1 request/second policy. Returns undefined when nothing is found. */
export async function geocode(query: string): Promise<Place | undefined> {
  const key = query.normalize("NFKC").trim().toLowerCase();
  const cache: Record<string, Place | null> = JSON.parse(await readFile(CACHE(), "utf8").catch(() => "{}"));
  if (key in cache) return cache[key] ?? undefined;
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: "json", limit: "1", "accept-language": "en" })}`, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const hit = ((await res.json()) as { lat: string; lon: string }[])[0];
  const place = hit ? { name: query, lat: Number(hit.lat), lon: Number(hit.lon) } : null;
  cache[key] = place;
  await mkdir(dirname(CACHE()), { recursive: true });
  await writeFile(CACHE(), JSON.stringify(cache));
  return place ?? undefined;
}
