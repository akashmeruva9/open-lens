// Canonical dev fixtures from /data/fixtures (shared with the API and mobile app), validated
// against the shared Zod contract so drift is caught at load time.
import { FeedItem, StoryBundle } from "@openlens/schemas";
import feedJson from "@fixtures/feed.json";
import storyBundleJson from "@fixtures/story-bundle.json";
import { EXTRA_BUNDLES } from "./extra-stories";

export function loadFixtureBundles(): StoryBundle[] {
  return [StoryBundle.parse(storyBundleJson), ...EXTRA_BUNDLES.map((b) => StoryBundle.parse(b))];
}

export function loadFixtureFeed(): FeedItem[] {
  return FeedItem.array().parse(feedJson);
}
