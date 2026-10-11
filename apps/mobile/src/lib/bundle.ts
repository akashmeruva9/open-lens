import type { AudioPayload, Claim, OutputRecord, ScriptPayload, SourceRecord, StoryBundle, VideoPayload } from './types';

/** Output statuses a reader may see. */
const READER_VISIBLE = new Set(['approved', 'scheduled', 'published']);

export function claimMap(b: StoryBundle): Map<string, Claim> {
  return new Map(b.claims.map((c) => [c.id, c]));
}

export function sourceMap(b: StoryBundle): Map<string, SourceRecord> {
  return new Map(b.sources.map((s) => [s.id, s]));
}

export type MediaItem =
  | { kind: 'video'; output: OutputRecord; payload: VideoPayload; script?: ScriptPayload }
  | { kind: 'audio'; output: OutputRecord; payload: AudioPayload; script?: ScriptPayload };

function scriptFor(b: StoryBundle, scriptOutputId: string | undefined, lang: string): ScriptPayload | undefined {
  const byId = scriptOutputId ? b.outputs.find((o) => o.id === scriptOutputId && o.kind === 'script') : undefined;
  const byLang = b.outputs.find((o) => o.kind === 'script' && o.lang === lang);
  const out = byId ?? byLang;
  return out ? (out.payload as unknown as ScriptPayload) : undefined;
}

/** In-app video/audio renditions (channel "app"), reader-visible only. */
export function mediaItems(b: StoryBundle): MediaItem[] {
  const items: MediaItem[] = [];
  for (const o of b.outputs) {
    if (!READER_VISIBLE.has(o.status) || o.channel !== 'app') continue;
    if (o.kind === 'video') {
      const p = o.payload as unknown as VideoPayload;
      if (p?.mp4Url || p?.hlsUrl) items.push({ kind: 'video', output: o, payload: p, script: scriptFor(b, p.scriptOutputId, o.lang) });
    } else if (o.kind === 'audio') {
      const p = o.payload as unknown as AudioPayload;
      if (p?.audioUrl) items.push({ kind: 'audio', output: o, payload: p, script: scriptFor(b, p.scriptOutputId, o.lang) });
    }
  }
  return items;
}

/** Languages that have an approved script (transcript) even if media isn't rendered yet. */
export function scriptLanguages(b: StoryBundle): string[] {
  return b.outputs.filter((o) => o.kind === 'script' && READER_VISIBLE.has(o.status)).map((o) => o.lang);
}

export function scriptForLang(b: StoryBundle, lang: string): ScriptPayload | undefined {
  const o = b.outputs.find((x) => x.kind === 'script' && x.lang === lang && READER_VISIBLE.has(x.status));
  return o ? (o.payload as unknown as ScriptPayload) : undefined;
}

export function isCorrected(b: StoryBundle): boolean {
  return b.story.status === 'corrected' || b.corrections.length > 0;
}
