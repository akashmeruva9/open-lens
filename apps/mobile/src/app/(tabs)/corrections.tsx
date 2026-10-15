import { router } from 'expo-router';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, CenteredState, Pill, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { regionName } from '@/lib/catalog';
import { formatDate, plural, relativeTime } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import type { CorrectionEvent, FeedItem } from '@/lib/types';
import { useResource } from '@/lib/use-resource';
import { radius, space } from '@/theme';

type Row = { item: FeedItem; latest?: CorrectionEvent; count: number };

async function loadCorrections(): Promise<Row[]> {
  const feed = await api.feed();
  const corrected = feed.filter((f) => f.corrected);
  return Promise.all(
    corrected.map(async (item) => {
      try {
        const b = await api.story(item.id);
        const sorted = [...b.corrections].sort((a, z) => z.at.localeCompare(a.at));
        return { item, latest: sorted[0], count: sorted.length };
      } catch {
        return { item, count: 0 };
      }
    }),
  );
}

export default function CorrectionsScreen() {
  const { palette: p } = useSettings();
  const insets = useSafeAreaInsets();
  const res = useResource<Row[]>('corrections', loadCorrections, []);

  const header = (
    <View style={{ gap: space.sm, marginBottom: space.lg }}>
      <T variant="display" accessibilityRole="header">
        Corrections
      </T>
      <T variant="body" tone="muted">
        When a claim changes, every output that cited it is flagged, re-reviewed and corrected — here and on every channel we published to.
      </T>
      {res.stale && res.data ? <Banner text={`Showing saved list. ${errorMessage(res.error)}`} onPress={res.reload} /> : null}
    </View>
  );

  if (res.loading && !res.data) return <CenteredState loading body="Loading corrections…" />;
  if (res.error && !res.data)
    return <CenteredState title="Couldn't load corrections" body={errorMessage(res.error)} action={{ label: 'Try again', onPress: res.reload }} />;

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: p.background }}
      contentContainerStyle={[styles.list, { paddingTop: Platform.OS === 'ios' ? space.md : insets.top + space.md }]}
      data={res.data ?? []}
      keyExtractor={(r) => r.item.id}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={res.refreshing} onRefresh={res.reload} tintColor={p.accent} colors={[p.accent]} />}
      ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
      ListEmptyComponent={
        <View style={[styles.empty, { borderColor: p.border }]}>
          <T variant="headline" style={{ textAlign: 'center' }}>
            No corrections right now
          </T>
          <T variant="caption" tone="muted" style={{ textAlign: 'center', marginTop: space.xs }}>
            Corrected stories show up here with what changed and when.
          </T>
        </View>
      }
      renderItem={({ item: row }) => (
        <Pressable
          onPress={() => router.push({ pathname: '/story/[id]', params: { id: row.item.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Corrected: ${row.item.title}. ${row.latest ? row.latest.reason : ''}`}
          accessibilityHint="Opens the corrected story"
          style={({ pressed }) => [styles.row, { backgroundColor: p.surface, borderLeftColor: p.live, opacity: pressed ? 0.85 : 1 }]}>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Pill label="Corrected" icon="↺" fg="#FFFFFF" bg={p.live} />
            <T variant="caption" tone="faint">
              {row.latest ? formatDate(row.latest.at) : relativeTime(row.item.updatedAt)} · {regionName(row.item.region)}
            </T>
          </View>
          <T variant="headline" style={{ marginTop: space.sm }}>
            {row.item.title}
          </T>
          {row.latest ? (
            <T variant="body" tone="muted" style={{ marginTop: space.xs }}>
              {row.latest.reason}
            </T>
          ) : null}
          {row.latest ? (
            <T variant="caption" tone="faint" style={{ marginTop: space.sm }}>
              Ledger v{row.latest.fromVersion} → v{row.latest.toVersion} · {plural(row.latest.changedClaimIds.length, 'claim')} changed ·{' '}
              {plural(row.latest.impactedOutputIds.length, 'output')} updated
              {row.count > 1 ? ` · ${row.count} corrections total` : ''}
            </T>
          ) : null}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, paddingBottom: space.xxl * 3 },
  row: { borderRadius: radius.md, borderLeftWidth: 3, padding: space.lg },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.lg, padding: space.xl },
});
