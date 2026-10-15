// Small canvas helpers shared by the layouts. All on-screen text in the explainer layout goes through `text()`, so a
// test can trace every string drawn on a frame (disclosure present, nothing in the platform UI zones).
import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { wrapText } from "@openlens/config";

export interface TracedText { text: string; x: number; y: number; w: number; size: number; role?: string }
let trace: ((t: TracedText) => void) | undefined;

/** Record every string the explainer layout draws (tests only). Pass undefined to stop. */
export function setTextTrace(fn: ((t: TracedText) => void) | undefined): void {
  trace = fn;
}

const fontSize = (ctx: SKRSContext2D) => Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 0);

/** fillText + trace. `y` is the baseline. */
export function text(ctx: SKRSContext2D, s: string, x: number, y: number, role?: string): number {
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  trace?.({ text: s, x, y, w, size: fontSize(ctx), role });
  return w;
}

export function wrap(ctx: SKRSContext2D, s: string, maxWidth: number, lang = "en"): string[] {
  return wrapText(s, lang, maxWidth, (t) => ctx.measureText(t).width);
}

/** Truncate to a pixel width on grapheme boundaries (safe for CJK width and Thai combining marks). */
export function fitWidth(ctx: SKRSContext2D, s: string, maxWidth: number): string {
  if (ctx.measureText(s).width <= maxWidth) return s;
  let out = "";
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)) {
    if (ctx.measureText(`${out}${segment}…`).width > maxWidth) break;
    out += segment;
  }
  return `${out}…`;
}

export function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draw an image to cover a box (centre crop, biased towards the top so faces stay in frame). */
export function drawCover(ctx: SKRSContext2D, img: Image, x: number, y: number, w: number, h: number, topBias = 0.15) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  const sx = (img.width - sw) / 2;
  const sy = Math.max(0, (img.height - sh) * topBias);
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Split a line into plain and number runs ("20", "4.60%", "1,200") for highlighting. */
export const NUMBER_SPLIT = /(\d(?:[\d.,:/]*\d)?[%％]?)/;

/** Draw one wrapped line with numbers in the highlight colour. Returns the drawn width. */
export function drawHighlighted(ctx: SKRSContext2D, line: string, x: number, y: number, base: string, hi: string, role?: string): number {
  let cx = x;
  for (const part of line.split(NUMBER_SPLIT)) {
    if (!part) continue;
    ctx.fillStyle = /^\d/.test(part) ? hi : base;
    cx += text(ctx, part, cx, y, role);
  }
  return cx - x;
}

/** Extra line spacing for scripts with tall stacked vowel signs/conjuncts (Telugu, Tamil, Devanagari, Thai). */
export function scriptLeading(lang = "en"): number {
  return ["te", "ta", "hi", "th"].includes(lang) ? 0.2 : 0;
}

/** Largest font size (stepping down) at which `s` wraps into the box; prefers <= maxLines, then anything that fits. */
export function fitBlock(
  ctx: SKRSContext2D, s: string,
  opts: { weight: number; family: string; max: number; min: number; width: number; height: number; maxLines: number; lineHeight?: number; lang?: string;
    /** Smallest size worth keeping to `maxLines`; below it, more lines at a bigger size read better. Default: min. */
    comfortable?: number },
): { size: number; lines: string[]; lh: number } {
  const lhK = (opts.lineHeight ?? 1.22) + scriptLeading(opts.lang);
  const attempt = (limit: number, floor: number) => {
    for (let size = opts.max; size >= floor; size -= 2) {
      ctx.font = `${opts.weight} ${size}px ${opts.family}`;
      const lines = wrap(ctx, s, opts.width, opts.lang);
      if (lines.length <= limit && lines.length * size * lhK <= opts.height) return { size, lines, lh: size * lhK };
    }
    return undefined;
  };
  const r = attempt(opts.maxLines, opts.comfortable ?? opts.min) ?? attempt(Number.POSITIVE_INFINITY, opts.min);
  if (r) {
    ctx.font = `${opts.weight} ${r.size}px ${opts.family}`;
    return r;
  }
  // Still too long at the minimum size: keep what fits, ending in an ellipsis (never silently overflows the box).
  ctx.font = `${opts.weight} ${opts.min}px ${opts.family}`;
  const lh = opts.min * lhK;
  const all = wrap(ctx, s, opts.width, opts.lang);
  const n = Math.max(1, Math.floor(opts.height / lh));
  const lines = all.slice(0, n);
  if (all.length > n) lines[n - 1] = fitWidth(ctx, `${lines[n - 1]}…`, opts.width);
  return { size: opts.min, lines, lh };
}
