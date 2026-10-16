import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { uiStrings } from "@openlens/config";
import type { Beat } from "./beats.js";
import { drawCover, fitWidth, roundRect, wrap } from "./draw.js";
import { explainerLayout, renderExplainerFrame } from "./explainer.js";

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
  /** "beat": social explainer (beat card + captions + presenter picture-in-picture); the default whenever `beat` is set.
   *  "anchor": presenter full-frame with a TV headline bar. "split": presenter beside a fact card (older TV look). */
  layout?: "beat" | "anchor" | "split";
  /** What the main card shows for this line (see beats.ts / pickBeat). */
  beat?: Beat;
  /** Optional supplied illustration for this line (e.g. an AI image). Drawn full-bleed with a scrim and an
   *  "AI-generated illustration" label when `beat.kind === "illustration"`. `image` is loaded from `imagePath` by renderVideo. */
  imagePath?: string;
  image?: Image;
  /** Credit line for a real file photo (e.g. "president.gov.ua, CC BY 4.0, Wikimedia Commons"). When set, the tag reads "File photo · credit" instead of the AI label. */
  credit?: string;
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
  /** Optional looping idle clip of the presenter (silent, 9:16). Composited by ffmpeg under the overlay. */
  presenterVideo?: string;
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

const C = {
  navy: "#0b1220",
  navy2: "#16243f",
  card: "rgba(11,18,32,0.82)",
  accent: "#38bdf8",
  amber: "#fbbf24",
  text: "#f8fafc",
  muted: "#94a3b8",
};

