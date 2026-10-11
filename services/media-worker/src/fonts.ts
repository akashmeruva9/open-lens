import { existsSync } from "node:fs";
import { registerFont } from "./scenes.js";

// Docker image installs Noto fonts; macOS dev falls back to system fonts.
const CANDIDATES: Record<string, string[]> = {
  OLLatin: ["/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf", "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"],
  OLTelugu: ["/usr/share/fonts/truetype/noto/NotoSansTelugu-Regular.ttf", "/System/Library/Fonts/KohinoorTelugu.ttc"],
  OLDevanagari: ["/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf", "/System/Library/Fonts/Kohinoor.ttc", "/System/Library/Fonts/Supplemental/DevanagariMT.ttc"],
};

let done = false;
export function registerDefaultFonts() {
  if (done) return;
  done = true;
  for (const [family, paths] of Object.entries(CANDIDATES)) {
    const p = paths.find((x) => existsSync(x));
    if (p) registerFont(p, family);
  }
}

export function fontFor(lang: string): string {
  if (lang === "te") return "OLTelugu, OLLatin, sans-serif";
  if (lang === "hi") return "OLDevanagari, OLLatin, sans-serif";
  return "OLLatin, sans-serif";
}
