// Text utilities shared by agents, media rendering and publishers.

const X_URL_RE = /https?:\/\/[^\s]+/gi;
// twitter-text v3: these code point ranges weigh 1; everything else (CJK, Thai, emoji…) weighs 2.
const X_LIGHT_RANGES: [number, number][] = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];

/** X/Twitter weighted length: URLs count 23, CJK/Hangul/Thai and emoji count 2. */
export function xWeightedLength(text: string): number {
  let len = 0;
  const withoutUrls = text.normalize("NFC").replace(X_URL_RE, () => {
    len += 23;
    return "";
  });
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(withoutUrls)) {
    if (/\p{Extended_Pictographic}/u.test(segment)) {
      len += 2;
      continue;
    }
    for (const ch of segment) {
      const cp = ch.codePointAt(0)!;
      len += X_LIGHT_RANGES.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
    }
  }
  return len;
}

/** Truncate to an X weighted budget, ending with an ellipsis. */
export function xTruncate(text: string, max: number): string {
  if (xWeightedLength(text) <= max) return text;
  let out = "";
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
    if (xWeightedLength(out + segment) > max - 1) break;
    out += segment;
  }
  return `${out}…`;
}

/**
 * Break text into line-break units. Uses word segmentation so scripts without spaces
 * (Japanese, Chinese, Thai) wrap between words instead of overflowing.
 */
export function breakUnits(text: string, lang: string): string[] {
  const seg = new Intl.Segmenter(lang, { granularity: "word" });
  const units: string[] = [];
  for (const { segment } of seg.segment(text)) {
    const prev = units.at(-1);
    // Keep whitespace and closing punctuation (incl. the Devanagari danda) attached to the previous unit, and keep
    // CJK numbers with their counters/dates together ("2027年1月1日", "20％", "600ルピー" never split after the digits).
    if (
      prev !== undefined &&
      (/^\s+$/.test(segment) ||
        /^[、。，．！？」』）)\]!?,.:;%％।॥]+$/.test(segment) ||
        (/\d$/.test(prev) && /^[年月日時分秒円人件歳倍回か所ヶ个元년월일명]/.test(segment)) ||
        (/\d[年月]$/.test(prev) && /^\d/.test(segment)))
    )
      units[units.length - 1] += segment;
    else units.push(segment);
  }
  return units;
}

/** Greedy line wrap using a width measure (e.g. canvas measureText). */
export function wrapText(text: string, lang: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const u of breakUnits(text, lang)) {
    const test = line + u;
    if (measure(test.trimEnd()) > maxWidth && line.trim()) {
      lines.push(line.trimEnd());
      line = u.trimStart();
    } else line = test;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/** Numbers in text, normalising full-width digits (２０％ → 20) and thousands separators. */
export function numbersIn(text: string): string[] {
  return (text.normalize("NFKC").match(/\d[\d,]*(?:\.\d+)?%?/g) ?? []).map((n) => n.replace(/,/g, "").replace(/%$/, ""));
}
