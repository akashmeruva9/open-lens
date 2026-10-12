import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { uiStrings, wrapText } from "@openlens/config";

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
  /** Outlet names behind the claims (shown in the source chip instead of raw ids). */
  sources?: string[];
}

export interface Branding {
  title: string;
  /** Required disclosure shown on every frame. */
  disclosure: string;
  fontFamily: string;
  /** BCP-47 language, used for word-aware line breaking (CJK/Thai have no spaces). */
  lang?: string;
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

function wrap(ctx: SKRSContext2D, text: string, maxWidth: number, lang = "en") {
  return wrapText(text, lang, maxWidth, (t) => ctx.measureText(t).width);
}

/** Truncate to a pixel width on grapheme boundaries (safe for CJK width and Thai combining marks). */
function fitWidth(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = "";
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    if (ctx.measureText(`${out}${segment}…`).width > maxWidth) break;
    out += segment;
  }
  return `${out}…`;
}

const C = {
  navy: "#0b1220",
  navy2: "#16243f",
  card: "rgba(11,18,32,0.82)",
  accent: "#38bdf8",
  amber: "#fbbf24",
  text: "#f8fafc",
  muted: "#94a3b8",
};

/** Draw an image to cover a box (centre-top crop so faces stay in frame). */
function drawCover(ctx: SKRSContext2D, img: Image, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  const sx = (img.width - sw) / 2;
  const sy = Math.max(0, (img.height - sh) * 0.15);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw a wrapped line, highlighting numbers (digits, %, currency) in the accent colour. */
function drawHighlighted(ctx: SKRSContext2D, line: string, x: number, y: number, base: string, hi: string) {
  let cx = x;
  for (const part of line.split(/(\d[\d.,:/%]*)/)) {
    if (!part) continue;
    ctx.fillStyle = /^\d/.test(part) ? hi : base;
    ctx.fillText(part, cx, y);
    cx += ctx.measureText(part).width;
  }
}

function pill(ctx: SKRSContext2D, text: string, x: number, y: number, font: string, bg: string, fg: string, padX = 22, h = 52): number {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.fillText(text, x + padX, y + h * 0.68);
  return w;
}

function background(ctx: SKRSContext2D, brand: Branding, W: number, H: number, vertical: boolean) {
  // Solid base so the portrait fade has no visible seam.
  ctx.fillStyle = C.navy;
  ctx.fillRect(0, 0, W, H);
  const img = brand.presenterImage;
  if (vertical) {
    const ph = 1040;
    if (img) drawCover(ctx, img, 0, 0, W, ph);
    const f = ctx.createLinearGradient(0, ph - 360, 0, ph + 20);
    f.addColorStop(0, "rgba(11,18,32,0)");
    f.addColorStop(1, C.navy);
    ctx.fillStyle = f;
    ctx.fillRect(0, ph - 360, W, 380);
  } else {
    const pw = 1040;
    if (img) drawCover(ctx, img, 0, 0, pw, H);
    const f = ctx.createLinearGradient(pw - 360, 0, pw + 20, 0);
    f.addColorStop(0, "rgba(11,18,32,0)");
    f.addColorStop(1, C.navy);
    ctx.fillStyle = f;
    ctx.fillRect(pw - 360, 0, 380, H);
  }
  if (!img) {
    // No portrait: large initial so the layout never looks empty.
    ctx.fillStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.arc(vertical ? W / 2 : 480, vertical ? 480 : H / 2 - 40, 220, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e0f2fe";
    ctx.font = `700 240px ${brand.fontFamily}`;
    const ini = (brand.presenterName ?? "AI").slice(0, 1);
    ctx.fillText(ini, (vertical ? W / 2 : 480) - ctx.measureText(ini).width / 2, (vertical ? 480 : H / 2 - 40) + 85);
  }
}

export function renderSceneFrame(scene: Scene, brand: Branding, index: number, total: number, aspect: Aspect = "9:16"): Buffer {
  const { w: W, h: H } = SIZES[aspect];
  const vertical = aspect === "9:16";
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const ui = uiStrings(brand.lang ?? "en");
  const pad = vertical ? 60 : 72;
  const ff = brand.fontFamily;

  background(ctx, brand, W, H, vertical);

  // Logo bug (top-left) and AI-presenter tag (top-right)
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.arc(pad + 26, pad + 26, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.navy;
  ctx.beginPath();
  ctx.arc(pad + 26, pad + 26, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.text;
  ctx.font = `800 44px ${ff}`;
  ctx.fillText("OPENLENS", pad + 68, pad + 41);
  const tag = ui.aiPresenter;
  ctx.font = `700 28px ${ff}`;
  const tagW = ctx.measureText(tag).width + 44;
  const tagX = (vertical ? W - pad : 1040 - 40) - tagW;
  pill(ctx, tag, tagX, pad, `700 28px ${ff}`, "rgba(251,191,36,0.95)", C.navy, 22, 52);

  // Layout regions
  const cardX = vertical ? pad : 1090;
  const cardW = vertical ? W - pad * 2 : W - 1090 - pad;
  const cardY = vertical ? 1000 : 170;
  const cardH = vertical ? 470 : 600;

  // Lower third: presenter name plate over the portrait
  const ltY = vertical ? 880 : H - 330;
  const ltX = vertical ? pad : pad;
  ctx.fillStyle = "rgba(11,18,32,0.78)";
  roundRect(ctx, ltX, ltY, vertical ? W - pad * 2 : 900, 110, 14);
  ctx.fill();
  ctx.fillStyle = C.accent;
  ctx.fillRect(ltX, ltY, 10, 110);
  ctx.fillStyle = C.text;
  ctx.font = `800 46px ${ff}`;
  ctx.fillText(`${brand.presenterName ?? ""}`, ltX + 34, ltY + 50);
  ctx.fillStyle = C.muted;
  ctx.font = `500 30px ${ff}`;
  ctx.fillText(fitWidth(ctx, brand.title, (vertical ? W - pad * 2 : 900) - 60), ltX + 34, ltY + 92);

  // Fact card
  ctx.fillStyle = C.card;
  roundRect(ctx, cardX, cardY, cardW, cardH, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(56,189,248,0.35)";
  ctx.lineWidth = 2;
  roundRect(ctx, cardX, cardY, cardW, cardH, 22);
  ctx.stroke();
  const inner = cardW - 76;
  let textTop = cardY + 54;
  if (scene.label) {
    pill(ctx, scene.label.toUpperCase(), cardX + 38, cardY + 34, `800 32px ${ff}`, C.amber, C.navy, 20, 52);
    textTop = cardY + 140;
  }
  const maxH = cardH - (textTop - cardY) - 40;
  let size = vertical ? 64 : 60;
  let lines: string[] = [];
  for (; size >= 34; size -= 4) {
    ctx.font = `700 ${size}px ${ff}`;
    lines = wrap(ctx, scene.text, inner, brand.lang);
    if (lines.length * size * 1.3 <= maxH) break;
  }
  ctx.font = `700 ${size}px ${ff}`;
  lines.forEach((l, i) => drawHighlighted(ctx, l, cardX + 38, textTop + size + i * size * 1.3, C.text, C.amber));

  // Source chip: outlet names (falls back to claim ids)
  const all = scene.sources?.length ? scene.sources : [];
  ctx.font = `600 28px ${ff}`;
  const joined = all.length ? all.join(" · ") : scene.claimIds.join(", ");
  const names = all.length > 1 && ctx.measureText(`${ui.evidence}: ${joined}`).width > cardW - 56 ? `${all[0]} +${all.length - 1}` : joined;
  const chipY = vertical ? cardY + cardH + 24 : cardY + cardH + 22;
  if (names) {
    ctx.fillStyle = "#1e3a5f";
    roundRect(ctx, cardX, chipY, cardW, 78, 16);
    ctx.fill();
    ctx.fillStyle = "#bae6fd";
    ctx.font = `600 28px ${ff}`;
    ctx.fillText(fitWidth(ctx, `${ui.evidence}: ${names}`, cardW - 56), cardX + 28, chipY + 50);
  }

  // Ticker strip: progress + disclosure on every frame (kept clear of the Reels/Shorts UI zone)
  const tickY = vertical ? 1632 : H - 118;
  ctx.fillStyle = "rgba(2,6,23,0.9)";
  ctx.fillRect(0, tickY, W, H - tickY);
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, tickY, W, 8);
  ctx.fillStyle = C.accent;
  ctx.fillRect(0, tickY, (W * (index + 1)) / total, 8);
  ctx.fillStyle = "#e2e8f0";
  let dSize = 28;
  let dLines: string[] = [];
  for (; dSize >= 18; dSize -= 2) {
    ctx.font = `500 ${dSize}px ${ff}`;
    dLines = wrap(ctx, brand.disclosure, W - pad * 2, brand.lang);
    if (dLines.length <= 2) break;
  }
  const dTop = tickY + (vertical ? 58 : 46) - (dLines.length - 1) * dSize * 0.5;
  dLines.forEach((l, i) => ctx.fillText(l, pad, dTop + i * dSize * 1.3));

  return canvas.toBuffer("image/png");
}
