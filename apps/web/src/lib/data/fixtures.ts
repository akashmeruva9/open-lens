// Canonical dev fixtures from /data/fixtures (shared with the API and mobile app), validated
// against the shared Zod contract so drift is caught at load time.
// japac-*.json are FICTIONAL JAPAC stories (scripts/make-japac-fixtures.ts) so the home rails are populated.
import { FeedItem, StoryBundle } from "@openlens/schemas";
import feedJson from "@fixtures/feed.json";
import japacBundlesJson from "@fixtures/japac-bundles.json";
import japacFeedJson from "@fixtures/japac-feed.json";
import storyBundleJson from "@fixtures/story-bundle.json";
import { EXTRA_BUNDLES } from "./extra-stories";

export function loadFixtureBundles(): StoryBundle[] {
  return [
    StoryBundle.parse(storyBundleJson),
    ...EXTRA_BUNDLES.map((b) => StoryBundle.parse(b)),
    ...StoryBundle.array().parse(japacBundlesJson),
  ];
}

export function loadFixtureFeed(): FeedItem[] {
  return [...FeedItem.array().parse(feedJson), ...FeedItem.array().parse(japacFeedJson)];
}
