import { Platform, Share } from 'react-native';

import { storyWebUrl } from './env';

/** Opens the native share sheet with a universal link to the story. */
export async function shareStory(story: { id: string; title: string; summary?: string }) {
  const url = storyWebUrl(story.id);
  const message = Platform.OS === 'ios' ? story.title : `${story.title}\n\nSee the evidence on OpenLens: ${url}`;
  try {
    await Share.share({ title: story.title, message, url }, { dialogTitle: 'Share story', subject: story.title });
  } catch {
    // User dismissed or the platform refused; nothing to do.
  }
}
