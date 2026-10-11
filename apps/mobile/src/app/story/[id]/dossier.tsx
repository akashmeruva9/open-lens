import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { ClaimChips, ClaimMeta, SourcePassage, useClaimSheet } from '@/components/claims';
import { ShareHeaderButton } from '@/components/header-buttons';
import { Segmented } from '@/components/segmented';
import { Card, CenteredState, Disclosure, LensPill, Pill, T } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { formatDate, hostOf, plural } from '@/lib/format';
import { usePalette } from '@/lib/settings';
import type { Claim, ContextItem, SourceRecord, StoryBundle } from '@/lib/types';
import { useStory } from '@/lib/use-story';
import { radius, space } from '@/theme';

type Tab = 'claims' | 'timeline' | 'context' | 'sources';

const openUrl = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => {});

export default function DossierScreen() {
  const { id, claim: focusClaim, tab: initialTab } = useLocalSearchParams<{ id: string; claim?: string; tab?: Tab }>();
  const p = usePalette();
  const s = useStory(id);
  const sheet = useClaimSheet(id ?? '', s.sources);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'claims');

  if (s.loading && !s.data) return <CenteredState loading body="Loading research…" />;
  if (!s.data) return <CenteredState title="Research unavailable" body={errorMessage(s.error)} action={{ label: 'Try again', onPress: s.reload }} />;
  const b = s.data;

  return (
    <View style={{ flex: 1, backgroundColor: p.background }}>
      <Stack.Screen options={{ headerRight: () => <ShareHeaderButton story={b.story} /> }} />
      <Segmented
        label="Dossier sections"
        value={tab}
        onChange={setTab}
        options={[
          { key: 'claims', label: `Claims ${b.claims.length}` },
          { key: 'timeline', label: `Timeline ${b.timeline.length}` },
          { key: 'context', label: `Context ${b.context.length}` },
          { key: 'sources', label: `Sources ${b.sources.length}` },
        ]}
      />
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.border }} />
      {tab === 'claims' ? (
        <ClaimsTab bundle={b} sources={s.sources} focus={focusClaim} />
      ) : tab === 'timeline' ? (
        <TimelineTab bundle={b} claims={s.claims} onClaim={sheet.open} />
      ) : tab === 'context' ? (
        <ContextTab items={b.context} />
      ) : (
        <SourcesTab bundle={b} />
      )}
      {sheet.sheet}
    </View>
  );
}

function ClaimsTab({ bundle, sources, focus }: { bundle: StoryBundle; sources: Map<string, SourceRecord>; focus?: string }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(focus ? [focus] : []));
  const scroller = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!focus || scrolled) return;
    const t = setTimeout(() => {
      const y = offsets.current[focus];
      if (y !== undefined) {
        scroller.current?.scrollTo({ y: Math.max(0, y - space.md), animated: !reduceMotion });
        setScrolled(true);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [focus, scrolled, reduceMotion]);

  const toggle = (cid: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });

  return (
    <ScrollView ref={scroller} contentContainerStyle={styles.list}>
      <T variant="caption" tone="muted">
        Each claim is one atomic statement with exact quotes from its sources. Tap a claim to see the passage highlighted in the original text.
      </T>
      {bundle.claims.map((c) => (
        <View key={c.id} onLayout={(e) => (offsets.current[c.id] = e.nativeEvent.layout.y)}>
          <ClaimCard claim={c} sources={sources} expanded={open.has(c.id)} onToggle={() => toggle(c.id)} focused={c.id === focus} />
        </View>
      ))}
    </ScrollView>
  );
}

