import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ClaimChips, useClaimSheet } from '@/components/claims';
import { ShareHeaderButton } from '@/components/header-buttons';
import { Button, CenteredState, Disclosure, T } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { usePalette } from '@/lib/settings';
import type { AssessmentSection, EvidenceState } from '@/lib/types';
import { useStory } from '@/lib/use-story';
import { evidenceTone, radius, space } from '@/theme';

const SECTION_META: Record<AssessmentSection['kind'], { title: string; icon: string; tone?: EvidenceState }> = {
  established: { title: "What's established", icon: '✓', tone: 'supported' },
  attributed: { title: 'What people say', icon: '❝', tone: 'attributed' },
  contested: { title: "What's contested", icon: '⇄', tone: 'contested' },
  unknown: { title: "What we don't know", icon: '?', tone: 'unverified' },
  implications: { title: 'Why it matters', icon: '→' },
  would_change: { title: 'What would change this', icon: '↺' },
};

export default function AssessmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePalette();
  const s = useStory(id);
  const sheet = useClaimSheet(id ?? '', s.sources);

  if (s.loading && !s.data) return <CenteredState loading body="Loading assessment…" />;
  if (!s.data) return <CenteredState title="Assessment unavailable" body={errorMessage(s.error)} action={{ label: 'Try again', onPress: s.reload }} />;
  const b = s.data;
  const a = b.assessment;
  if (!a) return <CenteredState title="Assessment pending" body="An editor hasn't approved the assessment for this story yet." />;
  const stale = a.ledgerVersion < b.story.version;

  return (
    <>
      <Stack.Screen options={{ headerRight: () => <ShareHeaderButton story={b.story} /> }} />
      <ScrollView style={{ backgroundColor: p.background }} contentContainerStyle={styles.content}>
        <T variant="title" accessibilityRole="header">
          {a.headline}
        </T>
        <T variant="body" tone="muted">
          {a.neutralSummary}
        </T>
        <Disclosure text={`AI-drafted, editor-approved. Every sentence cites claims from the evidence ledger (v${a.ledgerVersion}). Tap a citation to see the source passage. No numeric truth score.`} />
        {stale ? (
          <Disclosure icon="!" text={`The ledger has changed since this assessment (now v${b.story.version}); it is being re-reviewed.`} />
        ) : null}

        {a.sections.map((sec, i) => {
          const meta = SECTION_META[sec.kind];
          const tone = meta.tone ? evidenceTone(meta.tone, p) : { fg: p.accent, bg: p.accentSoft };
          return (
            <View key={`${sec.kind}-${i}`} style={[styles.section, { backgroundColor: p.surface, borderColor: p.border, borderLeftColor: tone.fg }]}>
              <View style={styles.head} accessibilityRole="header">
                <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                  <Text style={{ color: tone.fg, fontWeight: '800' }}>{meta.icon}</Text>
                </View>
                <T variant="headline" style={{ flex: 1 }}>
                  {meta.title}
                </T>
              </View>
              <T variant="body" style={{ marginTop: space.sm }}>
                {sec.text}
              </T>
              <View style={{ marginTop: space.md }}>
                <ClaimChips ids={sec.claimIds} claims={s.claims} onPress={sheet.open} />
              </View>
            </View>
          );
        })}

        <Button
          kind="secondary"
          label="Open the full research dossier"
          onPress={() => router.push({ pathname: '/story/[id]/dossier', params: { id: b.story.id } })}
        />
      </ScrollView>
      {sheet.sheet}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  section: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 4, padding: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
