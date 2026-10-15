import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { relativeTime } from '@/lib/format';
import { CATEGORIES, EDITIONS, editionName, marketName, type CategoryKey, type HomeItem, type RailSection } from '@/lib/home';
import { useSettings } from '@/lib/settings';
import { openStory, openWatch } from '@/lib/watch-queue';
import { evidenceOnMedia, gutter, onMedia, radius, space } from '@/theme';

import { ExplainerCard, PosterCard, SpotlightRow, VideoCard, storyA11y, videoA11y } from './cards';
import { Icon } from './icon';
import { Poster, Scrim, VideoPreview } from './media';
import { AutoPublishedChip, Button, LiveChip, Skeleton, T } from './ui';

// ---------- Header ----------

export function Wordmark() {
  const { palette: p } = useSettings();
  return (
    <View style={styles.wordmark} accessible accessibilityRole="header" accessibilityLabel="OpenLens">
      <View style={[styles.markRing, { borderColor: p.text }]}>
        <View style={[styles.markDot, { backgroundColor: p.accent }]} />
      </View>
      <Text maxFontSizeMultiplier={1.3} style={[styles.wordmarkText, { color: p.text }]}>
        openlens
      </Text>
    </View>
  );
}

export function HomeHeader({ onEdition }: { onEdition: () => void }) {
  const { settings, palette: p } = useSettings();
  return (
    <View style={[styles.header, { backgroundColor: p.background }]}>
      <Wordmark />
      <View style={{ flex: 1 }} />
      <Pressable
        onPress={onEdition}
        accessibilityRole="button"
        accessibilityLabel={`Edition: ${editionName(settings.region)}`}
        accessibilityHint="Choose which market's stories to show"
        hitSlop={6}
        style={({ pressed }) => [styles.editionPill, { borderColor: p.border, backgroundColor: p.surface, opacity: pressed ? 0.75 : 1 }]}>
        <Icon name="globe-outline" size={15} color={p.text} />
        <Text maxFontSizeMultiplier={1.4} numberOfLines={1} style={[styles.editionText, { color: p.text }]}>
          {editionName(settings.region)}
        </Text>
        <Icon name="chevron-down" size={14} color={p.text} />
      </Pressable>
      <Pressable
        onPress={() => router.push('/search')}
        accessibilityRole="button"
        accessibilityLabel="Search stories"
        hitSlop={8}
        style={styles.iconBtn}>
        <Icon name="search" size={22} color={p.text} />
      </Pressable>
    </View>
  );
}

// ---------- EditionSwitcher (bottom sheet) ----------

