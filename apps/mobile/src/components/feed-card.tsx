import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { assetUrl } from '@/lib/api';
import { regionName } from '@/lib/catalog';
import { plural, relativeTime } from '@/lib/format';
import { usePalette } from '@/lib/settings';
import { shareStory } from '@/lib/share';
import type { FeedItem, Lens } from '@/lib/types';
import { evidenceTone, lensTone, radius, space } from '@/theme';

import { FeedVideoPreview, MediaPlaceholder } from './media';
import { Button, EvidenceBadge, Pill, T } from './ui';

export function FeedCard({
  item,
  height,
  active,
  lowData,
  autoplay,
  bottomInset,
}: {
  item: FeedItem;
  height: number;
  active: boolean;
  lowData: boolean;
  autoplay: boolean;
  bottomInset: number;
}) {
  const p = usePalette();
  const open = () => router.push({ pathname: '/story/[id]', params: { id: item.id } });
  const updated = relativeTime(item.updatedAt);
  const ev = item.evidence;
  const a11y = [
    item.corrected ? 'Corrected story.' : '',
    item.title,
    item.summary,
    `Updated ${updated}.`,
    `${plural(item.sourceCount, 'source')}.`,
    `${ev.supported} supported, ${ev.contested} contested, ${ev.unverified} unverified claims.`,
  ].join(' ');

  const media = (() => {
    const style = styles.media;
    if (!lowData && item.videoUrl && autoplay) return <FeedVideoPreview path={item.videoUrl} active={active} style={style} />;
    if (!lowData && item.heroImage)
      return <Image source={{ uri: assetUrl(item.heroImage) }} style={style} contentFit="cover" accessibilityIgnoresInvertColors transition={200} />;
    return (
      <MediaPlaceholder
        style={style}
        title={item.videoUrl ? 'Video briefing available' : 'OpenLens'}
        body={lowData ? 'Low-data mode: media loads only when you open the story' : 'Swipe the lenses · tap for evidence'}
      />
    );
  })();

  return (
    <View style={[styles.wrap, { height, paddingBottom: bottomInset + space.md }]}>
      <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={a11y}
          accessibilityHint="Opens the story with lenses and evidence"
          style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.92 : 1 }]}>
          <View style={styles.mediaWrap}>
            {media}
            <View style={styles.overlayRow} pointerEvents="none">
              {item.corrected ? <Pill label="Corrected" icon="↺" fg="#fff" bg="#B91C1C" /> : null}
              <Pill label={regionName(item.region)} fg="#EEF3FB" bg="rgba(4,10,22,0.7)" />
            </View>
          </View>

          <View style={styles.body}>
            <T variant="label" tone="accent" numberOfLines={1}>
              {item.topics.join(' · ') || 'News'}
            </T>
            <T variant="title" numberOfLines={4} style={{ marginTop: space.xs }}>
              {item.title}
            </T>
            <T variant="body" tone="muted" numberOfLines={4} style={{ marginTop: space.sm, flexShrink: 1 }}>
              {item.summary}
            </T>
            <View style={{ flex: 1, minHeight: space.sm }} />
            <T variant="caption" tone="faint">
              Updated {updated} · {plural(item.sourceCount, 'source')}
            </T>
            <View style={styles.row}>
              {item.lensesCovered.map((l) => {
                const t = lensTone(l as Lens, p);
                return <Pill key={l} label={t.label} fg={t.fg} bg={t.bg} accessibilityLabel={`${t.label} lens covered`} />;
              })}
            </View>
            <View style={styles.row}>
              <EvidenceBadge state="supported" count={ev.supported} />
              {ev.contested ? <EvidenceBadge state="contested" count={ev.contested} /> : <ZeroBadge label="0 contested" />}
              <EvidenceBadge state="unverified" count={ev.unverified} />
            </View>
          </View>
        </Pressable>
        <View style={[styles.actions, { borderTopColor: p.border }]}>
          <Button label="Read the evidence" onPress={open} style={{ flex: 1 }} accessibilityHint="Opens the story" />
          <Button
            kind="secondary"
            label="Share"
            icon="↗"
            onPress={() => shareStory(item)}
            accessibilityHint="Opens the share sheet with a link to this story"
          />
        </View>
      </View>
    </View>
  );
}

function ZeroBadge({ label }: { label: string }) {
  const p = usePalette();
  const t = evidenceTone('contested', p);
  return <Pill label={label} icon={t.icon} fg={p.textFaint} bg={p.surfaceAlt} />;
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.md, paddingTop: space.sm },
  card: { flex: 1, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  mediaWrap: { height: '38%', minHeight: 140 },
  media: { flex: 1, borderRadius: 0 },
  overlayRow: { position: 'absolute', top: space.md, left: space.md, right: space.md, flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  body: { flex: 1, padding: space.lg, gap: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
  },
});
