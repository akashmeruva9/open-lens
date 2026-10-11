"use client";
// Reader-side hooks: server renders the pristine data; in fixture mode the browser then swaps in
// the persisted fixture store so studio edits (corrections) are reflected in the reader.
import type { FeedItem, StoryBundle } from "@openlens/schemas";
import { useEffect, useState } from "react";
import { USE_FIXTURES } from "@/lib/env";
import { getFixtureStore } from "./fixture-store";

export function useLiveBundle(initial: StoryBundle): StoryBundle {
  const [bundle, setBundle] = useState(initial);
  const id = initial.story.id;
  useEffect(() => {
    setBundle(initial);
    if (!USE_FIXTURES) return;
    const store = getFixtureStore();
    const sync = () => {
      if (store.has(id)) setBundle(store.get(id));
    };
    sync();
    return store.subscribe(sync);
  }, [id, initial]);
  return bundle;
}

export function useLiveFeed(initial: FeedItem[], filter: (f: FeedItem) => boolean): FeedItem[] {
  const [items, setItems] = useState(initial);
  useEffect(() => {
    setItems(initial);
    if (!USE_FIXTURES) return;
    const store = getFixtureStore();
    const sync = () => setItems(store.feed().filter(filter));
    sync();
    return store.subscribe(sync);
    // filter identity changes each render; initial captures the query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  return items;
}
