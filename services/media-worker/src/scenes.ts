import { createCanvas, GlobalFonts } from "@napi-rs/canvas";

export const W = 1080;
export const H = 1920;

export interface Scene {
  /** Caption text shown on screen (already localized). */
  text: string;
  /** Seconds the scene stays on screen (from TTS timing when available). */
  seconds: number;
  /** Claim ids this line is derived from — rendered as a source chip. */
  claimIds: string[];
  /** Small header, e.g. "WHAT WE KNOW". */
  label?: string;
}

export interface Branding {
  title: string;
  /** Required disclosure shown on every frame. */
  disclosure: string;
  fontFamily: string;
}

/** Register extra font files (e.g. Noto Sans Telugu in the Docker image). */
export function registerFont(path: string, family: string): boolean {
  return Boolean(GlobalFonts.registerFromPath(path, family));
}

function wrap(ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>, text: string, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function renderSceneFrame(scene: Scene, brand: Branding, index: number, total: number): Buffer {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1220");
  g.addColorStop(1, "#16243f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = "#7dd3fc";
  ctx.font = `700 44px ${brand.fontFamily}`;
  ctx.fillText("OPENLENS", 72, 130);
  ctx.fillStyle = "#94a3b8";
  ctx.font = `400 34px ${brand.fontFamily}`;
  ctx.fillText(brand.title, 72, 190);

  if (scene.label) {
    ctx.fillStyle = "#fbbf24";
    ctx.font = `700 40px ${brand.fontFamily}`;
    ctx.fillText(scene.label.toUpperCase(), 72, 560);
  }

  // Body text, shrink to fit
  let size = 76;
  let lines: string[] = [];
  for (; size >= 44; size -= 4) {
    ctx.font = `600 ${size}px ${brand.fontFamily}`;
    lines = wrap(ctx, scene.text, W - 144);
    if (lines.length * size * 1.3 < 760) break;
  }
  ctx.fillStyle = "#f8fafc";
  lines.forEach((l, i) => ctx.fillText(l, 72, 660 + i * size * 1.3));

  // Source chip
  if (scene.claimIds.length) {
    ctx.fillStyle = "#1e3a5f";
    ctx.fillRect(72, H - 360, W - 144, 90);
    ctx.fillStyle = "#bae6fd";
    ctx.font = `500 34px ${brand.fontFamily}`;
    ctx.fillText(`Sources: ${scene.claimIds.join(", ")} · read the research in the app`, 96, H - 302);
  }

  // Progress bar
  ctx.fillStyle = "#334155";
  ctx.fillRect(72, H - 220, W - 144, 10);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(72, H - 220, ((W - 144) * (index + 1)) / total, 10);

  // AI disclosure on every frame
  ctx.fillStyle = "#e2e8f0";
  ctx.font = `500 32px ${brand.fontFamily}`;
  ctx.fillText(brand.disclosure, 72, H - 120);

  return canvas.toBuffer("image/png");
}
