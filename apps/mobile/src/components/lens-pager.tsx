import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useReducedMotion } from 'react-native-reanimated';

import { usePalette } from '@/lib/settings';
import type { Claim, Lens, LensLane, SourceRecord } from '@/lib/types';
import { lensTone, radius, space } from '@/theme';

import { ClaimChips } from './claims';
import { Disclosure, T } from './ui';

const ORDER: Lens[] = ['left', 'center', 'right', 'unrated'];

/**
 * Horizontal swipe through the lens lanes (left / center / right). Framing text is
 * model-generated and explicitly labelled as "not a truth meter".
 */
export function LensPager({
  lanes,
  claims,
  sources,
  onClaim,
}: {
  lanes: LensLane[];
  claims: Map<string, Claim>;
  sources: Map<string, SourceRecord>;
  onClaim: (c: Claim) => void;
}) {
  const p = usePalette();
  const reduceMotion = useReducedMotion();
  const sorted = [...lanes].sort((a, b) => ORDER.indexOf(a.lens) - ORDER.indexOf(b.lens));
  const initial = Math.max(0, sorted.findIndex((l) => l.lens === 'center'));
  const [page, setPage] = useState(initial);
  const [heights, setHeights] = useState<Record<number, number>>({});
  const pager = useRef<PagerView>(null);

  if (!sorted.length) return null;
  const height = Math.max(240, heights[page] ?? 0, ...Object.values(heights));

  const go = (i: number) => {
    setPage(i);
    if (reduceMotion) pager.current?.setPageWithoutAnimation(i);
    else pager.current?.setPage(i);
  };

  return (
    <View>
      <View style={[styles.tabs, { backgroundColor: p.surfaceAlt, borderColor: p.border }]} accessibilityRole="tablist">
        {sorted.map((lane, i) => {
          const t = lensTone(lane.lens, p);
          const selected = i === page;
          return (
            <Pressable
              key={lane.lens}
              onPress={() => go(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t.label} lens, ${i + 1} of ${sorted.length}`}
              style={[styles.tab, selected && { backgroundColor: t.bg, borderColor: t.fg }]}>
              <Text maxFontSizeMultiplier={1.5} style={[styles.tabText, { color: selected ? t.fg : p.textMuted }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: space.md }}>
        <Disclosure text="Model-generated framing — not a truth meter. Lens ratings come from a documented outlet table." icon="◐" />
      </View>

      <PagerView
        ref={pager}
        style={{ height, marginTop: space.md }}
        initialPage={initial}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
        overdrag={!reduceMotion}>
        {sorted.map((lane, i) => (
          <View key={lane.lens} collapsable={false}>
            <View
              onLayout={(e) => {
                const h = Math.ceil(e.nativeEvent.layout.height);
                setHeights((prev) => (prev[i] === h ? prev : { ...prev, [i]: h }));
              }}>
              <LanePage lane={lane} claims={claims} sources={sources} onClaim={onClaim} index={i} total={sorted.length} />
            </View>
          </View>
        ))}
      </PagerView>

      <View style={styles.dots} importantForAccessibility="no-hide-descendants">
        {sorted.map((lane, i) => (
          <View key={lane.lens} style={[styles.dot, { backgroundColor: i === page ? p.accent : p.border, width: i === page ? 18 : 6 }]} />
        ))}
      </View>
    </View>
  );
}

function LanePage({
  lane,
  claims,
  sources,
  onClaim,
  index,
  total,
}: {
  lane: LensLane;
  claims: Map<string, Claim>;
  sources: Map<string, SourceRecord>;
  onClaim: (c: Claim) => void;
  index: number;
  total: number;
}) {
  const p = usePalette();
  const t = lensTone(lane.lens, p);
  const outlets = lane.sourceIds.map((id) => sources.get(id)?.publisher ?? id);
  return (
    <View
      style={[styles.page, { backgroundColor: p.surface, borderColor: p.border, borderTopColor: t.fg }]}
      accessibilityLabel={`${t.label} lens, page ${index + 1} of ${total}`}>
      <View style={styles.pageHead}>
        <T variant="label" style={{ color: t.fg }}>
          {t.label} lens
        </T>
        <T variant="caption" tone="faint">
          {index + 1}/{total} · swipe
        </T>
      </View>
      {outlets.length ? (
        <T variant="caption" tone="muted" style={{ marginTop: 2 }}>
          {outlets.join(' · ')}
        </T>
      ) : null}
      <T variant="body" style={{ marginTop: space.md }}>
        {lane.summary}
      </T>

      {lane.emphasizes.length ? (
        <View style={{ marginTop: space.lg }}>
          <T variant="label" tone="muted">
            Emphasizes
          </T>
          {lane.emphasizes.map((e) => (
            <Bullet key={e} text={e} mark="•" color={t.fg} />
          ))}
        </View>
      ) : null}

      {lane.doesNotEstablish.length ? (
        <View style={{ marginTop: space.lg }}>
          <T variant="label" tone="muted">
            Does not establish
          </T>
          {lane.doesNotEstablish.map((e) => (
            <Bullet key={e} text={e} mark="○" color={p.textFaint} />
          ))}
        </View>
      ) : null}

      {lane.claimIds.length ? (
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <T variant="label" tone="muted">
            Cited claims
          </T>
          <ClaimChips ids={lane.claimIds} claims={claims} onPress={onClaim} />
        </View>
      ) : null}
    </View>
  );
}

function Bullet({ text, mark, color }: { text: string; mark: string; color: string }) {
  return (
    <View style={styles.bullet}>
      <Text style={{ color, fontWeight: '800', width: 14 }} importantForAccessibility="no">
        {mark}
      </Text>
      <T variant="body" style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, borderWidth: StyleSheet.hairlineWidth },
  tab: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabText: { fontSize: 14, fontWeight: '700' },
  page: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderTopWidth: 3, padding: space.lg, marginHorizontal: 2 },
  pageHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bullet: { flexDirection: 'row', gap: space.xs, marginTop: space.xs },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space.md },
  dot: { height: 6, borderRadius: 3 },
});
