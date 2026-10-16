// "Image desk": real, licensed file photos for the people / organisations / objects a story names, the way a newsroom
// uses file photos. Search Wikimedia Commons, keep only reusable licences, have Gemini look at the picture to confirm it
// actually shows the subject, then show it with a visible credit line ("File photo · author, licence, Wikimedia Commons").
// Never used as "what happened": only on a line whose spoken text names the subject. Non-fatal: no match = no photo.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DATA_DIR, assertBudget, exists, logSpend, sha } from "./genspend.js";
import { askGeminiJson } from "./review.js";

const UA = `OpenLens/0.1 (${process.env.OPENLENS_PUBLIC_URL?.trim() || "https://github.com/akashmeruva9/open-lens"}; newsroom file-photo desk)`;
const VISION_USD = 0.004;

export interface Candidate {
  title: string;
  pageUrl: string;
  imageUrl: string;
  width: number;
  height: number;
  license: string;
  author: string;
  restrictions: string;
}

/** Reusable with attribution: public domain, CC0, CC BY, CC BY-SA, government open licences. No NC / ND / fair use. */
export function licenseOk(license: string): boolean {
  const l = license.toLowerCase().trim();
  if (!l || /(^|[\s-])(nc|nd)([\s-]|$)|non-?commercial|no[ -]?deriv|fair use|all rights reserved|copyrighted/.test(l)) return false;
  return /^(public domain|pd\b|pd-|cc0|cc[ -]by\b|cc[ -]by[ -]sa|godl|ogl|open government|u\.?s\. government|attribution)/.test(l);
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();

/** Credit line for the screen: "Author, CC BY 4.0, Wikimedia Commons" (public-domain files: "Author, public domain, ..."). */
export function creditLine(c: Pick<Candidate, "author" | "license">): string {
  // Short enough to fit on one line on screen: first credited party only (before " / " or " and "), at most 30 characters.
  const author = stripHtml(c.author).replace(/https?:\/\/\S+/g, (u) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")).split(/\s+\/\s+|\s+and\s+/)[0]!.trim().slice(0, 30) || "unknown author";
  return `${author}, ${c.license}, Wikimedia Commons`;
}

export async function searchCommons(query: string, limit = 8): Promise<Candidate[]> {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  const q: Record<string, string> = { action: "query", generator: "search", gsrnamespace: "6", gsrsearch: `${query} filetype:bitmap`, gsrlimit: String(limit),
    prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1280", format: "json" };
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  const res = await fetch(u, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`commons search ${res.status}`);
  const pages = ((await res.json()) as { query?: { pages?: Record<string, { index?: number; title: string; imageinfo?: Record<string, any>[] }> } }).query?.pages ?? {};
  return Object.values(pages).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).flatMap((p) => {
    const ii = p.imageinfo?.[0];
    if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime ?? "")) return [];
    const m = ii.extmetadata ?? {};
    const license = stripHtml(m.LicenseShortName?.value ?? "");
    const restrictions = stripHtml(m.Restrictions?.value ?? "");
    if (!licenseOk(license) || /trademark/i.test(restrictions) || (ii.width ?? 0) < 800) return [];
    return [{ title: p.title, pageUrl: ii.descriptionurl, imageUrl: ii.thumburl ?? ii.url, width: ii.width, height: ii.height, license, author: m.Artist?.value ?? m.Credit?.value ?? "", restrictions }];
  });
}

export interface Subject { name: string; query: string; kind: "person" | "organisation" | "object" | "place"; lineIndex: number }