/** Where the presenter sits for each layout/shape (also used to place the idle video in ffmpeg). */
export function portraitBox(layout: "beat" | "anchor" | "split" | "hook", aspect: Aspect): { x: number; y: number; w: number; h: number } {
  const { w: W, h: H } = SIZES[aspect];
  if (layout === "beat") return explainerLayout(aspect).pip;
  if (layout === "hook") return explainerLayout(aspect).hook;
  if (aspect === "9:16") return layout === "anchor" ? { x: 0, y: 0, w: W, h: 1260 } : { x: 0, y: 0, w: W, h: 1040 };
  return layout === "anchor" ? { x: (W - 1100) / 2, y: 0, w: 1100, h: H } : { x: 0, y: 0, w: 1040, h: H };
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

function background(ctx: SKRSContext2D, brand: Branding, W: number, H: number, vertical: boolean, overlay = false) {
  // Solid base so the portrait fade has no visible seam.
  if (!overlay) {
    ctx.fillStyle = C.navy;
    ctx.fillRect(0, 0, W, H);
  }
  const img = overlay ? undefined : brand.presenterImage;
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
  if (!img && !overlay) {
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

/** overlay=true renders a transparent text/graphics layer (no base, no portrait) to composite over the presenter video. */
export function renderSceneFrame(scene: Scene, brand: Branding, index: number, total: number, aspect: Aspect = "9:16", overlay = false): Buffer {
  if (sceneLayout(scene) === "beat") return renderExplainerFrame(scene, brand, index, total, aspect, overlay);
  return scene.layout === "anchor" ? renderAnchor(scene, brand, index, total, aspect, overlay) : renderSplit(scene, brand, index, total, aspect, overlay);
}

/** Effective layout: explicit `layout`, else "beat" when a beat is set, else the older split card. */
export function sceneLayout(scene: Scene): "beat" | "anchor" | "split" {
  return scene.layout ?? (scene.beat ? "beat" : "split");
}

/** First sentence of a scene as a TV headline (works for । and 。 too). */
export function headlineOf(text: string): string {
  const m = /^(.+?[.!?।。！？])(\s|$)/u.exec(text.trim());
  return (m?.[1] ?? text).trim();
}

/** Shared chrome: logo bug, AI tag, disclosure ticker with progress. */
function chrome(ctx: SKRSContext2D, brand: Branding, W: number, H: number, vertical: boolean, index: number, total: number, tagRight: number) {
  const ui = uiStrings(brand.lang ?? "en");
  const pad = vertical ? 60 : 72;
  const ff = brand.fontFamily;
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
}

/** TV look: presenter full-frame, white headline bar with a source box on the left. */
function renderAnchor(scene: Scene, brand: Branding, index: number, total: number, aspect: Aspect, overlay = false): Buffer {
  const { w: W, h: H } = SIZES[aspect];
  const vertical = aspect === "9:16";
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const ui = uiStrings(brand.lang ?? "en");
  const ff = brand.fontFamily;
  const pad = vertical ? 60 : 72;

  if (!overlay) {
    ctx.fillStyle = C.navy;
    ctx.fillRect(0, 0, W, H);
  }
  const img = brand.presenterImage;
  // Overlay mode still draws the edge fades; the presenter video itself is composited by ffmpeg underneath.
  if (img || overlay) {
    if (vertical) {
      const ph = 1260;
      if (img && !overlay) drawCover(ctx, img, 0, 0, W, ph);
      const f = ctx.createLinearGradient(0, ph - 220, 0, ph);
      f.addColorStop(0, "rgba(11,18,32,0)");
      f.addColorStop(1, C.navy);
      ctx.fillStyle = f;
      ctx.fillRect(0, ph - 220, W, 220);
    } else {
      const pw = 1100, px = (W - pw) / 2;
      if (img && !overlay) drawCover(ctx, img, px, 0, pw, H);
      for (const [x0, x1, a, b] of [[px, px + 340, 1, 0], [px + pw - 340, px + pw, 0, 1]] as const) {
        const f = ctx.createLinearGradient(x0, 0, x1, 0);
        f.addColorStop(0, `rgba(11,18,32,${a})`);
        f.addColorStop(1, `rgba(11,18,32,${b})`);
        ctx.fillStyle = f;
        ctx.fillRect(x0, 0, x1 - x0, H);
      }
    }
  }
  chrome(ctx, brand, W, H, vertical, index, total, W - pad);

  // Presenter name pill above the bar
  const barH = vertical ? 360 : 150;
  const barY = vertical ? 1250 : H - 118 - 40 - barH;
  const barX = pad;
  const barW = W - pad * 2;
  pill(ctx, brand.presenterName ?? "", barX, barY - 66, `800 32px ${ff}`, C.navy2, C.text, 22, 52);

  // Headline bar: source box + white headline strip
  const srcW = vertical ? barW : 560;
  const srcH = vertical ? 104 : barH;
  const name = scene.sources?.[0] ?? "OpenLens";
  ctx.fillStyle = C.navy2;
  roundRect(ctx, barX, barY, srcW, srcH, 10);
  ctx.fill();
  ctx.fillStyle = C.accent;
  ctx.fillRect(barX, barY, 8, srcH);
  ctx.fillStyle = C.muted;
  ctx.font = `600 24px ${ff}`;
  ctx.fillText(ui.evidence.toUpperCase(), barX + 28, barY + (vertical ? 36 : 52));
  ctx.fillStyle = C.text;
  ctx.font = `800 ${vertical ? 34 : 38}px ${ff}`;
  ctx.fillText(fitWidth(ctx, name, srcW - 56), barX + 28, barY + (vertical ? 84 : 104));
  const hx = vertical ? barX : barX + srcW;
  const hy = vertical ? barY + srcH : barY;
  const hw = vertical ? barW : barW - srcW;
  const hh = vertical ? barH - srcH : barH;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(hx, hy, hw, hh);
  ctx.fillStyle = C.amber;
  ctx.fillRect(hx, hy + hh - 8, hw, 8);
  const head = headlineOf(scene.text);
  const maxLines = vertical ? 4 : 2;
  let size = vertical ? 60 : 52;
  let lines: string[] = [];
  for (; size >= 30; size -= 2) {
    ctx.font = `800 ${size}px ${ff}`;
    lines = wrap(ctx, head, hw - 56, brand.lang);
    if (lines.length <= maxLines && lines.length * size * 1.25 <= hh - 30) break;
  }
  ctx.font = `800 ${size}px ${ff}`;
  const blockH = lines.length * size * 1.25;
  const y0 = hy + (hh - 8 - blockH) / 2 + size * 0.95;
  lines.slice(0, maxLines).forEach((l, i) => {
    let cx = hx + 28;
    for (const part of l.split(/(\d[\d.,:/%]*)/)) {
      if (!part) continue;
      ctx.fillStyle = /^\d/.test(part) ? "#b45309" : C.navy;
      ctx.fillText(part, cx, y0 + i * size * 1.25);
      cx += ctx.measureText(part).width;
    }
  });
  return canvas.toBuffer("image/png");
}

function renderSplit(scene: Scene, brand: Branding, index: number, total: number, aspect: Aspect, overlay = false): Buffer {
  const { w: W, h: H } = SIZES[aspect];
  const vertical = aspect === "9:16";
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const ui = uiStrings(brand.lang ?? "en");
  const pad = vertical ? 60 : 72;
  const ff = brand.fontFamily;

  background(ctx, brand, W, H, vertical, overlay);

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
