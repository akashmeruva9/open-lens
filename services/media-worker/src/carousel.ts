import { createCanvas } from "@napi-rs/canvas";
import { AI_DISCLOSURE } from "@openlens/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fontFor, registerDefaultFonts } from "./fonts.js";

export interface Slide { heading: string; body: string; claimIds: string[] }

const W = 1080;
const H = 1350; // Instagram 4:5 portrait

function wrap(ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>, text: string, max: number) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

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
    const head = wrap(ctx, s.heading, W - 160);
    head.forEach((l, k) => ctx.fillText(l, 80, 330 + k * size * 1.25));

    let y = 330 + head.length * size * 1.25 + 60;
    size = 46;
    let body: string[] = [];
    for (; size >= 32; size -= 2) {
      ctx.font = `500 ${size}px ${font}`;
      body = wrap(ctx, s.body, W - 160);
      if (y + body.length * size * 1.4 < H - 260) break;
    }
    ctx.fillStyle = "#f8fafc";
    body.forEach((l, k) => ctx.fillText(l, 80, y + k * size * 1.4));

    if (s.claimIds.length) {
      ctx.fillStyle = "#bae6fd";
      ctx.font = `500 28px ${font}`;
      ctx.fillText(`Evidence: ${s.claimIds.join(", ")}`, 80, H - 170);
    }
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `400 26px ${font}`;
    ctx.fillText((AI_DISCLOSURE[lang] ?? AI_DISCLOSURE.en!).slice(0, 80), 80, H - 90);

    const p = join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
    await writeFile(p, c.toBuffer("image/png"));
    paths.push(p);
  }
  return paths;
}
