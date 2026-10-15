import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { SpotlightRow } from '@/components/cards';
import { Icon } from '@/components/icon';
import { CenteredState, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { matchesRegion } from '@/lib/catalog';
import { editionName, marketName, toHomeItem, type HomeItem } from '@/lib/home';
import { useSettings } from '@/lib/settings';
import type { FeedItem } from '@/lib/types';
import { useResource } from '@/lib/use-resource';
import { openStory, openWatch } from '@/lib/watch-queue';
import { gutter, radius, space } from '@/theme';

/** Client-side search over the current feed (titles, summaries, topics, markets). */
export default function SearchScreen() {
  const { settings, palette: p } = useSettings();
  const [q, setQ] = useState('');
  const feed = useResource<FeedItem[]>('feed:home', () => api.feed(), []);

  const results = useMemo<HomeItem[]>(() => {
    const needle = q.trim().toLowerCase();
    return (feed.data ?? [])
      .filter((i) => matchesRegion(i.region, settings.region))
      .filter((i) => !needle || [i.title, i.summary, i.topics.join(' '), marketName(i.region)].join(' ').toLowerCase().includes(needle))
      .map(toHomeItem);
  }, [feed.data, q, settings.region]);

  if (feed.loading && !feed.data) return <CenteredState loading body="Loading stories…" />;
  if (feed.error && !feed.data) return <CenteredState title="Couldn't load stories" body={errorMessage(feed.error)} action={{ label: 'Try again', onPress: feed.reload }} />;

  return (
    <FlatList
      style={{ backgroundColor: p.background }}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      data={results}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={
        <View style={{ gap: space.sm, marginBottom: space.sm }}>
          <View style={[styles.input, { backgroundColor: p.surface, borderColor: p.border }]}>
            <Icon name="search" size={18} color={p.textFaint} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search stories, topics, markets"
              placeholderTextColor={p.textFaint}
              autoFocus
              returnKeyType="search"
              accessibilityLabel="Search stories"
              style={{ flex: 1, color: p.text, fontSize: 16, minHeight: 44 }}
            />
          </View>
          <T variant="label" tone="faint">
            {results.length} {results.length === 1 ? 'story' : 'stories'} in the {editionName(settings.region)} edition
          </T>
        </View>
      }
      ListEmptyComponent={
        <T tone="muted" style={{ marginTop: space.lg }}>
          No stories match “{q}”.
        </T>
      }
      renderItem={({ item }) => <SpotlightRow item={item} onPress={() => (item.video ? openWatch([item], item.id) : openStory(item.id))} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: gutter.page, paddingBottom: space.xxl * 2 },
  input: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: space.md },
});
