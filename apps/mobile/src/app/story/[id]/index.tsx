import { Stack, router, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ClaimChips, useClaimSheet } from '@/components/claims';
import { ShareHeaderButton } from '@/components/header-buttons';
import { LensPager } from '@/components/lens-pager';
import { NavCard } from '@/components/nav-card';
import { Banner, Card, CenteredState, EvidenceBadge, SectionHeader, T } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { isCorrected, mediaItems, scriptLanguages } from '@/lib/bundle';
import { languageName, regionName } from '@/lib/catalog';
import { formatDate, plural, relativeTime } from '@/lib/format';
import { usePalette } from '@/lib/settings';
import type { EvidenceState } from '@/lib/types';
import { useStory } from '@/lib/use-story';
import { space } from '@/theme';

const STATES: EvidenceState[] = ['supported', 'contested', 'attributed', 'unverified', 'superseded'];

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePalette();
  const s = useStory(id);
  const sheet = useClaimSheet(id ?? '', s.sources);

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
  const mediaLangs = [...new Set([...media.map((m) => m.output.lang), ...scriptLanguages(b)])];
  const latestCorrection = [...b.corrections].sort((a, z) => z.at.localeCompare(a.at))[0];
  const established = b.assessment?.sections.find((x) => x.kind === 'established');
  const go = (screen: 'dossier' | 'assessment' | 'watch') => router.push({ pathname: `/story/[id]/${screen}`, params: { id: story.id } });

  return (
    <>
      <Stack.Screen options={{ title: '', headerRight: () => <ShareHeaderButton story={story} /> }} />
      <ScrollView
        style={{ backgroundColor: p.background }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={s.refreshing} onRefresh={s.reload} tintColor={p.accent} />}>
        {isCorrected(b) ? (
          <Banner
            tone="danger"
            text={
              latestCorrection
                ? `Corrected ${formatDate(latestCorrection.at)}: ${latestCorrection.reason}`
                : 'This story has been corrected. See the correction log below.'
            }
          />
        ) : null}
        {s.stale ? <Banner text="Showing a saved copy; pull to refresh." onPress={s.reload} /> : null}

        <View style={{ gap: space.sm }}>
          <T variant="label" tone="accent">
            {regionName(story.region)} · {story.topics.join(' · ')}
          </T>
          <T variant="display" accessibilityRole="header">
            {story.title}
          </T>
          <T variant="caption" tone="faint">
            Updated {relativeTime(story.updatedAt)} · {plural(b.sources.length, 'source')} · {plural(b.claims.length, 'claim')} · ledger v
            {story.version}
          </T>
          <T variant="body" tone="muted" style={{ marginTop: space.xs }}>
            {b.assessment?.neutralSummary || story.summary}
          </T>
          <View style={styles.row}>
            {counts.map(([st, n]) => (
              <EvidenceBadge key={st} state={st} count={n} />
            ))}
          </View>
        </View>

        {media.length || mediaLangs.length ? (
          <NavCard
            icon="▶"
            title="Watch & listen"
            body={`${media.length ? plural(media.length, 'briefing') : 'Transcript'} · ${mediaLangs.map(languageName).join(', ')} · AI presenter`}
            onPress={() => go('watch')}
            hint="Opens the video and audio player"
          />
        ) : null}

        {b.lanes.length ? (
          <View>
            <SectionHeader title="Perspectives" subtitle="Swipe to see how different outlets frame this story" />
            <LensPager lanes={b.lanes} claims={s.claims} sources={s.sources} onClaim={sheet.open} />
          </View>
        ) : null}

        {established ? (
          <Card>
            <T variant="label" tone="muted">
              What&apos;s established
            </T>
            <T variant="body" style={{ marginTop: space.sm, marginBottom: space.md }}>
              {established.text}
            </T>
            <ClaimChips ids={established.claimIds} claims={s.claims} onPress={sheet.open} />
          </Card>
        ) : null}

        <View style={{ gap: space.md }}>
          <NavCard
            icon="⌕"
            title="Open the research"
            body={`${plural(b.claims.length, 'claim')} · ${plural(b.sources.length, 'source')} · ${plural(b.timeline.length, 'timeline event')} · ${plural(b.context.length, 'context item')}`}
            onPress={() => go('dossier')}
            hint="Opens the research dossier with source passages"
          />
          {b.assessment ? (
            <NavCard
              icon="§"
              title="AI assessment"
              body={`${plural(b.assessment.sections.length, 'section')}, every sentence cited · no truth score`}
              onPress={() => go('assessment')}
              hint="Opens the cited assessment"
            />
          ) : null}
        </View>

        {b.corrections.length ? (
          <View>
            <SectionHeader title="Correction log" />
            <View style={{ gap: space.sm }}>
              {b.corrections.map((c) => (
                <Card key={c.id}>
                  <T variant="caption" tone="faint">
                    {formatDate(c.at)} · v{c.fromVersion} → v{c.toVersion}
                  </T>
                  <T variant="body" style={{ marginTop: 4 }}>
                    {c.reason}
                  </T>
                  <View style={{ marginTop: space.sm }}>
                    <ClaimChips ids={c.changedClaimIds} claims={s.claims} onPress={sheet.open} />
                  </View>
                </Card>
              ))}
            </View>
          </View>
        ) : null}

        <T variant="caption" tone="faint" style={{ textAlign: 'center' }}>
          Produced by OpenLens agents from {plural(b.sources.length, 'source')} and reviewed by an editor. No numeric truth scores, ever.
        </T>
      </ScrollView>
      {sheet.sheet}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl * 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
});
