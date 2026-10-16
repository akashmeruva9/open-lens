// Social-first explainer layout: a big "beat" card per spoken line (number / attributed statement / timeline /
// sources / section title / illustration / end card), large captions, the presenter as a small picture-in-picture,
// and the AI disclosure on every frame. Text stays out of the bottom 20% and the right-hand action column that
// Reels/Shorts overlay on vertical video.
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { uiStrings } from "@openlens/config";
import type { Beat } from "./beats.js";
import { drawCover, drawHighlighted, fitBlock, fitWidth, roundRect, scriptLeading, text, wrap } from "./draw.js";
import { countryAt, loadCountries, viewBox } from "./geo.js";
import { drawQr } from "./qr.js";
import type { Aspect, Branding, Scene } from "./scenes.js";

export interface Box { x: number; y: number; w: number; h: number }

export interface ExplainerLayout {
  W: number; H: number; pad: number;
  /** Text must stay above `bottom` and, below `rightFrom`, left of `right` (platform UI). */
  safe: { top: number; bottom: number; right: number; rightFrom: number };
  logo: { x: number; y: number };
  disclosure: Box;
  pip: Box;
  label: { x: number; y: number };
  beat: Box;
  chip: Box;
  caption: Box;
  /** Hook intro: where the presenter clip sits, and where its caption goes. */
  hook: Box;
  hookCaption: Box;
}

export const C = {
  bg: "#0d0e12",
  card: "#191b22",
  line: "#2a2d38",
  accent: "#ffd60a",
  cyan: "#38bdf8",
  text: "#ffffff",
  muted: "#a1a7b5",
  dim: "#6b7280",
};

export function explainerLayout(aspect: Aspect): ExplainerLayout {
  if (aspect === "9:16") {
    const W = 1080, H = 1920;
    return {
      W, H, pad: 60,
      // Reels/Shorts: caption + buttons cover the bottom ~35% (Shorts: ~672 px) and the right ~192 px.
      safe: { top: 80, bottom: 1248, right: W - 192, rightFrom: 840 },
      logo: { x: 60, y: 96 },
      disclosure: { x: 60, y: 166, w: 680, h: 118 },
      pip: { x: 780, y: 100, w: 240, h: 300 },
      label: { x: 60, y: 318 },
      beat: { x: 60, y: 410, w: 960, h: 430 },
      chip: { x: 60, y: 866, w: 828, h: 58 },
      caption: { x: 60, y: 944, w: 828, h: 304 },
      hook: { x: 0, y: 0, w: W, h: H },
      hookCaption: { x: 60, y: 940, w: 828, h: 308 },
    };
  }
  const W = 1920, H = 1080;
  return {
    W, H, pad: 72,
    // YouTube: keep text above the player controls.
    safe: { top: 30, bottom: 1000, right: W - 72, rightFrom: 0 },
    logo: { x: 72, y: 56 },
    disclosure: { x: 420, y: 46, w: 1090, h: 80 },
    pip: { x: 1560, y: 48, w: 288, h: 360 },
    label: { x: 72, y: 146 },
    beat: { x: 72, y: 224, w: 1440, h: 470 },
    chip: { x: 72, y: 716, w: 1440, h: 60 },
    caption: { x: 72, y: 800, w: 1776, h: 196 },
    hook: { x: 0, y: 0, w: 810, h: H },
    hookCaption: { x: 880, y: 640, w: 968, h: 356 },
  };
}

// ---------------------------------------------------------------- shared chrome

/** "2 sources" / "1 source" (only English needs the singular; the other UI languages do not inflect here). */
function sourcesLabel(n: number, lang = "en"): string {
  const word = uiStrings(lang).sources;
  return `${n} ${n === 1 && lang === "en" ? word.replace(/s$/, "") : word}`;
}

