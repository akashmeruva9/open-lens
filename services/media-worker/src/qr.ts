// QR code for the end card. `toqr` is a tiny pure-JS encoder (already in the workspace tree); the modules come back
// as a flat n*n array which we paint as squares, so the output is deterministic and needs no image assets.
import type { SKRSContext2D } from "@napi-rs/canvas";
import { toQR } from "toqr";

/** QR matrix for a URL: `size` modules per side, row-major 0/1. */
export function qrMatrix(content: string): { size: number; modules: Uint8Array } {
  const modules = toQR(content, 0 /* EC level M */);
  return { size: Math.round(Math.sqrt(modules.length)), modules };
}

/** Paint a QR code (with a light quiet zone) into a square box. */
export function drawQr(ctx: SKRSContext2D, content: string, x: number, y: number, box: number, fg = "#0b1220", bg = "#ffffff"): void {
  const { size, modules } = qrMatrix(content);
  const quiet = 2;
  const cell = box / (size + quiet * 2);
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, box, box);
  ctx.fillStyle = fg;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r * size + c]) {
        const px = x + (c + quiet) * cell;
        const py = y + (r + quiet) * cell;
        // Overlap by a hair so anti-aliasing never leaves seams between modules.
        ctx.fillRect(px, py, cell + 0.4, cell + 0.4);
      }
    }
  }
}
