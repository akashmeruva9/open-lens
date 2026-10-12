import { LANGUAGES, isLang, type Script } from "@openlens/config";
import { existsSync } from "node:fs";
import { registerFont } from "./scenes.js";

// Docker installs Noto (fonts-noto-core + fonts-noto-cjk); macOS dev falls back to system fonts.
const NOTO = "/usr/share/fonts/truetype/noto";
const NOTO_CJK = "/usr/share/fonts/opentype/noto";
const MAC = "/System/Library/Fonts";
const CANDIDATES: Record<string, string[]> = {
  OLLatin: [`${NOTO}/NotoSans-Regular.ttf`, `${MAC}/Supplemental/Arial Unicode.ttf`],
  OLDevanagari: [`${NOTO}/NotoSansDevanagari-Regular.ttf`, `${MAC}/Kohinoor.ttc`, `${MAC}/Supplemental/DevanagariMT.ttc`],
  OLTelugu: [`${NOTO}/NotoSansTelugu-Regular.ttf`, `${MAC}/KohinoorTelugu.ttc`],
  OLTamil: [`${NOTO}/NotoSansTamil-Regular.ttf`, `${MAC}/Supplemental/Tamil Sangam MN.ttc`],
  OLThai: [`${NOTO}/NotoSansThai-Regular.ttf`, `${MAC}/ThonburiUI.ttc`, `${MAC}/Supplemental/Silom.ttf`],
  OLJapanese: [`${NOTO_CJK}/NotoSansCJK-Regular.ttc`, `${MAC}/ヒラギノ角ゴシック W5.ttc`],
  OLKorean: [`${NOTO_CJK}/NotoSansCJK-Regular.ttc`, `${MAC}/AppleSDGothicNeo.ttc`],
  OLHanTrad: [`${NOTO_CJK}/NotoSansCJK-Regular.ttc`, `${MAC}/STHeiti Medium.ttc`],
  OLHanSimp: [`${NOTO_CJK}/NotoSansCJK-Regular.ttc`, `${MAC}/Hiragino Sans GB.ttc`, `${MAC}/STHeiti Medium.ttc`],
};

const SCRIPT_FAMILY: Record<Script, string> = {
  latin: "OLLatin",
  devanagari: "OLDevanagari",
  telugu: "OLTelugu",
  tamil: "OLTamil",
  thai: "OLThai",
  japanese: "OLJapanese",
  hangul: "OLKorean",
  "han-trad": "OLHanTrad",
  "han-simp": "OLHanSimp",
};

const registered = new Set<string>();
export function registerDefaultFonts() {
  if (registered.size) return;
  for (const [family, paths] of Object.entries(CANDIDATES)) {
    const p = paths.find((x) => existsSync(x));
    if (p && registerFont(p, family)) registered.add(family);
  }
}

/** Families that actually registered (for diagnostics/tests). */
export const registeredFonts = () => [...registered];

/** CSS font-family list for a language: script font first, Latin fallback for digits/brand text. */
export function fontFor(lang: string): string {
  const script = isLang(lang) ? LANGUAGES[lang].script : "latin";
  const fam = SCRIPT_FAMILY[script];
  return fam === "OLLatin" ? "OLLatin, sans-serif" : `${fam}, OLLatin, sans-serif`;
}
