import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryNav, HomeHeader, HomeSkeleton, Rail, SpotlightHero, WireList, useEditionSheet } from '@/components/home';
import { Banner, Button, CenteredState, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { USE_FIXTURES } from '@/lib/env';
import { buildSections, editionName, type CategoryKey } from '@/lib/home';
import { useSettings } from '@/lib/settings';
import type { FeedItem } from '@/lib/types';
import { useResource } from '@/lib/use-resource';
import { openWatch } from '@/lib/watch-queue';
import { gutter, space } from '@/theme';

export default function HomeScreen() {
  const { settings, update, palette: p } = useSettings();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const edition = useEditionSheet();
  const [category, setCategory] = useState<CategoryKey>('top');
  const region = settings.region;

  // One feed request; edition + category filtering happen client-side via matchesRegion.
  const feed = useResource<FeedItem[]>('feed:home', () => api.feed(), []);

  const sections = useMemo(
    () => buildSections(feed.data ?? [], { region, category, followedTopics: settings.topics, readerLang: settings.lang }),
    [feed.data, region, category, settings.topics, settings.lang],
  );

  // Hero preview only plays while the tab is focused and the hero is mostly on screen.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [scrollY, setScrollY] = useState(0);
  const heroH = (width - gutter.page * 2) * 1.25;
  const heroInView = scrollY < heroH * 0.6;
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    setScrollY((prev) => (Math.abs(prev - y) > 40 || y < 40 ? y : prev));
  }, []);

  const body = (() => {
    if (feed.loading && !feed.data) return <HomeSkeleton />;
    if (feed.error && !feed.data)
      return <CenteredState title="Couldn't load the newsroom" body={errorMessage(feed.error)} action={{ label: 'Try again', onPress: feed.reload }} />;
    if (!sections.all.length)
      return (
        <View style={styles.empty}>
          <T variant="title" accessibilityRole="header">
            Nothing on the wire yet
          </T>
          <T variant="body" tone="muted" style={{ marginTop: space.sm }}>
            OpenLens publishes a story only once its claims are sourced and checked. There are no {category === 'top' || category === 'wire' ? '' : 'matching '}
            stories in the {editionName(region)} edition right now.
          </T>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
            {region ? <Button kind="ink" label="Show all of Asia-Pacific" onPress={() => update({ region: '' })} /> : null}
            {category !== 'top' ? <Button kind="outline" label="All categories" onPress={() => setCategory('top')} /> : null}
          </View>
        </View>
      );
    if (category === 'wire') return <WireList items={sections.all} />;
    return (
      <>
        {sections.spotlight ? <SpotlightHero item={sections.spotlight} related={sections.spotlightList} previewActive={focused && heroInView} /> : null}
        {sections.rails.map((r) => (
          <Rail
            key={r.key}
            section={r}
            actionLabel={r.key === 'latest' ? 'Play all' : undefined}
            onViewAll={r.key === 'latest' ? () => openWatch(r.items, r.items[0].id) : undefined}
          />
        ))}
        <T variant="caption" tone="faint" style={styles.footer}>
          Every OpenLens story carries its evidence: claims, sources and corrections are one tap away. Presenters are AI-generated and labelled.
          {USE_FIXTURES ? '\nOffline demo data (fictional stories).' : ''}
        </T>
      </>
    );
  })();

  return (
    <View style={[styles.screen, { backgroundColor: p.background }]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        onScroll={onScroll}
        scrollEventThrottle={64}
        // iOS: content runs under the translucent native tab bar (automatic insets are disabled for this tab).
        contentContainerStyle={{ paddingBottom: space.xxl * 2 + (Platform.OS === 'ios' ? insets.bottom + 49 : 0) }}
        refreshControl={
          <RefreshControl refreshing={feed.refreshing} onRefresh={feed.reload} tintColor={p.accent} colors={[p.accent]} progressViewOffset={insets.top} />
        }>
        <View style={{ paddingTop: insets.top, backgroundColor: p.background }}>
          <HomeHeader onEdition={edition.open} />
          <CategoryNav value={category} onChange={setCategory} />
        </View>
        {feed.stale && feed.data ? (
          <View style={{ paddingHorizontal: gutter.page, paddingTop: space.md }}>
            <Banner text={`Showing saved stories. ${errorMessage(feed.error)}`} onPress={feed.reload} accessibilityHint="Retries loading the feed" />
          </View>
        ) : null}
        {body}
      </ScrollView>
      {edition.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  empty: { padding: gutter.page, paddingTop: space.xxl },
  footer: { paddingHorizontal: gutter.page, marginTop: space.xxl, textAlign: 'center' },
});
