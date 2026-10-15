"use client";
// Reader-side hooks: server renders the pristine data; in fixture mode the browser then swaps in
// the persisted fixture store so studio edits (corrections) are reflected in the reader.
import type { StoryBundle } from "@openlens/schemas";
import { useEffect, useState } from "react";
import { toCard, type CardItem } from "@/lib/cards";
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

/** Home cards; in fixture mode re-derived from the browser store so studio corrections show up. */
export function useLiveCards(initial: CardItem[]): CardItem[] {
  const [items, setItems] = useState(initial);
  useEffect(() => {
    setItems(initial);
    if (!USE_FIXTURES) return;
    const store = getFixtureStore();
    const sync = () => setItems(store.feed().map((f) => toCard(f, store.has(f.id) ? store.get(f.id) : undefined)));
    sync();
    return store.subscribe(sync);
  }, [initial]);
  return items;
}
