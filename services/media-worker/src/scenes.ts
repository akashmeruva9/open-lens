import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";

export type Aspect = "9:16" | "16:9";
export const SIZES: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1920, h: 1080 },
};

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
  presenterName?: string;
  /** Optional presenter portrait (fictional, disclosed). */
  presenterImage?: Image;
}

/** Register extra font files (e.g. Noto Sans Telugu in the Docker image). */
export function registerFont(path: string, family: string): boolean {
  return Boolean(GlobalFonts.registerFromPath(path, family));
}

export async function loadPresenter(path: string | undefined): Promise<Image | undefined> {
  if (!path) return undefined;
  try {
    return await loadImage(path);
  } catch {
    return undefined;
  }
}

function wrap(ctx: SKRSContext2D, text: string, maxWidth: number) {
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

function presenterBadge(ctx: SKRSContext2D, brand: Branding, x: number, y: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (brand.presenterImage) {
    ctx.drawImage(brand.presenterImage, x, y, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#1d4ed8";
    ctx.fillRect(x, y, r * 2, r * 2);
    ctx.fillStyle = "#e0f2fe";
    ctx.font = `700 ${Math.round(r)}px ${brand.fontFamily}`;
    const initial = (brand.presenterName ?? "AI").slice(0, 1);
    ctx.fillText(initial, x + r - ctx.measureText(initial).width / 2, y + r * 1.35);
  }
  ctx.restore();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.stroke();
}

export function renderSceneFrame(scene: Scene, brand: Branding, index: number, total: number, aspect: Aspect = "9:16"): Buffer {
  const { w: W, h: H } = SIZES[aspect];
  const vertical = aspect === "9:16";
  const pad = vertical ? 72 : 96;
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
  ctx.fillText("OPENLENS", pad, 130);
  ctx.fillStyle = "#94a3b8";
  ctx.font = `400 34px ${brand.fontFamily}`;
  ctx.fillText(brand.title.slice(0, vertical ? 48 : 90), pad, 190);

  // Presenter badge (fictional AI presenter, always labelled)
  const r = vertical ? 90 : 80;
  const bx = vertical ? pad : W - pad - r * 2;
  const by = vertical ? 280 : 90;
  presenterBadge(ctx, brand, bx, by, r);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = `600 34px ${brand.fontFamily}`;
  const pLabel = `${brand.presenterName ?? "Presenter"} · AI presenter`;
  ctx.fillText(pLabel, vertical ? bx + r * 2 + 28 : bx - ctx.measureText(pLabel).width - 24, by + r + 12);

  const top = vertical ? 600 : 330;
  if (scene.label) {
    ctx.fillStyle = "#fbbf24";
    ctx.font = `700 40px ${brand.fontFamily}`;
    ctx.fillText(scene.label.toUpperCase(), pad, top);
  }

  // Body text, shrink to fit
  const maxH = vertical ? 760 : 460;
  let size = vertical ? 76 : 68;
  let lines: string[] = [];
  for (; size >= 40; size -= 4) {
    ctx.font = `600 ${size}px ${brand.fontFamily}`;
    lines = wrap(ctx, scene.text, W - pad * 2);
    if (lines.length * size * 1.3 < maxH) break;
  }
  ctx.fillStyle = "#f8fafc";
  lines.forEach((l, i) => ctx.fillText(l, pad, top + 100 + i * size * 1.3));

  // Source chip
  const chipY = vertical ? H - 360 : H - 250;
  if (scene.claimIds.length) {
    ctx.fillStyle = "#1e3a5f";
    ctx.fillRect(pad, chipY, W - pad * 2, 90);
    ctx.fillStyle = "#bae6fd";
    ctx.font = `500 34px ${brand.fontFamily}`;
    ctx.fillText(`Evidence: ${scene.claimIds.join(", ")} · open the research in the OpenLens app`, pad + 24, chipY + 58);
  }

  // Progress bar
  const barY = vertical ? H - 220 : H - 130;
  ctx.fillStyle = "#334155";
  ctx.fillRect(pad, barY, W - pad * 2, 10);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(pad, barY, ((W - pad * 2) * (index + 1)) / total, 10);

  // AI disclosure on every frame
  ctx.fillStyle = "#e2e8f0";
  ctx.font = `500 30px ${brand.fontFamily}`;
  ctx.fillText(brand.disclosure.slice(0, vertical ? 70 : 120), pad, vertical ? H - 120 : H - 60);

  return canvas.toBuffer("image/png");
}
