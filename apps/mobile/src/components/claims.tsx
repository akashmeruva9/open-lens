import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hostOf, splitPassage } from '@/lib/format';
import { usePalette } from '@/lib/settings';
import type { Claim, EvidenceItem, SourceRecord } from '@/lib/types';
import { evidenceTone, fonts, radius, space } from '@/theme';

import { Button, EvidenceBadge, LensPill, T } from './ui';

/** Small citation chip: [c3 ✓]. Tapping opens the claim sheet. */
export function ClaimChip({ claim, index, onPress }: { claim: Claim; index?: number; onPress: (c: Claim) => void }) {
  const p = usePalette();
  const t = evidenceTone(claim.state, p);
  const label = index !== undefined ? `${index}` : claim.id;
  return (
    <Pressable
      onPress={() => onPress(claim)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Citation ${label}: ${claim.text}. ${t.label}.`}
      accessibilityHint="Shows the claim and its source evidence"
      style={({ pressed }) => [styles.chip, { backgroundColor: t.bg, borderColor: t.fg, opacity: pressed ? 0.7 : 1 }]}>
      <Text maxFontSizeMultiplier={1.6} style={[styles.chipText, { color: t.fg }]}>
        {t.icon} {label}
      </Text>
    </Pressable>
  );
}

export function ClaimChips({ ids, claims, onPress }: { ids: string[]; claims: Map<string, Claim>; onPress: (c: Claim) => void }) {
  const list = ids.map((id) => claims.get(id)).filter((c): c is Claim => !!c);
  if (!list.length) return null;
  return (
    <View style={styles.chipRow} accessibilityLabel={`${list.length} cited claims`}>
      {list.map((c) => (
        <ClaimChip key={c.id} claim={c} onPress={onPress} />
      ))}
    </View>
  );
}

/** Full source text with the cited passage highlighted (falls back to the bare quote). */
export function SourcePassage({ source, evidence }: { source?: SourceRecord; evidence: EvidenceItem }) {
  const p = usePalette();
  const parts = source ? splitPassage(source.text, evidence.passage) : null;
  return (
    <View style={[styles.passageBox, { borderColor: p.border, backgroundColor: p.surfaceAlt }]}>
      <View style={styles.passageHead}>
        <T variant="caption" style={{ fontWeight: '700', flexShrink: 1 }}>
          {source?.publisher ?? evidence.sourceId}
        </T>
        {source ? <LensPill lens={source.lens.rating} /> : null}
      </View>
      {source ? (
        <T variant="caption" tone="faint" style={{ marginBottom: space.sm }}>
          {source.title} · {hostOf(source.url)}
        </T>
      ) : null}
      {parts ? (
        <Text
          style={[styles.passageText, { color: p.textMuted }]}
          accessibilityLabel={`Source text. Highlighted passage: ${parts[1]}`}>
          {parts[0]}
          <Text style={{ backgroundColor: p.highlight, color: p.text, fontWeight: '600' }}>{parts[1]}</Text>
          {parts[2]}
        </Text>
      ) : (
        <Text style={[styles.passageText, { color: p.text, fontStyle: 'italic' }]}>“{evidence.passage}”</Text>
      )}
    </View>
  );
}

export function ClaimMeta({ claim }: { claim: Claim }) {
  return (
    <View style={styles.metaRow}>
      <EvidenceBadge state={claim.state} />
      <T variant="caption" tone="muted">
        {claim.claimType}
        {claim.attributedTo ? ` · per ${claim.attributedTo}` : ''}
      </T>
      <T variant="caption" tone="faint">
        {claim.independentSourceCount} independent source{claim.independentSourceCount === 1 ? '' : 's'}
      </T>
    </View>
  );
}

/** Hook + modal sheet: tap a citation chip anywhere to inspect the claim and its passages. */
export function useClaimSheet(storyId: string, sources: Map<string, SourceRecord>) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const sheet = <ClaimSheet storyId={storyId} claim={claim} sources={sources} onClose={() => setClaim(null)} />;
  return { open: setClaim, sheet };
}

function ClaimSheet({
  storyId,
  claim,
  sources,
  onClose,
}: {
  storyId: string;
  claim: Claim | null;
  sources: Map<string, SourceRecord>;
  onClose: () => void;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  return (
    <Modal visible={!!claim} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: p.overlay }]} onPress={onClose} accessibilityLabel="Close claim" accessibilityRole="button" />
      <View
        accessibilityViewIsModal
        style={[styles.sheet, { backgroundColor: p.surface, borderColor: p.border, paddingBottom: insets.bottom + space.lg }]}>
        <View style={[styles.grabber, { backgroundColor: p.border }]} />
        {claim ? (
          <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.md }}>
            <T variant="label" tone="accent" accessibilityRole="header">
              Claim {claim.id}
            </T>
            <T variant="headline">{claim.text}</T>
            <ClaimMeta claim={claim} />
            {claim.stateReason ? (
              <T variant="caption" tone="muted">
                Why: {claim.stateReason}
              </T>
            ) : null}
            <T variant="label" tone="muted" style={{ marginTop: space.sm }}>
              Evidence
            </T>
            {claim.evidence.map((e, i) => (
              <SourcePassage key={`${e.sourceId}-${i}`} source={sources.get(e.sourceId)} evidence={e} />
            ))}
            <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.sm }}>
              <Button
                kind="secondary"
                label="Close"
                onPress={onClose}
                style={{ flex: 1 }}
              />
              <Button
                label="Open in dossier"
                accessibilityHint="Opens the research dossier at this claim"
                onPress={() => {
                  const id = claim.id;
                  onClose();
                  router.push({ pathname: '/story/[id]/dossier', params: { id: storyId, claim: id } });
                }}
                style={{ flex: 1.4 }}
              />
            </View>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, minHeight: 28, justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: '700', fontFamily: fonts.mono },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  passageBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.md },
  passageHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  passageText: { fontSize: 15, lineHeight: 23, fontFamily: fonts.serif },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: space.md },
});
