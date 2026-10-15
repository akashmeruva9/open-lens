import { AI_DISCLOSURE } from '@openlens/config';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClaimChips, useClaimSheet } from '@/components/claims';
import { ShareHeaderButton } from '@/components/header-buttons';
import { Rail } from '@/components/home';
import { Icon } from '@/components/icon';
import { LensPager } from '@/components/lens-pager';
import { Poster, StoryVideo } from '@/components/media';
import { AutoPublishedChip, Banner, CenteredState, Chip, Disclosure, EvidenceBadge, LensPill, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { isCorrected, mediaItems, scriptLanguages } from '@/lib/bundle';
import { NATIVE_LANGUAGE_NAMES, languageName, matchesRegion } from '@/lib/catalog';
import { formatDate, hostOf, plural, relativeTime } from '@/lib/format';
import { marketName, toHomeItem } from '@/lib/home';
import { useSettings } from '@/lib/settings';
import { shareStory } from '@/lib/share';
import type { AssessmentSection, EvidenceState, FeedItem } from '@/lib/types';
import { useResource } from '@/lib/use-resource';
import { useStory } from '@/lib/use-story';
import { evidenceTone, gutter, radius, space } from '@/theme';

const STATES: EvidenceState[] = ['supported', 'contested', 'attributed', 'unverified', 'superseded'];

const KNOW: Partial<Record<AssessmentSection['kind'], { title: string; tone?: EvidenceState }>> = {
  established: { title: "What's established", tone: 'supported' },
  contested: { title: "What's contested", tone: 'contested' },
  attributed: { title: 'What people say', tone: 'attributed' },
  unknown: { title: "What we don't know", tone: 'unverified' },
};

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, palette: p } = useSettings();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const s = useStory(id);
  const sheet = useClaimSheet(id ?? '', s.sources);
  const [pickedLang, setPickedLang] = useState<string | null>(null);

  const feed = useResource<FeedItem[]>('feed:home', () => api.feed(), []);
  const region = s.data?.story.region;
  const more = useMemo(() => {
    if (!region || !feed.data) return [];
    const market = region.split('-')[0];
    return feed.data.filter((f) => f.id !== id && matchesRegion(f.region, market)).map(toHomeItem);
  }, [feed.data, region, id]);

  if (s.loading && !s.data) return <CenteredState loading body="Opening story…" />;
  if (!s.data)
    return (
      <>
        <Stack.Screen options={{ title: 'Story' }} />
        <CenteredState title="Story unavailable" body={errorMessage(s.error)} action={{ label: 'Try again', onPress: s.reload }} />
      </>
    );

  const b = s.data;
  const story = b.story;
  const counts = STATES.map((st) => [st, b.claims.filter((c) => c.state === st).length] as const).filter(([, n]) => n > 0);
  const media = mediaItems(b);
  const videos = media.filter((m) => m.kind === 'video');
  const mediaLangs = [...new Set([...media.map((m) => m.output.lang), ...scriptLanguages(b)])];
  const lang = pickedLang && mediaLangs.includes(pickedLang) ? pickedLang : mediaLangs.includes(settings.lang) ? settings.lang : (videos[0]?.output.lang ?? mediaLangs[0]);
  const video = videos.find((v) => v.output.lang === lang);
  const latestCorrection = [...b.corrections].sort((a, z) => z.at.localeCompare(a.at))[0];
  const knows = (b.assessment?.sections ?? []).filter((x) => KNOW[x.kind]);
  const go = (screen: 'dossier' | 'assessment' | 'watch', params: Record<string, string> = {}) =>
    router.push({ pathname: `/story/[id]/${screen}`, params: { id: story.id, ...params } });
  const market = marketName(story.region);

  return (
    <>
      <Stack.Screen options={{ title: '', headerRight: () => <ShareHeaderButton story={story} /> }} />
      <ScrollView
        style={{ backgroundColor: p.background }}
        contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={s.refreshing} onRefresh={s.reload} tintColor={p.accent} />}>
        {/* Media (full-bleed) */}
        {video?.kind === 'video' && !settings.lowData ? (
          <View style={{ backgroundColor: '#000' }}>
          <StoryVideo
            key={video.output.id}
            title={video.script?.title ?? story.title}
            eyebrow={market}
            hlsUrl={video.payload.hlsUrl}
            mp4Url={video.payload.mp4Url}
            aspect={video.payload.aspect}
            style={{ maxHeight: Math.round(screenH * 0.62), borderRadius: 0 }}
          />
          </View>
        ) : (
          <Pressable
            disabled={!video}
            onPress={() => go('watch')}
            accessibilityRole={video ? 'button' : undefined}
            accessibilityLabel={video ? 'Low-data mode: open the video player' : undefined}>
            <Poster title={story.title} eyebrow={market} showTitle={false} style={{ width: '100%', aspectRatio: video ? 4 / 5 : 16 / 9 }} />
            <View style={styles.posterLabel} pointerEvents="none">
              <Text style={styles.posterMarket} numberOfLines={2}>
                {market}
              </Text>
              <Text style={styles.posterSub}>{video ? 'Low-data mode · tap to load the video' : 'Explainer · read the evidence'}</Text>
            </View>
          </Pressable>
        )}

        <View style={styles.content}>
          {mediaLangs.length ? (
            <View style={{ gap: space.sm }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} accessibilityLabel="Briefing language">
                {mediaLangs.map((l) => {
                  const has = videos.some((v) => v.output.lang === l);
                  return (
                    <Chip
                      key={l}
                      label={`${NATIVE_LANGUAGE_NAMES[l] ?? languageName(l)}${has ? '' : ' · text'}`}
                      accessibilityLabel={`${languageName(l)}${has ? ' video' : ', transcript only'}`}
                      selected={l === lang}
                      onPress={() => setPickedLang(l)}
                    />
                  );
                })}
              </ScrollView>
              <T variant="caption" tone="faint">
                ✦ {AI_DISCLOSURE[lang] ?? AI_DISCLOSURE.en}
              </T>
            </View>
          ) : null}

          {isCorrected(b) ? (
            <Banner
              tone="danger"
              text={latestCorrection ? `Corrected ${formatDate(latestCorrection.at)}: ${latestCorrection.reason}` : 'This story has been corrected. See the correction log below.'}
            />
          ) : null}
          {story.autoPublished ? (
            <View style={[styles.note, { borderColor: p.textFaint }]} accessibilityRole="text">
              <AutoPublishedChip />
              <T variant="caption" tone="muted">
                Auto-published by the OpenLens wire. Every fact links to its source below; no editor has reviewed this story.
                {story.checksFlagged ? ' Automated checks flagged an issue: some points may not be as well supported as they read.' : ''}
              </T>
            </View>
          ) : null}
          {s.stale ? <Banner text="Showing a saved copy; pull to refresh." onPress={s.reload} /> : null}

          <View style={{ gap: space.sm }}>
            <T variant="label" tone="faint">
              {market} · {relativeTime(story.updatedAt)} · {story.topics.join(', ')}
            </T>
            <T variant="display" accessibilityRole="header">
              {story.title}
            </T>
            <T variant="dek" tone="muted">
              {b.assessment?.neutralSummary || story.summary}
            </T>
            <View style={styles.row}>
              {counts.map(([st, n]) => (
                <EvidenceBadge key={st} state={st} count={n} />
              ))}
            </View>
            <T variant="caption" tone="faint">
              {plural(b.sources.length, 'source')} · {plural(b.claims.length, 'claim')} · ledger v{story.version}
            </T>
          </View>

          {b.lanes.length ? (
            <Section title="How outlets framed it" subtitle="Swipe between lenses">
              <LensPager lanes={b.lanes} claims={s.claims} sources={s.sources} onClaim={sheet.open} />
            </Section>
          ) : null}

          {knows.length ? (
            <Section title="What we know" subtitle="AI-drafted, editor-approved; every sentence cites the ledger. No truth score.">
              <View style={{ gap: space.md }}>
                {knows.map((k, i) => {
                  const meta = KNOW[k.kind]!;
                  const tone = meta.tone ? evidenceTone(meta.tone, p) : { fg: p.accent };
                  return (
                    <View key={`${k.kind}-${i}`} style={[styles.know, { borderLeftColor: tone.fg }]}>
                      <T variant="headline">{meta.title}</T>
                      <T variant="body" style={{ marginTop: 4, marginBottom: space.sm }}>
                        {k.text}
                      </T>
                      <ClaimChips ids={k.claimIds} claims={s.claims} onPress={sheet.open} />
                    </View>
                  );
                })}
                <LinkButton label="Read the full assessment" onPress={() => go('assessment')} />
              </View>
            </Section>
          ) : null}

          <Section title="Open the research" subtitle="Claims with highlighted source passages, timeline and legal context">
            <View style={styles.tiles}>
              {(
                [
                  ['claims', 'Claims', b.claims.length, 'checkmark-done-outline'],
                  ['timeline', 'Timeline', b.timeline.length, 'time-outline'],
                  ['context', 'Context', b.context.length, 'library-outline'],
                  ['sources', 'Sources', b.sources.length, 'newspaper-outline'],
                ] as const
              ).map(([tab, label, n, icon]) => (
                <Pressable
                  key={tab}
                  onPress={() => go('dossier', { tab })}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}: ${n}. Opens the research dossier`}
                  style={({ pressed }) => [styles.tile, { backgroundColor: p.surface, opacity: pressed ? 0.8 : 1 }]}>
                  <Icon name={icon} size={20} color={p.text} />
                  <T variant="title">{n}</T>
                  <T variant="label" tone="muted">
                    {label}
                  </T>
                </Pressable>
              ))}
            </View>
          </Section>

          {b.sources.length ? (
            <Section title="Sources">
              <Disclosure icon="◐" text="Lens ratings come from a documented outlet table, not from the model." />
              <View style={{ marginTop: space.sm }}>
                {b.sources.slice(0, 6).map((src) => (
                  <Pressable
                    key={src.id}
                    onPress={() => WebBrowser.openBrowserAsync(src.url).catch(() => {})}
                    accessibilityRole="link"
                    accessibilityLabel={`${src.publisher}: ${src.title}. ${src.lens.rating} lens. Opens in browser`}
                    style={({ pressed }) => [styles.source, { borderBottomColor: p.border, opacity: pressed ? 0.75 : 1 }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={styles.sourceHead}>
                        <T variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {src.publisher}
                        </T>
                        <LensPill lens={src.lens.rating} />
                      </View>
                      <T variant="caption" tone="muted" numberOfLines={2}>
                        {src.title}
                      </T>
                      <T variant="label" tone="faint">
                        {hostOf(src.url)} · {formatDate(src.publishedAt)}
                      </T>
                    </View>
                    <Icon name="open-outline" size={18} color={p.textFaint} />
                  </Pressable>
                ))}
                {b.sources.length > 6 ? <LinkButton label={`All ${b.sources.length} sources`} onPress={() => go('dossier', { tab: 'sources' })} /> : null}
              </View>
            </Section>
          ) : null}

          {b.corrections.length ? (
            <Section title="Correction log">
              <View style={{ gap: space.sm }}>
                {b.corrections.map((c) => (
                  <View key={c.id} style={[styles.know, { borderLeftColor: p.live }]}>
                    <T variant="label" tone="faint">
                      {formatDate(c.at)} · v{c.fromVersion} → v{c.toVersion}
                    </T>
                    <T variant="body" style={{ marginTop: 4, marginBottom: space.sm }}>
                      {c.reason}
                    </T>
                    <ClaimChips ids={c.changedClaimIds} claims={s.claims} onPress={sheet.open} />
                  </View>
                ))}
              </View>
            </Section>
          ) : null}
        </View>

        {more.length ? (
          <Rail section={{ key: 'more', title: `More from ${market}`, icon: 'location-outline', items: more, kind: 'poster' }} />
        ) : null}

        <T variant="caption" tone="faint" style={{ textAlign: 'center', paddingHorizontal: gutter.page, marginTop: space.xl }}>
          Produced by OpenLens agents from {plural(b.sources.length, 'source')}
          {story.autoPublished ? ', not editor-reviewed' : ' and reviewed by an editor'}. No numeric truth scores, ever.
        </T>
      </ScrollView>

      {/* Sticky bottom bar: Watch / Research / Share */}
      <View style={[styles.bar, { backgroundColor: p.background, borderTopColor: p.border, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
        <BarButton icon="play" label="Watch" onPress={() => go('watch')} disabled={!mediaLangs.length} />
        <BarButton icon="reader-outline" label="Research" onPress={() => go('dossier')} />
        <BarButton icon="share-outline" label="Share" onPress={() => shareStory(story)} />
      </View>
      {sheet.sheet}
    </>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: 2 }}>
        <T variant="rail" accessibilityRole="header">
          {title}
        </T>
        {subtitle ? (
          <T variant="caption" tone="muted">
            {subtitle}
          </T>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { palette: p } = useSettings();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={{ minHeight: 40, justifyContent: 'center' }}>
      <Text maxFontSizeMultiplier={1.5} style={{ color: p.accent, fontWeight: '700', fontSize: 15 }}>
        {label} →
      </Text>
    </Pressable>
  );
}

function BarButton({ icon, label, onPress, disabled }: { icon: string; label: string; onPress: () => void; disabled?: boolean }) {
  const { palette: p } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.barBtn, { opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={20} color={p.text} />
      <Text maxFontSizeMultiplier={1.3} style={{ color: p.text, fontSize: 12, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: gutter.page, gap: space.xl + space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.xs },
  note: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
  know: { borderLeftWidth: 3, paddingLeft: space.md },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { flexGrow: 1, flexBasis: '45%', borderRadius: radius.md, padding: space.md, gap: 2, minHeight: 96 },
  source: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  sourceHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  posterLabel: { position: 'absolute', left: gutter.page, right: gutter.page, bottom: gutter.page, gap: 2 },
  posterMarket: { color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5 },
  posterSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
  },
  barBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 48 },
});