function ClaimCard({
  claim,
  sources,
  expanded,
  onToggle,
  focused,
}: {
  claim: Claim;
  sources: Map<string, SourceRecord>;
  expanded: boolean;
  onToggle: () => void;
  focused: boolean;
}) {
  const p = usePalette();
  return (
    <View style={[styles.claim, { backgroundColor: p.surface, borderColor: focused ? p.accent : p.border, borderWidth: focused ? 1.5 : StyleSheet.hairlineWidth }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Claim ${claim.id}: ${claim.text}`}
        accessibilityHint={expanded ? 'Hides the source evidence' : 'Shows the source evidence'}
        style={{ gap: space.sm }}>
        <View style={styles.claimHead}>
          <Text style={{ color: p.textFaint, fontWeight: '700', fontSize: 12 }}>{claim.id}</Text>
          <Text style={{ color: p.accent, fontWeight: '700' }}>{expanded ? '−' : '+'}</Text>
        </View>
        <T variant="headline">{claim.text}</T>
        <ClaimMeta claim={claim} />
      </Pressable>
      {expanded ? (
        <View style={{ gap: space.sm, marginTop: space.md }}>
          {claim.stateReason ? (
            <T variant="caption" tone="muted">
              Why this state: {claim.stateReason}
            </T>
          ) : null}
          {claim.evidence.map((e, i) => (
            <SourcePassage key={`${e.sourceId}-${i}`} source={sources.get(e.sourceId)} evidence={e} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TimelineTab({ bundle, claims, onClaim }: { bundle: StoryBundle; claims: Map<string, Claim>; onClaim: (c: Claim) => void }) {
  const p = usePalette();
  const ctx = new Map(bundle.context.map((c) => [c.id, c]));
  if (!bundle.timeline.length) return <CenteredState title="No timeline yet" body="The research agent hasn't added dated events for this story." />;
  return (
    <ScrollView contentContainerStyle={styles.list}>
      {bundle.timeline.map((ev, i) => (
        <View key={`${ev.date}-${i}`} style={styles.tlRow}>
          <View style={styles.tlRail} importantForAccessibility="no-hide-descendants">
            <View style={[styles.tlDot, { backgroundColor: p.accent }]} />
            {i < bundle.timeline.length - 1 ? <View style={[styles.tlLine, { backgroundColor: p.border }]} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: space.xl, gap: space.xs }}>
            <T variant="label" tone="accent">
              {/^\d{4}-\d{2}-\d{2}/.test(ev.date) ? formatDate(ev.date) : ev.date}
            </T>
            <T variant="body">{ev.text}</T>
            {ev.contextIds.map((cid) => (ctx.get(cid) ? <T key={cid} variant="caption" tone="muted">Context: {ctx.get(cid)?.title}</T> : null))}
            <ClaimChips ids={ev.claimIds} claims={claims} onPress={onClaim} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const CONTEXT_LABEL: Record<ContextItem['kind'], string> = {
  law: 'Law',
  official_order: 'Official order',
  prior_action: 'Prior action',
  dataset: 'Dataset',
  similar_case: 'Similar case',
  background: 'Background',
};

function ContextTab({ items }: { items: ContextItem[] }) {
  const p = usePalette();
  if (!items.length) return <CenteredState title="No context items" body="Laws, orders and similar cases appear here once researched." />;
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <T variant="caption" tone="muted">
        Legal and official context, prior actions and similar cases found by the research agent (with grounding provenance where available).
      </T>
      {items.map((c) => (
        <Card key={c.id}>
          <Pill label={CONTEXT_LABEL[c.kind]} fg={p.accent} bg={p.accentSoft} />
          <T variant="headline" style={{ marginTop: space.sm }}>
            {c.title}
          </T>
          <T variant="body" tone="muted" style={{ marginTop: space.xs }}>
            {c.summary}
          </T>
          {c.url ? <LinkRow url={c.url} label="Open document" /> : null}
          {c.groundingUrls.length ? (
            <View style={{ marginTop: space.sm, gap: 2 }}>
              <T variant="label" tone="faint">
                Grounding sources
              </T>
              {c.groundingUrls.map((u) => (
                <LinkRow key={u} url={u} label={hostOf(u)} />
              ))}
            </View>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}

function SourcesTab({ bundle }: { bundle: StoryBundle }) {
  const byId = new Map(bundle.sources.map((s) => [s.id, s]));
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Disclosure text="Lens ratings come from a documented outlet table, not from the model. Framing notes are model-generated." icon="◐" />
      {bundle.sources.map((src) => {
        const claimCount = bundle.claims.filter((c) => c.evidence.some((e) => e.sourceId === src.id)).length;
        return (
          <Card key={src.id}>
            <View style={styles.claimHead}>
              <T variant="bodyStrong" style={{ flex: 1 }}>
                {src.publisher}
              </T>
              <LensPill lens={src.lens.rating} />
            </View>
            <T variant="headline" style={{ marginTop: space.xs }}>
              {src.title}
            </T>
            <T variant="caption" tone="faint" style={{ marginTop: 2 }}>
              {formatDate(src.publishedAt)} · {src.sourceType} · {src.language.toUpperCase()} · cited by {plural(claimCount, 'claim')}
            </T>
            {src.lens.ratingBasis ? (
              <T variant="caption" tone="muted" style={{ marginTop: space.sm }}>
                Rating basis: {src.lens.ratingBasis}
              </T>
            ) : null}
            {src.lens.modelFraming ? (
              <T variant="caption" tone="muted" style={{ marginTop: space.xs }}>
                Framing (model-generated): {src.lens.modelFraming}
              </T>
            ) : null}
            {src.derivedFrom ? (
              <T variant="caption" tone="danger" style={{ marginTop: space.xs }}>
                Derived from {byId.get(src.derivedFrom)?.publisher ?? src.derivedFrom}: not independent.
              </T>
            ) : null}
            <T variant="caption" tone="faint" style={{ marginTop: space.xs }}>
              Rights: {src.rights.license} ({src.rights.usage})
            </T>
            <LinkRow url={src.url} label={hostOf(src.url)} />
          </Card>
        );
      })}
    </ScrollView>
  );
}

function LinkRow({ url, label }: { url: string; label: string }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={() => openUrl(url)}
      accessibilityRole="link"
      accessibilityLabel={`${label}, opens in browser`}
      hitSlop={6}
      style={{ marginTop: space.sm, minHeight: 32, justifyContent: 'center' }}>
      <Text style={{ color: p.accent, fontWeight: '600' }}>↗ {label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, gap: space.md, paddingBottom: space.xxl * 2 },
  claim: { borderRadius: radius.lg, padding: space.lg },
  claimHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  tlRow: { flexDirection: 'row', gap: space.md },
  tlRail: { width: 16, alignItems: 'center' },
  tlDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  tlLine: { width: 2, flex: 1, marginTop: 4 },
});
