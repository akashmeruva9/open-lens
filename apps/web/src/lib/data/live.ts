"use client";
// Reader-side hooks: the server renders the data, the browser keeps it when props change.
import type { StoryBundle } from "@openlens/schemas";
import { useEffect, useState } from "react";
import type { CardItem } from "@/lib/cards";

export function useLiveBundle(initial: StoryBundle): StoryBundle {
  const [bundle, setBundle] = useState(initial);
  useEffect(() => setBundle(initial), [initial]);
  return bundle;
}

/** Home cards from the live feed. */
export function useLiveCards(initial: CardItem[]): CardItem[] {
  const [items, setItems] = useState(initial);
  useEffect(() => setItems(initial), [initial]);
  return items;
}
