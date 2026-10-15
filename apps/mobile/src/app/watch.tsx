import { AI_DISCLOSURE, uiStrings } from '@openlens/config';
import { useEvent, useEventListener } from 'expo';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ViewToken } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Poster, Scrim, toSource } from '@/components/media';
import { CenteredState } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { mediaItems, scriptForLang } from '@/lib/bundle';
import { formatDuration, relativeTime } from '@/lib/format';
import { languageNative, marketName, toHomeItem, type HomeItem } from '@/lib/home';
import { useSettings } from '@/lib/settings';
import { shareStory } from '@/lib/share';
import type { ScriptPayload } from '@/lib/types';
import { useResource } from '@/lib/use-resource';
import { useStory } from '@/lib/use-story';
import { openStory, queuedItems } from '@/lib/watch-queue';
import { evidenceOnMedia, onMedia, radius, space } from '@/theme';

/** "Shorts"-style vertical pager over the videos of the rail the reader tapped. */
export default function WatchPager() {
  const { ids: idsParam, start } = useLocalSearchParams<{ ids?: string; start?: string }>();
  const ids = useMemo(() => (idsParam ? idsParam.split(',').filter(Boolean) : []), [idsParam]);
  const queued = useMemo(() => queuedItems(ids), [ids]);

  // Cold start / deep link: rebuild the queue from the feed.
  const feed = useResource<HomeItem[]>(
    queued ? null : `watch:${idsParam}`,
    async () => {
      if (queued) return queued;
      const all = (await api.feed()).map(toHomeItem);
      const byId = new Map(all.map((i) => [i.id, i]));
      return ids.map((id) => byId.get(id)).filter((i): i is HomeItem => !!i?.video);
    },
    [idsParam],
  );
  const items = queued ?? feed.data ?? [];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      {items.length ? (
        <Pager items={items} startId={start} />
      ) : feed.loading ? (
        <CenteredState loading body="Loading videos…" />
      ) : (
        <CenteredState title="No videos to play" body={feed.error ? errorMessage(feed.error) : 'These stories have no video yet.'} action={{ label: 'Close', onPress: () => router.back() }} />
      )}
    </View>
  );
}

function Pager({ items, startId }: { items: HomeItem[]; startId?: string }) {
  const initial = Math.max(0, items.findIndex((i) => i.id === startId));
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(initial);
  const [muted, setMuted] = useState(true);
  const [captions, setCaptions] = useState(true);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<HomeItem>[] }) => {
    const i = viewableItems[0]?.index;
    if (typeof i === 'number') setActive(i);
  }).current;
  const viewability = useRef({ itemVisiblePercentThreshold: 70 }).current;

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 ? (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          pagingEnabled
          snapToInterval={height}
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          initialScrollIndex={initial}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewability}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          extraData={`${active}-${muted}-${captions}`}
          accessibilityLabel="Videos. Swipe up or down for the next video."
          renderItem={({ item, index }) => (
            <ShortPage
              item={item}
              height={height}
              active={index === active}
              index={index}
              total={items.length}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              captions={captions}
              onToggleCaptions={() => setCaptions((c) => !c)}
            />
          )}
        />
      ) : null}
    </View>
  );
}