function logo(ctx: SKRSContext2D, L: ExplainerLayout, ff: string) {
  const { x, y } = L.logo;
  ctx.fillStyle = C.cyan;
  ctx.beginPath();
  ctx.arc(x + 22, y + 22, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.bg;
  ctx.beginPath();
  ctx.arc(x + 22, y + 22, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.text;
  ctx.font = `800 38px ${ff}`;
  text(ctx, "OPENLENS", x + 58, y + 36, "logo");
}

/** AI disclosure: always drawn, never truncated (shrinks, then wraps to more lines if a language needs it). */
function disclosure(ctx: SKRSContext2D, L: ExplainerLayout, brand: Branding, box: Box = L.disclosure) {
  const ff = brand.fontFamily;
  let size = L.W > L.H ? 24 : 27;
  let lines: string[] = [];
  for (; size >= 18; size -= 1) {
    ctx.font = `600 ${size}px ${ff}`;
    lines = wrap(ctx, brand.disclosure, box.w - 36, brand.lang);
    if (lines.length * size * 1.3 + 20 <= box.h) break;
  }
  const lh = size * 1.3;
  const h = lines.length * lh + 20;
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  roundRect(ctx, box.x, box.y, box.w, h, 14);
  ctx.fill();
  ctx.fillStyle = C.accent;
  ctx.fillRect(box.x, box.y + 10, 5, h - 20);
  ctx.fillStyle = "#f1f5f9";
  lines.forEach((l, i) => text(ctx, l, box.x + 20, box.y + 10 + size + i * lh, "disclosure"));
}

function progress(ctx: SKRSContext2D, L: ExplainerLayout, index: number, total: number) {
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(0, 0, L.W, 8);
  ctx.fillStyle = C.accent;
  ctx.fillRect(0, 0, (L.W * Math.min(index + 1, total)) / Math.max(1, total), 8);
}

function labelPill(ctx: SKRSContext2D, L: ExplainerLayout, label: string | undefined, ff: string) {
  if (!label) return;
  const size = L.W > L.H ? 30 : 32;
  ctx.font = `800 ${size}px ${ff}`;
  const s = fitWidth(ctx, label.toUpperCase(), L.beat.w - 40);
  const w = ctx.measureText(s).width + 40;
  ctx.fillStyle = C.accent;
  roundRect(ctx, L.label.x, L.label.y, w, size + 26, 10);
  ctx.fill();
  ctx.fillStyle = "#111";
  text(ctx, s, L.label.x + 20, L.label.y + size + 6, "label");
}

/** Presenter picture-in-picture. In overlay mode the box is punched out so ffmpeg's idle clip shows through. */
function presenterPip(ctx: SKRSContext2D, brand: Branding, box: Box, overlay: boolean, radius = 26) {
  const ff = brand.fontFamily;
  if (overlay) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    roundRect(ctx, box.x, box.y, box.w, box.h, radius);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.save();
    roundRect(ctx, box.x, box.y, box.w, box.h, radius);
    ctx.clip();
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    if (brand.presenterImage) drawCover(ctx, brand.presenterImage, box.x, box.y, box.w, box.h);
    else {
      ctx.fillStyle = "#e0f2fe";
      ctx.font = `700 ${Math.round(box.w * 0.45)}px ${ff}`;
      const ini = (brand.presenterName ?? "AI").slice(0, 1);
      ctx.fillText(ini, box.x + (box.w - ctx.measureText(ini).width) / 2, box.y + box.h * 0.6);
    }
    ctx.restore();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 4;
  roundRect(ctx, box.x, box.y, box.w, box.h, radius);
  ctx.stroke();
}

/** "Maya · AI presenter" tag, centred under (overlapping) the presenter box. */
function nameTag(ctx: SKRSContext2D, brand: Branding, box: Box, size: number) {
  const ui = uiStrings(brand.lang ?? "en");
  const ff = brand.fontFamily;
  const s = [brand.presenterName, ui.aiPresenter].filter(Boolean).join(" · ");
  ctx.font = `700 ${size}px ${ff}`;
  const t = fitWidth(ctx, s, box.w + 20);
  const w = ctx.measureText(t).width + 28;
  const h = size + 20;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + box.h - h / 2;
  ctx.fillStyle = "#111";
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = C.text;
  text(ctx, t, x + 14, y + size + 4, "nametag");
}

/** Source chip: outlet names + "N sources". */
function sourceChip(ctx: SKRSContext2D, L: ExplainerLayout, scene: Scene, brand: Branding) {
  const outlets = [...new Set(scene.sources ?? [])];
  if (!outlets.length) return;
  const ui = uiStrings(brand.lang ?? "en");
  const ff = brand.fontFamily;
  const b = L.chip;
  ctx.fillStyle = "rgba(56,189,248,0.14)";
  roundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2);
  ctx.fill();
  const size = Math.round(b.h * 0.44);
  ctx.font = `800 ${size}px ${ff}`;
  const count = sourcesLabel(outlets.length, brand.lang);
  const cw = ctx.measureText(count).width + 36;
  ctx.fillStyle = C.cyan;
  roundRect(ctx, b.x + b.w - cw - 8, b.y + 8, cw, b.h - 16, (b.h - 16) / 2);
  ctx.fill();
  ctx.fillStyle = "#04111d";
  text(ctx, count, b.x + b.w - cw + 10, b.y + b.h / 2 + size * 0.36, "chip");
  ctx.font = `600 ${size}px ${ff}`;
  ctx.fillStyle = "#cfefff";
  const names = fitWidth(ctx, `${ui.evidence}: ${outlets.join(" · ")}`, b.w - cw - 56);
  text(ctx, names, b.x + 26, b.y + b.h / 2 + size * 0.36, "chip");
}

/** Spoken line as a big caption: max 2 lines when it fits, numbers highlighted. */
function caption(ctx: SKRSContext2D, s: string, box: Box, brand: Branding, vertical: boolean) {
  const fit = fitBlock(ctx, s, {
    weight: 800, family: brand.fontFamily, lang: brand.lang,
    max: vertical ? 66 : 56, comfortable: vertical ? 54 : 46, min: vertical ? 40 : 34, width: box.w, height: box.h, maxLines: 2, lineHeight: 1.24,
  });
  // Pin captions to the top of their box so their position does not jump between lines.
  fit.lines.forEach((l, i) => drawHighlighted(ctx, l, box.x, box.y + fit.size + i * fit.lh, C.text, C.accent, "caption"));
}

// ---------------------------------------------------------------- beat cards

function card(ctx: SKRSContext2D, b: Box) {
  ctx.fillStyle = C.card;
  roundRect(ctx, b.x, b.y, b.w, b.h, 28);
  ctx.fill();
}

function numberCard(ctx: SKRSContext2D, beat: Extract<Beat, { kind: "number" }>, b: Box, brand: Branding, vertical: boolean) {
  card(ctx, b);
  const ff = brand.fontFamily;
  const fig = `${beat.value}${beat.unit ?? ""}`;
  // Digits and % from the Latin face: Indic/CJK fonts draw them thin or with odd metrics at display sizes.
  const figFont = `OLLatin, ${ff}`;
  let size = vertical ? 280 : 260;
  for (; size > 80; size -= 8) {
    ctx.font = `900 ${size}px ${figFont}`;
    if (ctx.measureText(fig).width <= b.w - 96) break;
  }
  const qSize = vertical ? 46 : 40;
  const blockH = size * 0.78 + (beat.qualifier ? qSize + 24 : 0) + (beat.by ? qSize + 34 : 0);
  let y = b.y + (b.h - blockH) / 2;
  if (beat.qualifier) {
    ctx.font = `700 ${qSize}px ${ff}`;
    ctx.fillStyle = C.muted;
    text(ctx, beat.qualifier.toUpperCase(), b.x + 48, y + qSize, "beat");
    y += qSize + 24;
  }
  ctx.font = `900 ${size}px ${figFont}`;
  ctx.fillStyle = C.accent;
  text(ctx, fig, b.x + 48, y + size * 0.78, "beat");
  if (beat.by) {
    // Attributed figure: always say whose it is.
    ctx.font = `800 ${qSize}px ${ff}`;
    ctx.fillStyle = C.text;
    text(ctx, fitWidth(ctx, `— ${beat.by}`, b.w - 96), b.x + 48, y + size * 0.78 + 34 + qSize, "beat");
  }
}

function figuresCard(ctx: SKRSContext2D, beat: Extract<Beat, { kind: "figures" }>, b: Box, brand: Branding, vertical: boolean) {
  card(ctx, b);
  const ff = brand.fontFamily;
  const items = beat.items.slice(0, 4);
  const cols = items.length === 4 ? 2 : items.length;
  const rows = items.length === 4 ? 2 : 1;
  const cw = (b.w - 48) / cols, ch = (b.h - 48) / rows;
  items.forEach((it, i) => {
    const cx = b.x + 24 + (i % cols) * cw, cy = b.y + 24 + Math.floor(i / cols) * ch;
    if (i % cols > 0) { ctx.fillStyle = C.line; ctx.fillRect(cx - 1, cy + 24, 2, ch - 48); }
    const fig = `${it.value}${it.unit ?? ""}`;
    const figFont = `OLLatin, ${ff}`;
    let size = rows === 2 ? 130 : vertical ? 190 : 170;
    for (; size > 56; size -= 6) { ctx.font = `900 ${size}px ${figFont}`; if (ctx.measureText(fig).width <= cw - 56) break; }
    const qSize = rows === 2 ? 28 : 32;
    const lSize = rows === 2 ? 34 : vertical ? 40 : 38;
    const blockH = (it.qualifier ? qSize + 10 : 0) + size * 0.8 + 16 + lSize * 1.3;
    let y = cy + (ch - blockH) / 2;
    if (it.qualifier) { ctx.font = `700 ${qSize}px ${ff}`; ctx.fillStyle = C.muted; text(ctx, it.qualifier.toUpperCase(), cx + 28, y + qSize, "beat"); y += qSize + 10; }
    ctx.font = `900 ${size}px ${figFont}`; ctx.fillStyle = C.accent;
    text(ctx, fig, cx + 28, y + size * 0.8, "beat");
    ctx.font = `700 ${lSize}px ${ff}`; ctx.fillStyle = C.text;
    text(ctx, fitWidth(ctx, it.label, cw - 56), cx + 28, y + size * 0.8 + 16 + lSize, "beat");
  });
}

function mapCard(ctx: SKRSContext2D, beat: Extract<Beat, { kind: "map" }>, b: Box, brand: Branding, vertical: boolean) {
  card(ctx, b);
  const ff = brand.fontFamily;
  const hit = countryAt(beat.lon, beat.lat);
  const pad = 20;
  const area = { x: b.x + pad, y: b.y + pad, w: b.w - 2 * pad, h: b.h - 2 * pad };
  ctx.save();
  roundRect(ctx, area.x, area.y, area.w, area.h, 18);
  ctx.clip();
  ctx.fillStyle = "#12151c";
  ctx.fillRect(area.x, area.y, area.w, area.h);
  const vb = hit ? viewBox(hit.part, { lon: beat.lon, lat: beat.lat }) : { x0: beat.lon - 4, x1: beat.lon + 4, y0: beat.lat - 3, y1: beat.lat + 3 };
  const midLat = (vb.y0 + vb.y1) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const spanX = (vb.x1 - vb.x0) * kx, spanY = vb.y1 - vb.y0;
  const scale = Math.min(area.w / spanX, area.h / spanY);
  const ox = area.x + (area.w - spanX * scale) / 2, oy = area.y + (area.h - spanY * scale) / 2;
  const px = (lon: number) => ox + (lon - vb.x0) * kx * scale;
  const py = (lat: number) => oy + (vb.y1 - lat) * scale;
  for (const c of loadCountries()) {
    const own = c === hit?.country;
    for (const poly of c.p) {
      const ring = poly[0]!;
      if (!ring.some(([x, y]) => x >= vb.x0 - 1 && x <= vb.x1 + 1 && y >= vb.y0 - 1 && y <= vb.y1 + 1)) continue;
      ctx.beginPath();
      ring.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
      ctx.closePath();
      ctx.fillStyle = own ? "#2b3d5c" : "#1d212b";
      ctx.fill();
      ctx.strokeStyle = own ? "#4a6592" : "#2a2f3c";
      ctx.lineWidth = own ? 3 : 1.5;
      ctx.stroke();
    }
  }
  const x = px(beat.lon), y = py(beat.lat);
  ctx.fillStyle = "rgba(255,214,10,0.25)";
  ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.accent;
  ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#0d0e12"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  // Place name tag (never on top of the pin: above it, or below near the top edge).
  const size = vertical ? 44 : 40;
  ctx.font = `800 ${size}px ${ff}`;
  const label = fitWidth(ctx, beat.place, area.w - 80);
  const tw = ctx.measureText(label).width + 40;
  const lx = Math.min(Math.max(x - tw / 2, area.x + 16), area.x + area.w - tw - 16);
  const ly = y - 40 - size - 24 > area.y + 8 ? y - 40 - size - 24 : y + 52;
  ctx.fillStyle = "rgba(13,14,18,0.88)";
  roundRect(ctx, lx, ly, tw, size + 24, 14); ctx.fill();
  ctx.fillStyle = C.text;
  text(ctx, label, lx + 20, ly + size + 4, "beat");
  if (hit) {
    ctx.font = `700 ${vertical ? 26 : 24}px ${ff}`;
    ctx.fillStyle = C.muted;
    text(ctx, hit.country.n.toUpperCase(), area.x + 24, area.y + area.h - 22, "beat");
  }
}

function unknownsCard(ctx: SKRSContext2D, beat: Extract<Beat, { kind: "unknowns" }>, b: Box, brand: Branding, vertical: boolean) {
  card(ctx, b);
  const ff = brand.fontFamily;
  const head = vertical ? 38 : 34;
  ctx.fillStyle = C.accent;
  ctx.fillRect(b.x + 40, b.y + 40, 10, head + 6);
  ctx.font = `900 ${head}px ${ff}`;
  text(ctx, beat.title.toUpperCase(), b.x + 70, b.y + 40 + head, "beat");
  const items = beat.items.slice(0, 3);
  const top = b.y + 40 + head + 34;
  const rowH = (b.y + b.h - 28 - top) / items.length;
  items.forEach((it, i) => {
    const y0 = top + i * rowH;
    const fit = fitBlock(ctx, it, { weight: 700, family: ff, lang: brand.lang, max: vertical ? 40 : 38, min: 26, width: b.w - 130, height: rowH - 14, maxLines: 3 });
    ctx.fillStyle = C.cyan;
    ctx.beginPath(); ctx.arc(b.x + 55, y0 + fit.size * 0.62, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.text;
    fit.lines.forEach((l, k) => text(ctx, l, b.x + 84, y0 + fit.size + k * fit.lh, "beat"));
  });
}

function quoteCard(ctx: SKRSContext2D, beat: Extract<Beat, { kind: "quote" }>, b: Box, brand: Branding, vertical: boolean) {
  card(ctx, b);
  const ff = brand.fontFamily;
  ctx.fillStyle = C.accent;
  ctx.fillRect(b.x + 40, b.y + 44, 10, b.h - 88);
  const nameSize = vertical ? 56 : 52;
  ctx.font = `900 ${nameSize}px ${ff}`;
  ctx.fillStyle = C.accent;
  text(ctx, fitWidth(ctx, beat.by.toUpperCase(), b.w - 130), b.x + 80, b.y + 44 + nameSize, "beat");
  const top = b.y + 44 + nameSize + 30;
  const fit = fitBlock(ctx, beat.text, { weight: 700, family: ff, lang: brand.lang, max: vertical ? 52 : 50, min: 32, width: b.w - 130, height: b.y + b.h - 40 - top, maxLines: 5, lineHeight: 1.25 });
  fit.lines.forEach((l, i) => drawHighlighted(ctx, l, b.x + 80, top + fit.size + i * fit.lh, C.text, C.accent, "beat"));
}

function timelineCard(ctx: SKRSContext2D, beat: Extract<Beat, { kind: "timeline" }>, b: Box, brand: Branding, vertical: boolean) {
  card(ctx, b);
  const ff = brand.fontFamily;
  const n = beat.events.length;
  const railX = b.x + 64;
  const top = b.y + 50, bottom = b.y + b.h - 50;
  const step = n > 1 ? (bottom - top) / (n - 1) : 0;
  ctx.fillStyle = C.line;
  ctx.fillRect(railX - 3, top, 6, bottom - top);
  const dateSize = vertical ? 38 : 34;
  const textSize = vertical ? 28 : 26;
  const textW = b.w - 140;
  beat.events.forEach((e, i) => {
    const cy = n > 1 ? top + i * step : (top + bottom) / 2;
    ctx.fillStyle = e.active ? C.accent : C.dim;
    ctx.beginPath();
    ctx.arc(railX, cy, e.active ? 16 : 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `800 ${dateSize}px ${ff}`;
    ctx.fillStyle = e.active ? C.text : C.muted;
    const withText = beat.showText && Boolean(e.text);
    const dy = withText ? cy - 4 : cy + dateSize * 0.36;
    text(ctx, fitWidth(ctx, e.date, textW), railX + 44, dy, "beat");
    if (withText) {
      ctx.font = `500 ${textSize}px ${ff}`;
      ctx.fillStyle = e.active ? "#e5e7eb" : C.dim;
      // Context text, not a claim: one line, ellipsised if long.
      text(ctx, fitWidth(ctx, e.text, textW), railX + 44, cy + textSize + 8, "beat");
    }
  });
}

function sourcesCard(ctx: SKRSContext2D, beat: Extract<Beat, { kind: "sources" }>, b: Box, brand: Branding, vertical: boolean) {
  card(ctx, b);
  const ff = brand.fontFamily;
  const cSize = vertical ? 150 : 140;
  const nSize = vertical ? 50 : 48;
  const nLh = nSize * (1.45 + scriptLeading(brand.lang));
  const shown = beat.outlets.slice(0, Math.max(1, Math.floor((b.h - cSize - 100) / nLh)));
  const blockH = cSize * 0.8 + 40 + shown.length * nLh;
  const top = b.y + Math.max(36, (b.h - blockH) / 2);
  ctx.font = `900 ${cSize}px OLLatin, ${ff}`;
  ctx.fillStyle = C.cyan;
  const cw = text(ctx, String(beat.count), b.x + 48, top + cSize * 0.8, "beat");
  ctx.font = `800 ${vertical ? 52 : 50}px ${ff}`;
  ctx.fillStyle = C.text;
  const word = sourcesLabel(beat.count, brand.lang).replace(/^\d+\s*/, "");
  text(ctx, fitWidth(ctx, word.toUpperCase(), b.w - cw - 120), b.x + 48 + cw + 24, top + cSize * 0.8, "beat");
  ctx.font = `700 ${nSize}px ${ff}`;
  let y = top + cSize * 0.8 + 40 + nSize;
  for (const o of shown) {
    ctx.fillStyle = C.accent;
    ctx.fillRect(b.x + 48, y - nSize * 0.6, 14, 14);
    ctx.fillStyle = C.text;
    text(ctx, fitWidth(ctx, o, b.w - 140), b.x + 84, y, "beat");
    y += nLh;
  }
}

/** Section title card: the line's label, big (and the story title on the opening line). */
function heroCard(ctx: SKRSContext2D, scene: Scene, brand: Branding, b: Box, vertical: boolean, index: number) {
  const ff = brand.fontFamily;
  const big = (scene.label ?? "").toUpperCase() || brand.title;
  const sub = index === 0 && scene.label ? brand.title : "";
  ctx.fillStyle = C.accent;
  ctx.fillRect(b.x, b.y + 30, 120, 14);
  const fit = fitBlock(ctx, big, { weight: 900, family: ff, lang: brand.lang, max: vertical ? 130 : 120, min: 56, width: b.w - 20, height: b.h - 80 - (sub ? 140 : 0), maxLines: 3, lineHeight: 1.08 });
  ctx.fillStyle = C.text;
  fit.lines.forEach((l, i) => text(ctx, l, b.x, b.y + 80 + fit.size * 0.9 + i * fit.lh, "beat"));
  if (sub) {
    const top = b.y + 80 + fit.lines.length * fit.lh + 30;
    const s = fitBlock(ctx, sub, { weight: 600, family: ff, lang: brand.lang, max: vertical ? 44 : 40, min: 28, width: b.w - 20, height: b.y + b.h - top, maxLines: 2 });
    ctx.fillStyle = C.muted;
    s.lines.forEach((l, i) => text(ctx, l, b.x, top + s.size + i * s.lh, "beat"));
  }
  // Nothing numeric to show: fill the card with the outlets behind this line (from the ledger, never invented).
  const outlets = [...new Set(scene.sources ?? [])].slice(0, 2);
  if (!sub && outlets.length) {
    const ui = uiStrings(brand.lang ?? "en");
    const size = vertical ? 32 : 30;
    let y = b.y + b.h - (outlets.length * (size + 36) + 12);
    ctx.font = `700 ${size - 6}px ${ff}`;
    ctx.fillStyle = C.dim;
    text(ctx, (ui.evidence ?? "Evidence").toUpperCase(), b.x, y - 10, "beat");
    for (const o of outlets) {
      ctx.font = `700 ${size}px ${ff}`;
      const label = fitWidth(ctx, o, b.w - 80);
      const w = ctx.measureText(label).width + 48;
      ctx.fillStyle = "rgba(56,189,248,0.16)";
      roundRect(ctx, b.x, y + 4, w, size + 26, 14);
      ctx.fill();
      ctx.fillStyle = C.cyan;
      text(ctx, label, b.x + 24, y + 4 + size + 6, "beat");
      y += size + 36;
    }
  }
}

function illustrationBackdrop(ctx: SKRSContext2D, scene: Scene, L: ExplainerLayout) {
  if (!scene.image) return;
  drawCover(ctx, scene.image, 0, 0, L.W, L.H, 0.4);
  // Dark scrim so every text layer stays readable; heavier towards the caption area.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, L.W, L.H);
  const g = ctx.createLinearGradient(0, L.chip.y - 200, 0, L.H);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.35, "rgba(0,0,0,0.78)");
  g.addColorStop(1, "rgba(0,0,0,0.9)");
  ctx.fillStyle = g;
  ctx.fillRect(0, L.chip.y - 200, L.W, L.H - L.chip.y + 200);
  const t = ctx.createLinearGradient(0, 0, 0, L.beat.y);
  t.addColorStop(0, "rgba(0,0,0,0.7)");
  t.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = t;
  ctx.fillRect(0, 0, L.W, L.beat.y);
}

function illustrationTag(ctx: SKRSContext2D, brand: Branding, b: Box, vertical: boolean, credit?: string) {
  const ui = uiStrings(brand.lang ?? "en");
  const size = credit ? (vertical ? 24 : 22) : vertical ? 22 : 20;
  ctx.font = `700 ${size}px ${brand.fontFamily}`;
  const s = fitWidth(ctx, credit ? `${ui.filePhoto} · ${credit}` : ui.aiIllustration, b.w - 40);
  const w = ctx.measureText(s).width + 32;
  const y = b.y + b.h - size - 30;
  ctx.fillStyle = credit ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.55)";
  roundRect(ctx, b.x, y, w, size + 22, 10);
  ctx.fill();
  ctx.fillStyle = C.text;
  text(ctx, s, b.x + 16, y + size + 4, credit ? "photo-credit" : "illustration-label");
}

function endCard(ctx: SKRSContext2D, beat: Extract<Beat, { kind: "cta" }>, scene: Scene, brand: Branding, L: ExplainerLayout, vertical: boolean) {
  const ff = brand.fontFamily;
  const ui = uiStrings(brand.lang ?? "en");
  const b = L.beat;
  ctx.fillStyle = C.accent;
  ctx.fillRect(b.x, b.y + 20, 120, 14);
  ctx.font = `900 ${vertical ? 120 : 112}px ${ff}`;
  ctx.fillStyle = C.text;
  text(ctx, "OpenLens", b.x, b.y + 70 + (vertical ? 100 : 92), "beat");
  const top = b.y + 70 + (vertical ? 140 : 130);
  const line = beat.text || ui.openResearch;
  const fit = fitBlock(ctx, line, { weight: 800, family: ff, lang: brand.lang, max: vertical ? 60 : 56, min: 34, width: b.w - 20, height: b.y + b.h - top, maxLines: 3 });
  ctx.fillStyle = C.accent;
  fit.lines.forEach((l, i) => text(ctx, l, b.x, top + fit.size + i * fit.lh, "beat"));

  // QR + link in the caption area (the CTA line itself is shown big above).
  const c = vertical ? L.caption : { ...L.caption, y: L.chip.y - 60, h: L.safe.bottom - (L.chip.y - 60) };
  const q = Math.min(c.h - 20, vertical ? 360 : 260);
  if (beat.url) drawQr(ctx, beat.url, c.x, c.y, q);
  else {
    // No public URL configured: an intentional-looking placeholder, never a broken code.
    ctx.strokeStyle = C.muted;
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 12]);
    roundRect(ctx, c.x + 2, c.y + 2, q - 4, q - 4, 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.cyan;
    ctx.beginPath();
    ctx.arc(c.x + q / 2, c.y + q / 2, q * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.bg;
    ctx.beginPath();
    ctx.arc(c.x + q / 2, c.y + q / 2, q * 0.075, 0, Math.PI * 2);
    ctx.fill();
  }
  const tx = c.x + q + 40;
  const tw = c.w - q - 40;
  ctx.font = `800 ${vertical ? 44 : 40}px ${ff}`;
  ctx.fillStyle = C.text;
  text(ctx, fitWidth(ctx, "OpenLens app", tw), tx, c.y + (vertical ? 60 : 56), "cta");
  if (beat.url) {
    ctx.font = `600 ${vertical ? 32 : 30}px ${ff}`;
    ctx.fillStyle = C.cyan;
    const short = beat.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const lines = wrap(ctx, short.replace(/\//g, "/​"), tw, "en").slice(0, 3);
    lines.forEach((l, i) => text(ctx, l.replace(/​/g, ""), tx, c.y + (vertical ? 120 : 110) + i * 42, "cta"));
  }
}

// ---------------------------------------------------------------- frames

/** One explainer frame. overlay=true: transparent PiP hole for ffmpeg to put the presenter clip under. */
export function renderExplainerFrame(scene: Scene, brand: Branding, index: number, total: number, aspect: Aspect, overlay = false): Buffer {
  const L = explainerLayout(aspect);
  const vertical = aspect === "9:16";
  const canvas = createCanvas(L.W, L.H);
  const ctx = canvas.getContext("2d");
  const ff = brand.fontFamily;
  const beat: Beat = scene.beat ?? { kind: "hero", headline: "" };

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, L.W, L.H);
  if (beat.kind === "illustration") illustrationBackdrop(ctx, scene, L);
  progress(ctx, L, index, total);
  logo(ctx, L, ff);
  disclosure(ctx, L, brand);
  if (beat.kind !== "cta") labelPill(ctx, L, scene.label, ff);

  switch (beat.kind) {
    case "number": numberCard(ctx, beat, L.beat, brand, vertical); break;
    case "figures": figuresCard(ctx, beat, L.beat, brand, vertical); break;
    case "map": mapCard(ctx, beat, L.beat, brand, vertical); break;
    case "unknowns": unknownsCard(ctx, beat, L.beat, brand, vertical); break;
    case "quote": quoteCard(ctx, beat, L.beat, brand, vertical); break;
    case "timeline": timelineCard(ctx, beat, L.beat, brand, vertical); break;
    case "sources": sourcesCard(ctx, beat, L.beat, brand, vertical); break;
    case "illustration": if (scene.image) illustrationTag(ctx, brand, L.beat, vertical, scene.credit); else heroCard(ctx, scene, brand, L.beat, vertical, index); break;
    case "cta": endCard(ctx, beat, scene, brand, L, vertical); break;
    default: heroCard(ctx, scene, brand, L.beat, vertical, index);
  }
  if (beat.kind !== "cta") {
    sourceChip(ctx, L, scene, brand);
    caption(ctx, scene.text, L.caption, brand, vertical);
  }
  presenterPip(ctx, brand, L.pip, overlay);
  nameTag(ctx, brand, L.pip, vertical ? 22 : 22);
  return canvas.toBuffer("image/png");
}

/** Hook intro frame: presenter clip large (full-bleed on 9:16, left column on 16:9) with logo, disclosure, name tag
 *  and the hook caption. overlay=true leaves the clip area see-through. */
export function renderHookFrame(hook: { text?: string; title?: string }, brand: Branding, aspect: Aspect, overlay = false): Buffer {
  const L = explainerLayout(aspect);
  const vertical = aspect === "9:16";
  const canvas = createCanvas(L.W, L.H);
  const ctx = canvas.getContext("2d");
  const ff = brand.fontFamily;
  const hb = L.hook;
  if (!overlay) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, L.W, L.H);
    if (brand.presenterImage) drawCover(ctx, brand.presenterImage, hb.x, hb.y, hb.w, hb.h);
  } else if (!vertical) {
    // Opaque panel beside the clip column.
    ctx.fillStyle = C.bg;
    ctx.fillRect(hb.x + hb.w, 0, L.W - hb.w, L.H);
  }
  if (vertical) {
    const top = ctx.createLinearGradient(0, 0, 0, 420);
    top.addColorStop(0, "rgba(0,0,0,0.75)");
    top.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, L.W, 420);
    const bot = ctx.createLinearGradient(0, 900, 0, L.H);
    bot.addColorStop(0, "rgba(13,14,18,0)");
    bot.addColorStop(0.3, "rgba(13,14,18,0.82)");
    bot.addColorStop(1, "rgba(13,14,18,0.95)");
    ctx.fillStyle = bot;
    ctx.fillRect(0, 900, L.W, L.H - 900);
  } else if (!overlay) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(hb.x + hb.w, 0, L.W - hb.w, L.H);
  }
  const lx = vertical ? L.logo : { x: hb.x + hb.w + 70, y: L.logo.y };
  logo(ctx, { ...L, logo: lx }, ff);
  const dBox = vertical ? { ...L.disclosure, w: L.W - 120 } : { x: lx.x, y: lx.y + 80, w: L.W - lx.x - 72, h: 90 };
  disclosure(ctx, L, brand, dBox);
  // Name tag at the bottom of the clip area (above the caption).
  const tagBox = vertical ? { x: 60, y: L.hookCaption.y - 150, w: 520, h: 100 } : { x: hb.x + 40, y: hb.y + hb.h - 200, w: hb.w - 80, h: 80 };
  nameTag(ctx, brand, tagBox, vertical ? 30 : 26);
  if (!vertical && hook.title) {
    const t = fitBlock(ctx, hook.title, { weight: 900, family: ff, lang: brand.lang, max: 76, min: 40, width: L.hookCaption.w, height: L.hookCaption.y - 290, maxLines: 3, lineHeight: 1.12 });
    ctx.fillStyle = C.text;
    t.lines.forEach((l, i) => text(ctx, l, L.hookCaption.x, 260 + t.size + i * t.lh, "title"));
  }
  if (hook.text) caption(ctx, hook.text, L.hookCaption, brand, vertical);
  return canvas.toBuffer("image/png");
}