export function EditionSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { settings, update, palette: p } = useSettings();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: p.overlay }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close edition picker" />
      <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: p.background, paddingBottom: insets.bottom + space.md }]}>
        <View style={[styles.grabber, { backgroundColor: p.border }]} />
        <T variant="title" accessibilityRole="header" style={{ paddingHorizontal: gutter.page }}>
          Edition
        </T>
        <T variant="caption" tone="muted" style={{ paddingHorizontal: gutter.page, marginTop: 2, marginBottom: space.sm }}>
          Filters every rail. Region-wide stories appear in every edition.
        </T>
        <ScrollView accessibilityRole="radiogroup">
          {EDITIONS.map((e) => {
            const selected = settings.region === e.code;
            return (
              <Pressable
                key={e.code || 'apac'}
                onPress={() => {
                  update({ region: e.code });
                  onClose();
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${e.name}, ${e.native}`}
                style={({ pressed }) => [styles.editionRow, { borderBottomColor: p.border, backgroundColor: pressed ? p.surface : 'transparent' }]}>
                <View style={{ flex: 1 }}>
                  <T variant="headline">{e.name}</T>
                  <T variant="caption" tone="faint">
                    {e.native}
                  </T>
                </View>
                {selected ? <Icon name="checkmark-circle" size={22} color={p.accent} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---------- CategoryNav ----------

export function CategoryNav({ value, onChange }: { value: CategoryKey; onChange: (k: CategoryKey) => void }) {
  const { palette: p } = useSettings();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.catRow}
      style={[styles.catBar, { borderBottomColor: p.border, backgroundColor: p.background }]}
      accessibilityRole="tablist"
      accessibilityLabel="Categories">
      {CATEGORIES.map((c) => {
        const selected = c.key === value;
        return (
          <Pressable
            key={c.key}
            onPress={() => onChange(c.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={c.label}
            style={({ pressed }) => [styles.catItem, { opacity: pressed ? 0.7 : 1 }]}>
            <View style={[styles.catIcon, { backgroundColor: selected ? p.ink : p.surface }]}>
              <Icon name={c.icon} size={20} color={selected ? p.inkText : p.text} />
            </View>
            <Text
              maxFontSizeMultiplier={1.4}
              numberOfLines={2}
              style={[styles.catLabel, { color: selected ? p.text : p.textMuted, fontWeight: selected ? '700' : '500' }]}>
              {c.label}
            </Text>
            <View style={[styles.catUnderline, { backgroundColor: selected ? p.accent : 'transparent' }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------- SpotlightHero + SpotlightList ----------

export function SpotlightHero({ item, related, previewActive }: { item: HomeItem; related: HomeItem[]; previewActive: boolean }) {
  const { settings, palette: p } = useSettings();
  const reduceMotion = useReducedMotion();
  const autoplay = !!item.video && previewActive && !settings.lowData && !reduceMotion;
  const poster = <Poster title={item.title} eyebrow={marketName(item.region)} thumbnail={item.video?.thumbnailUrl ?? (settings.lowData ? undefined : item.heroImage)} showTitle={false} markAt="top" style={StyleSheet.absoluteFill} />;
  const open = () => (item.video ? openWatch([item, ...related], item.id) : openStory(item.id));
  const ev = item.evidence;

  return (
    <View style={{ paddingHorizontal: gutter.page, paddingTop: space.lg }}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={item.video ? videoA11y(item) : storyA11y(item)}
        accessibilityHint={item.video ? 'Plays the video full screen' : 'Opens the story'}
        style={styles.heroMedia}>
        {item.video && !settings.lowData ? (
          <VideoPreview path={item.video.url} active={autoplay} poster={poster} style={StyleSheet.absoluteFill} />
        ) : (
          poster
        )}
        <Scrim height="70%" />
        <View style={styles.heroOverlay} pointerEvents="none">
          <View style={styles.heroChips}>
            {item.corrected ? <LiveChip label="Corrected" icon="↺" /> : null}
            {item.video?.aiPresenter ? (
              <View style={styles.onMediaPill}>
                <Text style={styles.onMediaPillText}>AI presenter</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.heroEyebrow}>In the spotlight · {marketName(item.region)}</Text>
          <Text maxFontSizeMultiplier={1.5} style={styles.heroTitle} numberOfLines={6}>
            {item.title}
          </Text>
          <View style={styles.heroChips}>
            {(
              [
                ['supported', ev.supported],
                ['contested', ev.contested],
                ['unverified', ev.unverified],
              ] as const
            )
              .filter(([, n]) => n > 0)
              .map(([st, n]) => {
                const c = evidenceOnMedia(st);
                return (
                  <View key={st} style={[styles.evChip, { backgroundColor: c.bg }]}>
                    <Text maxFontSizeMultiplier={1.4} style={[styles.evChipText, { color: c.fg }]}>
                      {n} {st}
                    </Text>
                  </View>
                );
              })}
          </View>
        </View>
        {item.video ? (
          <View style={styles.heroPlay} pointerEvents="none">
            <Icon name="play" size={26} color="#fff" />
          </View>
        ) : null}
      </Pressable>

      <T variant="dek" tone="muted" style={{ marginTop: space.md }}>
        {item.summary}
      </T>
      {item.autoPublished ? (
        <View style={{ marginTop: space.sm }}>
          <AutoPublishedChip />
        </View>
      ) : null}
      <T variant="label" tone="faint" style={{ marginTop: space.sm }}>
        Updated {relativeTime(item.updatedAt)} · {item.sourceCount} sources
      </T>
      <View style={styles.heroCtas}>
        {item.video ? <Button kind="ink" label="Watch" icon="▶" onPress={open} style={{ flex: 1 }} accessibilityHint="Plays the video full screen" /> : null}
        <Button kind="outline" label="Open the research" onPress={() => openStory(item.id)} style={{ flex: item.video ? 1.3 : 1 }} accessibilityHint="Opens the story with lenses and evidence" />
      </View>
      {related.length ? (
        <View style={{ marginTop: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.border }}>
          {related.map((r) => (
            <SpotlightRow key={r.id} item={r} onPress={() => (r.video ? openWatch(related, r.id) : openStory(r.id))} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------- Rail ----------

export function Rail({ section, onViewAll, actionLabel = 'View all' }: { section: RailSection; onViewAll?: () => void; actionLabel?: string }) {
  const { palette: p } = useSettings();
  const { width } = useWindowDimensions();
  const explainer = section.kind === 'explainer';
  // ~2.3 vertical cards visible on phones (≈1.4 for 3:2 explainers); capped on tablets.
  const visible = explainer ? Math.max(1.4, width / 300) : Math.max(2.3, width / 175);
  const cardW = Math.floor((width - gutter.page - gutter.rail * Math.floor(visible)) / visible);
  const snap = cardW + gutter.rail;

  const renderItem = useCallback(
    ({ item }: { item: HomeItem }) => {
      if (explainer) return <ExplainerCard item={item} width={cardW} onPress={() => openStory(item.id)} />;
      if (item.video) return <VideoCard item={item} width={cardW} onPress={() => openWatch(section.items, item.id)} />;
      return <PosterCard item={item} width={cardW} onPress={() => openStory(item.id)} />;
    },
    [cardW, explainer, section.items],
  );

  return (
    <View style={styles.rail}>
      <View style={styles.railHead}>
        <Icon name={section.icon} size={22} color={p.text} />
        <T variant="rail" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={2}>
          {section.title}
        </T>
        {onViewAll && section.items.length > 2 ? (
          <Pressable onPress={onViewAll} accessibilityRole="button" accessibilityLabel={`${actionLabel}: ${section.title}`} hitSlop={8} style={styles.viewAll}>
            <Text maxFontSizeMultiplier={1.4} style={{ color: p.accent, fontWeight: '700', fontSize: 14 }}>
              {actionLabel} →
            </Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={section.items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        snapToInterval={snap}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: gutter.page, gap: gutter.rail }}
        initialNumToRender={4}
        windowSize={5}
        accessibilityLabel={`${section.title}, carousel, ${section.items.length} items`}
      />
    </View>
  );
}

// ---------- Wire (newest first list) ----------

export function WireList({ items }: { items: HomeItem[] }) {
  return (
    <View style={{ paddingHorizontal: gutter.page, paddingTop: space.lg }}>
      <T variant="rail" accessibilityRole="header">
        Wire
      </T>
      <T variant="caption" tone="muted" style={{ marginTop: 2, marginBottom: space.sm }}>
        Everything in this edition, newest first.
      </T>
      {items.map((i) => (
        <SpotlightRow key={i.id} item={i} onPress={() => (i.video ? openWatch(items, i.id) : openStory(i.id))} />
      ))}
    </View>
  );
}

// ---------- Skeleton ----------

export function HomeSkeleton() {
  const { width } = useWindowDimensions();
  const cardW = Math.floor((width - gutter.page - gutter.rail * 2) / 2.3);
  return (
    <View accessible accessibilityLabel="Loading stories" style={{ paddingTop: space.lg }}>
      <View style={{ paddingHorizontal: gutter.page, gap: space.sm }}>
        <Skeleton style={{ width: '100%', aspectRatio: 4 / 5, borderRadius: radius.lg }} />
        <Skeleton style={{ width: '90%', height: 18 }} />
        <Skeleton style={{ width: '60%', height: 18 }} />
      </View>
      <View style={{ paddingHorizontal: gutter.page, marginTop: space.xl }}>
        <Skeleton style={{ width: 160, height: 24 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: gutter.rail, paddingLeft: gutter.page, marginTop: space.md, overflow: 'hidden' }}>
        {[0, 1, 2].map((k) => (
          <View key={k} style={{ width: cardW, gap: space.sm }}>
            <Skeleton style={{ width: cardW, aspectRatio: 9 / 16 }} />
            <Skeleton style={{ width: '90%', height: 14 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function useEditionSheet() {
  const [open, setOpen] = useState(false);
  return { open: () => setOpen(true), sheet: <EditionSheet visible={open} onClose={() => setOpen(false)} /> };
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: gutter.page, minHeight: 56 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  markRing: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  markDot: { width: 8, height: 8, borderRadius: 4 },
  wordmarkText: { fontSize: 22, fontWeight: '900', letterSpacing: -0.8 },
  editionPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: 10, minHeight: 36, maxWidth: 170 },
  editionText: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80%', borderTopLeftRadius: radius.lg * 2, borderTopRightRadius: radius.lg * 2, paddingTop: space.sm },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: space.md },
  editionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: gutter.page, paddingVertical: space.md, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  catBar: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  catRow: { paddingHorizontal: gutter.page - 4, gap: 2 },
  catItem: { alignItems: 'center', width: 76, paddingTop: space.sm, gap: 4 },
  catIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: 12, lineHeight: 15, textAlign: 'center' },
  catUnderline: { height: 3, width: 28, borderRadius: 2, marginTop: 4 },
  heroMedia: { width: '100%', aspectRatio: 4 / 5, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#141414' },
  heroOverlay: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, gap: space.sm },
  heroEyebrow: { color: onMedia.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  heroTitle: { color: onMedia.text, fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroPlay: { position: 'absolute', top: space.lg, right: space.lg, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 },
  onMediaPill: { backgroundColor: onMedia.pill, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  onMediaPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  evChip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  evChipText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  heroCtas: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  rail: { marginTop: space.xl + space.sm },
  railHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: gutter.page, marginBottom: space.md },
  viewAll: { minHeight: 32, justifyContent: 'center' },
});