function ShortPage({
  item,
  height,
  active,
  index,
  total,
  muted,
  onToggleMute,
  captions,
  onToggleCaptions,
}: {
  item: HomeItem;
  height: number;
  active: boolean;
  index: number;
  total: number;
  muted: boolean;
  onToggleMute: () => void;
  captions: boolean;
  onToggleCaptions: () => void;
}) {
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const s = useStory(item.id);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [userStarted, setUserStarted] = useState(false);
  const [loadOnLowData, setLoadOnLowData] = useState(false);
  const [line, setLine] = useState(0);

  // Prefer the reader's language when a rendition exists in it.
  const video = useMemo(() => {
    if (!s.data) return null;
    const vids = mediaItems(s.data).filter((m) => m.kind === 'video');
    return vids.find((v) => v.output.lang === settings.lang) ?? vids[0] ?? null;
  }, [s.data, settings.lang]);
  const lang = video?.output.lang ?? item.video?.lang ?? 'en';
  const script: ScriptPayload | undefined = video?.script ?? (s.data ? scriptForLang(s.data, lang) : undefined);
  const strings = uiStrings(lang);
  const duration = (video?.kind === 'video' ? video.payload.durationSeconds : undefined) ?? item.video?.durationSeconds;
  const path = video?.kind === 'video' ? (video.payload.hlsUrl ?? video.payload.mp4Url) : item.video?.url;

  const mayLoad = !settings.lowData || loadOnLowData;
  const shouldPlay = active && mayLoad && (!reduceMotion || userStarted);

  useEffect(() => {
    if (!active) setLine(0);
  }, [active]);

  const ev = item.evidence;
  const a11yTitle = `Video ${index + 1} of ${total}: ${item.title}, ${marketName(item.region)}${duration ? `, ${formatDuration(duration)}` : ''}, ${languageNative(lang)}`;

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (reduceMotion && !userStarted) setUserStarted(true);
          else onToggleMute();
        }}
        accessibilityRole="button"
        accessibilityLabel={a11yTitle}
        accessibilityHint={reduceMotion && !userStarted ? 'Starts the video' : muted ? 'Unmutes the video' : 'Mutes the video'}>
        <Poster title={item.title} eyebrow={marketName(item.region)} showTitle={false} markAt="top" thumbnail={item.video?.thumbnailUrl} style={StyleSheet.absoluteFill} />
        {active && path && mayLoad ? (
          <ShortVideo
            key={path}
            path={path}
            playing={shouldPlay}
            muted={muted}
            lines={script?.lines.length ?? 0}
            duration={duration}
            onLine={setLine}
          />
        ) : null}
      </Pressable>

      <Scrim height="60%" />
      <View style={[styles.topScrim]} pointerEvents="none" />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close videos" hitSlop={10} style={styles.roundBtn}>
          <Icon name="close" size={24} color="#fff" />
        </Pressable>
        <View style={styles.aiChip} accessible accessibilityLabel={`${strings.aiPresenter}. ${AI_DISCLOSURE[lang] ?? AI_DISCLOSURE.en}`}>
          <Icon name="sparkles" size={12} color="#fff" />
          <Text style={styles.aiChipText}>{strings.aiPresenter}</Text>
        </View>
        <Text style={styles.counter} accessibilityElementsHidden importantForAccessibility="no">
          {index + 1}/{total}
        </Text>
      </View>

      {/* Mute hint */}
      {active ? (
        <View style={[styles.hint, { top: insets.top + 64 }]} pointerEvents="none">
          {settings.lowData && !loadOnLowData ? null : reduceMotion && !userStarted ? (
            <View style={styles.hintPill}>
              <Icon name="play" size={14} color="#fff" />
              <Text style={styles.hintText}>Tap to play</Text>
            </View>
          ) : muted ? (
            <View style={styles.hintPill}>
              <Icon name="volume-mute" size={14} color="#fff" />
              <Text style={styles.hintText}>Tap to unmute</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {settings.lowData && !loadOnLowData ? (
        <View style={styles.lowData}>
          <Text style={styles.lowDataText}>Low-data mode: video isn&apos;t loaded automatically.</Text>
          <Pressable onPress={() => setLoadOnLowData(true)} accessibilityRole="button" accessibilityLabel="Load this video" style={styles.whiteBtn}>
            <Text style={styles.whiteBtnText}>Load video</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Right action column */}
      <View style={[styles.actions, { bottom: insets.bottom + 190 }]}>
        <ActionButton icon={muted ? 'volume-mute' : 'volume-high'} label={muted ? 'Unmute' : 'Mute'} onPress={onToggleMute} />
        <ActionButton icon="text" label={captions ? 'Captions on' : 'Captions off'} onPress={onToggleCaptions} selected={captions} />
        <ActionButton icon="document-text-outline" label="Transcript" onPress={() => setTranscriptOpen(true)} disabled={!script} />
        <ActionButton icon="share-outline" label="Share" onPress={() => shareStory(item)} />
      </View>

      {/* Bottom info */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]} pointerEvents="box-none">
        {captions && script?.lines[line] ? (
          <View style={styles.caption} accessibilityLiveRegion="polite">
            <Text maxFontSizeMultiplier={1.6} style={styles.captionText}>
              {script.lines[line].text}
            </Text>
          </View>
        ) : null}
        <Text style={styles.eyebrow} numberOfLines={1}>
          {marketName(item.region)} · {relativeTime(item.updatedAt)} · {languageNative(lang)}
          {duration ? ` · ${formatDuration(duration)}` : ''}
        </Text>
        <Text maxFontSizeMultiplier={1.5} style={styles.title} numberOfLines={4} accessibilityRole="header">
          {item.title}
        </Text>
        <View style={styles.chips}>
          {item.corrected ? (
            <View style={[styles.evChip, { backgroundColor: '#E5383B' }]}>
              <Text style={[styles.evChipText, { color: '#fff' }]}>↺ Corrected</Text>
            </View>
          ) : null}
          {(
            [
              ['supported', ev.supported],
              ['contested', ev.contested],
              ['unverified', ev.unverified],
            ] as const
          ).map(([st, n]) => {
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
        <Text maxFontSizeMultiplier={1.4} style={styles.disclosure} numberOfLines={3}>
          {AI_DISCLOSURE[lang] ?? AI_DISCLOSURE.en}
        </Text>
        <Pressable
          onPress={() => openStory(item.id)}
          accessibilityRole="button"
          accessibilityLabel="Open the research"
          accessibilityHint="Opens the story with sources, claims and outlet framing"
          style={({ pressed }) => [styles.researchBtn, { opacity: pressed ? 0.85 : 1 }]}>
          <Icon name="reader-outline" size={18} color="#0A0A0A" />
          <Text style={styles.researchText}>Open the research</Text>
          <Icon name="arrow-forward" size={16} color="#0A0A0A" />
        </Pressable>
      </View>

      <TranscriptSheet visible={transcriptOpen} onClose={() => setTranscriptOpen(false)} script={script} title={item.title} />
    </View>
  );
}

/** The actual player; mounted only for the active page so at most one decoder runs. */
function ShortVideo({
  path,
  playing,
  muted,
  lines,
  duration,
  onLine,
}: {
  path: string;
  playing: boolean;
  muted: boolean;
  lines: number;
  duration?: number;
  onLine: (i: number) => void;
}) {
  const [rendered, setRendered] = useState(false);
  const player = useVideoPlayer(toSource(path), (pl) => {
    pl.loop = true;
    pl.muted = true;
    pl.timeUpdateEventInterval = 0.5;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);
  useEffect(() => {
    if (playing && status !== 'error') player.play();
    else player.pause();
  }, [playing, status, player]);
  const onTime = useCallback(
    ({ currentTime }: { currentTime: number }) => {
      const total = duration || player.duration;
      if (!lines || !total) return;
      onLine(Math.min(lines - 1, Math.floor((currentTime / total) * lines)));
    },
    [duration, lines, onLine, player],
  );
  useEventListener(player, 'timeUpdate', onTime);

  if (status === 'error') {
    return (
      <View style={styles.unavailable} pointerEvents="none">
        <Text style={styles.unavailableText}>Video unavailable offline · captions and transcript still work</Text>
      </View>
    );
  }
  return (
    <VideoView
      player={player}
      style={[StyleSheet.absoluteFill, { opacity: rendered ? 1 : 0 }]}
      nativeControls={false}
      contentFit="cover"
      surfaceType="textureView"
      onFirstFrameRender={() => setRendered(true)}
      importantForAccessibility="no-hide-descendants"
    />
  );
}

function ActionButton({ icon, label, onPress, selected, disabled }: { icon: string; label: string; onPress: () => void; selected?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      hitSlop={6}
      style={({ pressed }) => [styles.action, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
      <View style={[styles.actionIcon, selected && { backgroundColor: 'rgba(255,255,255,0.28)' }]}>
        <Icon name={icon} size={22} color="#fff" />
      </View>
      <Text maxFontSizeMultiplier={1.3} style={styles.actionLabel} numberOfLines={1}>
        {label.replace(/ (on|off)$/, '')}
      </Text>
    </Pressable>
  );
}

function TranscriptSheet({ visible, onClose, script, title }: { visible: boolean; onClose: () => void; script?: ScriptPayload; title: string }) {
  const { palette: p } = useSettings();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: p.overlay }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close transcript" />
      <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: p.background, paddingBottom: insets.bottom + space.lg }]}>
        <View style={[styles.grabber, { backgroundColor: p.border }]} />
        <Text style={[styles.sheetTitle, { color: p.text }]} accessibilityRole="header">
          Transcript
        </Text>
        <Text style={{ color: p.textFaint, fontSize: 13, marginBottom: space.md }}>{script?.title ?? title} · every line cites the evidence ledger</Text>
        <ScrollView contentContainerStyle={{ gap: space.md }}>
          {script?.lines.map((l, i) => (
            <View key={i} style={{ gap: 2 }}>
              <Text style={{ color: p.textFaint, fontSize: 12, fontWeight: '600' }}>
                {l.label.charAt(0) + l.label.slice(1).toLowerCase()} · cites {l.claimIds.join(', ')}
              </Text>
              <Text style={{ color: p.text, fontSize: 16, lineHeight: 24 }}>{l.text}</Text>
            </View>
          )) ?? <Text style={{ color: p.textMuted }}>No transcript for this language yet.</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, backgroundColor: 'rgba(0,0,0,0.25)' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  roundBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  aiChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: onMedia.pill, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  aiChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  counter: { marginLeft: 'auto', color: onMedia.textMuted, fontSize: 13, fontWeight: '600' },
  hint: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hintPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: onMedia.pill, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  hintText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  lowData: { position: 'absolute', top: '35%', left: space.xl, right: space.xl, alignItems: 'center', gap: space.md },
  lowDataText: { color: '#fff', fontSize: 15, textAlign: 'center' },
  whiteBtn: { backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: space.lg, minHeight: 44, justifyContent: 'center' },
  whiteBtnText: { color: '#0A0A0A', fontWeight: '700', fontSize: 15 },
  actions: { position: 'absolute', right: space.sm, gap: space.md, alignItems: 'center' },
  action: { alignItems: 'center', width: 64, gap: 2 },
  actionIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  actionLabel: { color: '#fff', fontSize: 11, fontWeight: '600' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingLeft: space.lg, paddingRight: 84, gap: space.sm },
  caption: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 4, marginBottom: space.sm },
  captionText: { color: '#fff', fontSize: 16, lineHeight: 22, fontWeight: '600' },
  eyebrow: { color: onMedia.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  title: { color: '#fff', fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  evChip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  evChipText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  disclosure: { color: onMedia.textMuted, fontSize: 12, lineHeight: 16 },
  researchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, backgroundColor: '#fff', borderRadius: radius.pill, minHeight: 48, marginTop: space.xs, marginRight: -68 },
  researchText: { color: '#0A0A0A', fontSize: 16, fontWeight: '700' },
  unavailable: { position: 'absolute', top: '38%', left: space.xl, right: 84, alignItems: 'center' },
  unavailableText: { color: onMedia.textMuted, fontSize: 13, textAlign: 'center' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '75%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: space.lg, paddingTop: space.sm },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: space.md },
  sheetTitle: { fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.3 },
});
