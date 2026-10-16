// Which line of a story names a specific place worth a locator map? One cheap Gemini call proposes (place, country) per line;
// a place is accepted only if its name is literally spoken in that line, then it is geocoded. Non-fatal; at most one map.
import { geocode, countryAt } from "./geo.js";
import { askGeminiJson } from "./review.js";

export interface MapPlace { place: string; country?: string; lat: number; lon: number }

const norm = (s: string) => s.normalize("NFKC").toLowerCase();

/** index -> map place for the first line that names a geocodable place. Never throws. */
export async function planMap(o: { title: string; lines: { index: number; text: string }[]; lang: string }): Promise<Record<number, MapPlace>> {
  const out: Record<number, MapPlace> = {};
  if (!o.lines.length) return out;
  try {
    const prompt = `For the news video "${o.title}", find the line that states WHERE the main event happened by naming a specific city, town, district or region.
Return JSON only: {"places":[{"index":<line number>,"place":"<name exactly as written in that line>","country":"<country name in English>"}]}
Use at most 2 entries. The "place" text must appear verbatim in that line. If no line names a specific place, return {"places":[]}.
Lines:
${o.lines.map((l) => `${l.index}: ${l.text}`).join("\n")}`;
    const r = (await askGeminiJson([{ text: prompt }], "map place", 0.004)) as { places?: { index: number; place: string; country?: string }[] };
    for (const p of Array.isArray(r?.places) ? r.places : []) {
      const line = o.lines.find((l) => l.index === p.index);
      if (!line || !p.place || !norm(line.text).includes(norm(p.place))) continue;
      const hit = await geocode(p.country ? `${p.place}, ${p.country}` : p.place);
      if (!hit || !countryAt(hit.lon, hit.lat)) continue;
      out[p.index] = { place: p.place, country: p.country, lat: hit.lat, lon: hit.lon };
      break; // one map per video
    }
  } catch (err) {
    console.warn(`[mapplan] skipped: ${String((err as Error).message).slice(0, 160)}`);
  }
  return out;
}
