export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const s = Math.round((now - t) / 1000);
  if (s < 0) return formatDate(iso);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return formatDate(iso);
}

export function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function hostOf(url: string): string {
  const m = /^https?:\/\/([^/]+)/i.exec(url);
  return m ? m[1].replace(/^www\./, '') : url;
}

/** Split `text` into [before, match, after] around the first occurrence of `passage` (whitespace/case tolerant). */
export function splitPassage(text: string, passage: string): [string, string, string] | null {
  const exact = text.indexOf(passage);
  if (exact >= 0) return [text.slice(0, exact), passage, text.slice(exact + passage.length)];
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const target = norm(passage);
  if (!target) return null;
  // Map normalized index back onto the original string.
  const map: number[] = [];
  let normalized = '';
  let prevSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (prevSpace || normalized.length === 0) continue;
      normalized += ' ';
      prevSpace = true;
    } else {
      normalized += ch.toLowerCase();
      prevSpace = false;
    }
    map.push(i);
  }
  const at = normalized.indexOf(target);
  if (at < 0) return null;
  const start = map[at];
  const end = map[at + target.length - 1] + 1;
  return [text.slice(0, start), text.slice(start, end), text.slice(end)];
}