/** Subjects that the spoken lines actually name. People only when they are public officials/figures named in the line. */
export async function findSubjects(title: string, lines: { index: number; text: string }[]): Promise<Subject[]> {
  const prompt = `You are a newsroom picture editor. For the news video "${title}", list up to 4 subjects worth a file photo.
A subject must be NAMED in the text of the line you attach it to (use that line's number). Allowed: public officials or well-known public figures who are named in the line, organisations, specific objects/equipment, well-known places.
Not allowed: private individuals, victims, suspects, children, anyone not named in the line.
For each give "name" (as spoken), "query" (a Wikimedia Commons search query, e.g. "Volodymyr Zelensky", "Starlink satellite dish"), "kind" (person|organisation|object|place), "lineIndex".
Return JSON only: {"subjects":[...]}.
Lines:
${lines.map((l) => `${l.index}: ${l.text}`).join("\n")}`;
  const r = (await askGeminiJson([{ text: prompt }], "file-photo subjects")) as { subjects?: Subject[] };
  const norm = (s: string) => s.normalize("NFKC").toLowerCase();
  return (Array.isArray(r?.subjects) ? r.subjects : []).filter((s) => {
    const line = lines.find((l) => l.index === s.lineIndex);
    if (!line || !s.name || !s.query) return false;
    // The name (or its last word, e.g. a surname) must literally be spoken in the line.
    const words = s.name.split(/\s+/).filter((w) => w.length > 2);
    return norm(line.text).includes(norm(s.name)) || words.some((w) => norm(line.text).includes(norm(w)));
  }).slice(0, 4);
}

export interface Verdict { depicts_subject?: boolean; is_illustration_or_cartoon?: boolean; readable_text_or_logos?: boolean; other_identifiable_people?: boolean; quality?: number }

/** Accept only a clear, real photo of the subject. */
export function verdictOk(v: Verdict, kind: Subject["kind"]): boolean {
  if (!v || v.depicts_subject !== true || v.is_illustration_or_cartoon === true || (v.quality ?? 0) < 3) return false;
  if (kind !== "person" && (v.other_identifiable_people === true || v.readable_text_or_logos === true)) return false;
  return true;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function looksRight(img: Buffer, subject: Subject): Promise<Verdict> {
  await assertBudget(VISION_USD, `photo check ${subject.name}`);
  const prompt = `Newsroom photo check. Subject wanted: "${subject.name}" (${subject.kind}).
Look at the image and return JSON only: {"depicts_subject": <true only if this is clearly a real photo of exactly this subject>, "is_illustration_or_cartoon": bool, "readable_text_or_logos": bool, "other_identifiable_people": bool, "quality": <1-5 sharpness, framing, suitability as a news backdrop>}.
Be strict: a different person, a crowd, a document, a map or a poster is not a match.`;
  const v = (await askGeminiJson([{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: img.toString("base64") } }], `photo check ${subject.name}`, VISION_USD)) as Verdict;
  return v;
}

export interface FilePhoto { file: string; credit: string; source: string; subject: string }

/** lineIndex -> file photo, for lines whose text names a subject we could illustrate with a verified, licensed photo. Never throws. */
export async function planFilePhotos(o: { storyId: string; title: string; lines: { index: number; text: string }[]; max: number }): Promise<Record<number, FilePhoto>> {
  const out: Record<number, FilePhoto> = {};
  if (o.max <= 0 || !o.lines.length) return out;
  let subjects: Subject[] = [];
  try {
    subjects = await findSubjects(o.title, o.lines);
  } catch (err) {
    console.warn(`[imagedesk] subject planning failed: ${String((err as Error).message).slice(0, 160)}`);
    return out;
  }
  const dir = resolve(DATA_DIR, "imagedesk", o.storyId.replace(/[^\w.-]/g, "_"));
  for (const s of subjects) {
    if (Object.keys(out).length >= o.max || out[s.lineIndex]) continue;
    try {
      const cands = (await searchCommons(s.query, 8)).slice(0, 5);
      for (const c of cands) {
        const img = await download(c.imageUrl);
        if (!verdictOk(await looksRight(img, s), s.kind)) continue;
        await mkdir(dir, { recursive: true });
        const file = resolve(dir, `line${s.lineIndex}-${sha(c.imageUrl).slice(0, 10)}.jpg`);
        if (!(await exists(file))) await writeFile(file, img);
        const credit = creditLine(c);
        await writeFile(file.replace(/\.jpg$/, ".json"), JSON.stringify({ subject: s, source: c.pageUrl, credit, license: c.license, title: c.title }, null, 2));
        await logSpend({ kind: "file-photo", model: "commons+gemini-check", usd: 0, note: `${o.storyId}/line${s.lineIndex} ${s.name}: ${c.title}` });
        out[s.lineIndex] = { file, credit, source: c.pageUrl, subject: s.name };
        break;
      }
    } catch (err) {
      console.warn(`[imagedesk] ${s.name} skipped: ${String((err as Error).message).slice(0, 160)}`);
    }
  }
  return out;
}
