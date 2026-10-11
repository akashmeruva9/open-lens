import { Pressable, Text } from 'react-native';

import { usePalette } from '@/lib/settings';
import { shareStory } from '@/lib/share';

export function ShareHeaderButton({ story }: { story: { id: string; title: string } | null | undefined }) {
  const p = usePalette();
  if (!story) return null;
  return (
    <Pressable
      onPress={() => shareStory(story)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Share story"
      accessibilityHint="Opens the share sheet with a link to this story"
      style={{ paddingHorizontal: 6, minHeight: 32, justifyContent: 'center' }}>
      <Text style={{ color: p.accent, fontSize: 16, fontWeight: '700' }}>Share</Text>
    </Pressable>
  );
}
