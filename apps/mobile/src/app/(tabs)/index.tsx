import { useCallback, useRef, useState } from 'react';
import { FlatList, Platform, RefreshControl, ScrollView, StyleSheet, View, type ViewToken } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView as ScreensSafeAreaView } from 'react-native-screens/experimental';

import { FeedCard } from '@/components/feed-card';
import { Banner, CenteredState, Chip, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { LANGUAGE_OPTIONS, NATIVE_LANGUAGE_NAMES, REGION_OPTIONS } from '@/lib/catalog';
import { USE_FIXTURES } from '@/lib/env';
import { useSettings } from '@/lib/settings';
import type { FeedItem } from '@/lib/types';
import { useResource } from '@/lib/use-resource';
import { space } from '@/theme';

export default function FeedScreen() {
  const { settings, update, palette: p } = useSettings();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [lang, setLang] = useState('');
  const region = settings.region;

  const feed = useResource<FeedItem[]>(
    `feed:${lang}:${region}`,
    () => api.feed({ lang: lang || undefined, region: region || undefined }),
    [lang, region],
  );

  const [listHeight, setListHeight] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<FeedItem>[] }) => {
    setActiveId(viewableItems[0]?.item?.id ?? null);
  }).current;
  const viewability = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <FeedCard
        item={item}
        height={listHeight}
        active={item.id === activeId}
        lowData={settings.lowData}
        autoplay={!reduceMotion}
        bottomInset={0}
      />
    ),
    [listHeight, activeId, settings.lowData, reduceMotion],
  );

  // Followed topics re-rank (never hide) stories: matching topics first.
  const followed = settings.topics;
  const items = [...(feed.data ?? [])].sort(
    (a, b) => Number(b.topics.some((t) => followed.includes(t))) - Number(a.topics.some((t) => followed.includes(t))),
  );

  return (
    <View style={[styles.screen, { backgroundColor: p.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <T variant="display" accessibilityRole="header">
            Open<T variant="display" tone="accent">Lens</T>
          </T>
          <T variant="caption" tone="muted">
            Every story, with its evidence attached
          </T>
        </View>
        {USE_FIXTURES ? (
          <View style={[styles.mode, { borderColor: p.border }]} accessible accessibilityLabel="Offline demo data">
            <T variant="label" tone="faint">
              Demo data
            </T>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.filterBar}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        accessibilityLabel="Language filter">
        <Chip label="All languages" selected={!lang} onPress={() => setLang('')} />
        {LANGUAGE_OPTIONS.map((l) => (
          <Chip
            key={l.code}
            label={NATIVE_LANGUAGE_NAMES[l.code] ?? l.name}
            accessibilityLabel={`${l.name} stories`}
            selected={lang === l.code}
            onPress={() => setLang(lang === l.code ? '' : l.code)}
          />
        ))}
      </ScrollView>
      <ScrollView
        style={styles.filterBar}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filters, { paddingTop: 0 }]}
        accessibilityLabel="Region filter">
        {REGION_OPTIONS.map((r) => (
          <Chip key={r.code || 'all'} label={r.name} selected={region === r.code} onPress={() => update({ region: r.code })} />
        ))}
      </ScrollView>

      {feed.stale && feed.data ? (
        <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
          <Banner text={`Showing saved stories. ${errorMessage(feed.error)}`} onPress={feed.reload} accessibilityHint="Retries loading the feed" />
        </View>
      ) : null}

      {/* iOS: keep cards clear of the translucent native tab bar. Android already insets tab content. */}
      <ListArea onHeight={setListHeight}>
        {feed.loading && !feed.data ? (
          <CenteredState loading body="Loading the latest stories…" />
        ) : feed.error && !feed.data ? (
          <CenteredState title="Couldn't load the feed" body={errorMessage(feed.error)} action={{ label: 'Try again', onPress: feed.reload }} />
        ) : !items.length ? (
          <CenteredState
            title="No stories match"
            body="Try another language or region."
            action={{ label: 'Clear filters', onPress: () => { setLang(''); update({ region: '' }); } }}
          />
        ) : listHeight > 0 ? (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            extraData={activeId}
            pagingEnabled
            snapToInterval={listHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            showsVerticalScrollIndicator={false}
            getItemLayout={(_, index) => ({ length: listHeight, offset: listHeight * index, index })}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={viewability}
            windowSize={3}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            removeClippedSubviews
            refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.reload} tintColor={p.accent} colors={[p.accent]} />}
            accessibilityLabel="Story feed"
          />
        ) : null}
      </ListArea>
    </View>
  );
}

function ListArea({ children, onHeight }: { children: React.ReactNode; onHeight: (h: number) => void }) {
  const inner = (
    <View style={{ flex: 1 }} onLayout={(e) => onHeight(Math.floor(e.nativeEvent.layout.height))}>
      {children}
    </View>
  );
  if (Platform.OS !== 'ios') return inner;
  return (
    <ScreensSafeAreaView edges={{ bottom: true }} insetType="all" style={{ flex: 1 }}>
      {inner}
    </ScreensSafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: space.md },
  mode: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  filterBar: { flexGrow: 0, flexShrink: 0 },
  filters: { gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
});
