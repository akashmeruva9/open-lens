import { createCanvas } from "@napi-rs/canvas";
import { AI_DISCLOSURE, uiStrings, wrapText } from "@openlens/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fontFor, registerDefaultFonts } from "./fonts.js";

export interface Slide { heading: string; body: string; claimIds: string[] }

const W = 1080;
const H = 1350; // Instagram 4:5 portrait

/** Render Instagram carousel slides to PNG files; returns paths in slide order. */
export async function renderCarouselSlides(slides: Slide[], lang: string, title: string, outDir: string): Promise<string[]> {
  registerDefaultFonts();
  await mkdir(outDir, { recursive: true });
  const font = fontFor(lang);
  const paths: string[] = [];
  for (const [i, s] of slides.entries()) {
    const c = createCanvas(W, H);
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0b1220");
    g.addColorStop(1, "#1e3a5f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#7dd3fc";
    ctx.font = `700 40px ${font}`;
    ctx.fillText("OPENLENS", 80, 120);
    ctx.fillStyle = "#94a3b8";
    ctx.font = `400 30px ${font}`;
    ctx.fillText(`${i + 1}/${slides.length} · ${title}`.slice(0, 60), 80, 170);

    ctx.fillStyle = "#fbbf24";
    let size = 64;
    ctx.font = `700 ${size}px ${font}`;
    const head = wrapText(s.heading, lang, W - 160, (t) => ctx.measureText(t).width);
    head.forEach((l, k) => ctx.fillText(l, 80, 330 + k * size * 1.25));

    let y = 330 + head.length * size * 1.25 + 60;
    size = 46;
    let body: string[] = [];
    for (; size >= 32; size -= 2) {
      ctx.font = `500 ${size}px ${font}`;
      body = wrapText(s.body, lang, W - 160, (t) => ctx.measureText(t).width);
      if (y + body.length * size * 1.4 < H - 260) break;
    }
    ctx.fillStyle = "#f8fafc";
    body.forEach((l, k) => ctx.fillText(l, 80, y + k * size * 1.4));

    if (s.claimIds.length) {
      ctx.fillStyle = "#bae6fd";
      ctx.font = `500 28px ${font}`;
      ctx.fillText(`${uiStrings(lang).evidence}: ${s.claimIds.join(", ")}`, 80, H - 190);
    }
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `400 26px ${font}`;
    const disc = wrapText(AI_DISCLOSURE[lang] ?? AI_DISCLOSURE.en!, lang, W - 160, (t) => ctx.measureText(t).width);
    disc.slice(0, 3).forEach((l, k) => ctx.fillText(l, 80, H - 120 + k * 34));

    const p = join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
    await writeFile(p, c.toBuffer("image/png"));
    paths.push(p);
  }
  return paths;
}
