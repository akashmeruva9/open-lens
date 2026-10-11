import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ClaimChips, useClaimSheet } from '@/components/claims';
import { ShareHeaderButton } from '@/components/header-buttons';
import { AudioBriefing, MediaPlaceholder, StoryVideo } from '@/components/media';
import { CenteredState, Chip, Disclosure, SectionHeader, T } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { mediaItems, scriptForLang, scriptLanguages } from '@/lib/bundle';
import { NATIVE_LANGUAGE_NAMES, languageName } from '@/lib/catalog';
import { formatDuration } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import { useStory } from '@/lib/use-story';
import { radius, space } from '@/theme';

export default function WatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, palette: p } = useSettings();
  const s = useStory(id);
  const sheet = useClaimSheet(id ?? '', s.sources);
  const [picked, setPicked] = useState<string | null>(null);
  const [videoIdx, setVideoIdx] = useState(0);
  const [allowVideo, setAllowVideo] = useState(false);

  if (s.loading && !s.data) return <CenteredState loading body="Loading media…" />;
  if (!s.data) return <CenteredState title="Media unavailable" body={errorMessage(s.error)} action={{ label: 'Try again', onPress: s.reload }} />;
  const b = s.data;

  const items = mediaItems(b);
  const langs = [...new Set([...items.map((m) => m.output.lang), ...scriptLanguages(b)])];
  if (!langs.length) return <CenteredState title="No briefings yet" body="Video and audio briefings appear here after editor approval." />;

  const lang = picked && langs.includes(picked) ? picked : langs.includes(settings.lang) ? settings.lang : langs[0];
  const videos = items.filter((m) => m.kind === 'video' && m.output.lang === lang);
  const audio = items.find((m) => m.kind === 'audio' && m.output.lang === lang);
  const video = videos[Math.min(videoIdx, Math.max(0, videos.length - 1))];
  const script = video?.script ?? audio?.script ?? scriptForLang(b, lang);
  const transcript = audio?.kind === 'audio' ? audio.payload.transcript : undefined;
  const disclose = items.some((m) => m.output.lang === lang && m.output.aiDisclosure) || !!script;
  const showVideo = video?.kind === 'video' && (!settings.lowData || allowVideo);

  return (
    <>
      <Stack.Screen options={{ headerRight: () => <ShareHeaderButton story={b.story} /> }} />
      <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
        <View>
          <T variant="label" tone="muted" style={{ marginBottom: space.sm }}>
            Language
          </T>
          <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Briefing language">
            {langs.map((l) => {
              const has = items.some((m) => m.output.lang === l);
              return (
                <Chip
                  key={l}
                  label={`${NATIVE_LANGUAGE_NAMES[l] ?? languageName(l)}${has ? '' : ' · text'}`}
                  accessibilityLabel={`${languageName(l)}${has ? '' : ', transcript only'}`}
                  selected={l === lang}
                  onPress={() => {
                    setPicked(l);
                    setVideoIdx(0);
                  }}
                />
              );
            })}
          </View>
        </View>

        {disclose ? <Disclosure icon="✦" text="AI-generated presenter / narration. A fictional OpenLens presenter reads an editor-approved, cited script." /> : null}

        {videos.length > 1 ? (
          <View style={styles.row}>
            {videos.map((v, i) => (
              <Chip
                key={v.output.id}
                label={v.kind === 'video' ? `${v.payload.aspect} · ${formatDuration(v.payload.durationSeconds)}` : v.output.id}
                selected={i === videoIdx}
                onPress={() => setVideoIdx(i)}
              />
            ))}
          </View>
        ) : null}

        {video?.kind === 'video' ? (
          showVideo ? (
            <StoryVideo
              key={video.output.id}
              title={script?.title ?? b.story.title}
              hlsUrl={video.payload.hlsUrl}
              mp4Url={video.payload.mp4Url}
              aspect={video.payload.aspect}
            />
          ) : (
            <View style={{ gap: space.sm }}>
              <MediaPlaceholder style={{ aspectRatio: 16 / 9 }} title="Low-data mode" body="Video is paused to save data." onRetry={() => setAllowVideo(true)} />
              <T variant="caption" tone="faint" style={{ textAlign: 'center' }}>
                Tap Retry to load the video once.
              </T>
            </View>
          )
        ) : (
          <MediaPlaceholder
            style={{ aspectRatio: 16 / 9 }}
            title={`No ${languageName(lang)} video yet`}
            body="The approved transcript is below. The video renders after the script passes back-translation checks."
          />
        )}

        {audio?.kind === 'audio' ? <AudioBriefing key={audio.output.id} url={audio.payload.audioUrl} durationSeconds={audio.payload.durationSeconds} title={script?.title ?? b.story.title} /> : null}

        <View>
          <SectionHeader title="Transcript" subtitle={script ? `${script.title} · every line cites the ledger` : undefined} />
          {script ? (
            <View style={{ gap: space.md }}>
              {script.lines.map((line, i) => (
                <View key={i} style={[styles.line, { backgroundColor: p.surface, borderColor: p.border }]}>
                  <T variant="label" tone="accent">
                    {line.label}
                  </T>
                  <T variant="body" style={{ marginTop: 4, marginBottom: space.sm }}>
                    {line.text}
                  </T>
                  <ClaimChips ids={line.claimIds} claims={s.claims} onPress={sheet.open} />
                </View>
              ))}
              {script.backTranslation ? (
                <T variant="caption" tone="faint">
                  Back-translation fidelity: {Math.round(script.backTranslation.score * 100)}%
                </T>
              ) : null}
            </View>
          ) : transcript ? (
            <T variant="body">{transcript}</T>
          ) : (
            <T tone="muted">No transcript available for this language yet.</T>
          )}
        </View>
      </ScrollView>
      {sheet.sheet}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  line: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
});
