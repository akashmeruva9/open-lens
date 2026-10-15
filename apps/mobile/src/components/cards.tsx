import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration, relativeTime } from '@/lib/format';
import { languageNative, marketName, type HomeItem } from '@/lib/home';
import { usePalette } from '@/lib/settings';
import { evidenceTone, onMedia, radius, space } from '@/theme';

import { Icon } from './icon';
import { Poster, Scrim } from './media';
import { T } from './ui';

// ---------- shared bits ----------

export function evidenceA11y(i: HomeItem): string {
  const e = i.evidence;
  return `${e.supported} supported, ${e.contested} contested, ${e.unverified} unverified claims`;
}

/** Compact evidence dot-counts for card metadata rows: ● 3  ● 1  ● 0 (colour + number + a11y text). */
export function EvidenceDots({ item }: { item: HomeItem }) {
  const p = usePalette();
  const parts = [
    ['supported', item.evidence.supported],
    ['contested', item.evidence.contested],
    ['unverified', item.evidence.unverified],
  ] as const;
  return (
    <View style={styles.dots} accessible accessibilityLabel={evidenceA11y(item)}>
      {parts.map(([state, n]) => {
        const t = evidenceTone(state, p);
        return (
          <View key={state} style={styles.dotItem}>
            <View style={[styles.dot, { backgroundColor: t.fg }]} />
            <Text maxFontSizeMultiplier={1.6} style={[styles.dotText, { color: p.textFaint }]}>
              {n}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function MetaRow({ item }: { item: HomeItem }) {
  return (
    <View style={styles.meta}>
      <T variant="label" tone="faint" numberOfLines={1} style={{ flexShrink: 1 }}>
        {marketName(item.region)} · {relativeTime(item.updatedAt)}
      </T>
      <EvidenceDots item={item} />
    </View>
  );
}

function MediaPill({ label, icon }: { label: string; icon?: string }) {
  return (
    <View style={styles.mediaPill}>
      {icon ? <Icon name={icon} size={11} color={onMedia.text} /> : null}
      <Text maxFontSizeMultiplier={1.4} style={styles.mediaPillText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StatusPills({ item }: { item: HomeItem }) {
  const p = usePalette();
  if (!item.corrected) return null;
  return (
    <View style={[styles.mediaPill, { backgroundColor: p.live }]}>
      <Text style={styles.mediaPillText}>Corrected</Text>
    </View>
  );
}

export function videoA11y(i: HomeItem) {
  const parts = ['Video', i.title, marketName(i.region)];
  if (i.video?.durationSeconds) parts.push(formatDuration(i.video.durationSeconds));
  if (i.video?.lang) parts.push(languageNative(i.video.lang) ?? i.video.lang);
  if (i.corrected) parts.push('corrected');
  parts.push(evidenceA11y(i));
  if (i.video?.aiPresenter) parts.push('AI presenter');
  return parts.join(', ');
}

export function storyA11y(i: HomeItem) {
  return ['Story', i.title, marketName(i.region), relativeTime(i.updatedAt), i.corrected ? 'corrected' : '', evidenceA11y(i)].filter(Boolean).join(', ');
}

// ---------- VideoCard (9:16) ----------

export function VideoCard({ item, width, onPress }: { item: HomeItem; width: number; onPress: () => void }) {
  const v = item.video;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={videoA11y(item)}
      accessibilityHint="Plays the video full screen; swipe up for the next one"
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.thumb916, { width }]}>
        <Poster title={item.title} eyebrow={marketName(item.region)} thumbnail={v?.thumbnailUrl} titleSize="small" style={StyleSheet.absoluteFill} showTitle={false} />
        <Scrim height="45%" />
        <View style={styles.topRow}>
          {v?.lang ? <MediaPill label={languageNative(v.lang) ?? v.lang} /> : <View />}
          {v?.aiPresenter ? <MediaPill label="AI presenter" /> : null}
        </View>
        <View style={styles.bottomRow}>
          {v?.durationSeconds ? <MediaPill label={formatDuration(v.durationSeconds)} icon="play" /> : <MediaPill label="Video" icon="play" />}
          <StatusPills item={item} />
        </View>
      </View>
      <T variant="card" numberOfLines={4} style={styles.cardTitle}>
        {item.title}
      </T>
      <MetaRow item={item} />
    </Pressable>
  );
}

// ---------- PosterCard (9:16, no video) ----------

export function PosterCard({ item, width, onPress }: { item: HomeItem; width: number; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={storyA11y(item)}
      accessibilityHint="Opens the story and its evidence"
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.thumb916, { width, borderColor: p.border, borderWidth: StyleSheet.hairlineWidth }]}>
        <Poster title={item.title} eyebrow={marketName(item.region)} tone="surface" titleSize="small" thumbnail={item.heroImage} style={StyleSheet.absoluteFill} />
        <View style={[styles.readBadge, { backgroundColor: p.ink }]}>
          <Icon name="reader-outline" size={15} color={p.inkText} />
        </View>
        {item.corrected ? (
          <View style={styles.bottomRowLeft}>
            <StatusPills item={item} />
          </View>
        ) : null}
      </View>
      {/* Headline is set inside the poster; only metadata below. */}
      <MetaRow item={item} />
    </Pressable>
  );
}

// ---------- ExplainerCard (3:2, ArticleSlider) ----------

export function ExplainerCard({ item, width, onPress }: { item: HomeItem; width: number; onPress: () => void }) {
  const p = usePalette();
  const chip = item.topics[0] ? item.topics[0][0].toUpperCase() + item.topics[0].slice(1) : marketName(item.region);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Explainer, ${storyA11y(item).replace(/^Story, /, '')}`}
      accessibilityHint="Opens the story and its evidence"
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.thumb32, { width, borderColor: p.border, borderWidth: StyleSheet.hairlineWidth }]}>
        <Poster title={item.title} tone="dark" titleSize="small" thumbnail={item.heroImage} style={StyleSheet.absoluteFill} showTitle={false} />
        <View style={styles.explainerMark}>
          <Text style={styles.explainerMarkText} numberOfLines={2}>
            {marketName(item.region)}
          </Text>
        </View>
      </View>
      <View style={[styles.chip, { backgroundColor: p.surface, borderColor: p.border }]}>
        <Text maxFontSizeMultiplier={1.5} style={[styles.chipText, { color: p.text }]}>
          {chip}
        </Text>
      </View>
      <T variant="card" numberOfLines={3} style={{ marginTop: space.xs }}>
        {item.title}
      </T>
      <MetaRow item={item} />
    </Pressable>
  );
}

// ---------- SpotlightRow (compact) ----------

export function SpotlightRow({ item, onPress }: { item: HomeItem; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.video ? videoA11y(item) : storyA11y(item)}
      style={({ pressed }) => [styles.spotRow, { borderTopColor: p.border, opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.spotThumb}>
        <Poster title={item.title} tone={item.video ? 'dark' : 'surface'} showTitle={false} thumbnail={item.video?.thumbnailUrl} style={StyleSheet.absoluteFill} />
        {item.video ? (
          <View style={styles.spotPlay}>
            <Icon name="play" size={16} color="#fff" />
          </View>
        ) : (
          <View style={styles.spotPlay}>
            <Icon name="reader-outline" size={16} color={p.text} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="label" tone="faint" numberOfLines={1}>
          {marketName(item.region)} · {relativeTime(item.updatedAt)}
          {item.corrected ? ' · Corrected' : ''}
        </T>
        <T variant="card" numberOfLines={3}>
          {item.title}
        </T>
        <T variant="caption" tone="muted" numberOfLines={2}>
          {item.summary}
        </T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  thumb916: { aspectRatio: 9 / 16, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#141414' },
  thumb32: { aspectRatio: 3 / 2, borderRadius: radius.md, overflow: 'hidden' },
  cardTitle: { marginTop: space.sm },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginTop: space.xs, flexWrap: 'wrap' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dotItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotText: { fontSize: 11, fontWeight: '600' },
  topRow: { position: 'absolute', top: 6, left: 6, right: 6, flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  bottomRow: { position: 'absolute', bottom: 8, left: 8, right: 8, flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  bottomRowLeft: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: 4 },
  mediaPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: onMedia.pill, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, maxWidth: '100%' },
  mediaPillText: { color: onMedia.text, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  readBadge: { position: 'absolute', bottom: 8, right: 8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  explainerMark: { position: 'absolute', left: space.md, bottom: space.md, right: space.md },
  explainerMarkText: { color: '#FFFFFF', fontSize: 20, lineHeight: 24, fontWeight: '800', letterSpacing: -0.3 },
  chip: { alignSelf: 'flex-start', marginTop: space.sm, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  spotRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  spotThumb: { width: 96, aspectRatio: 4 / 5, borderRadius: radius.md, overflow: 'hidden' },
  spotPlay: { position: 'absolute', right: 6, bottom: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
});
