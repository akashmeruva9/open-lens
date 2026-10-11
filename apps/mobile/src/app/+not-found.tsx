import { router } from 'expo-router';

import { CenteredState } from '@/components/ui';

export default function NotFound() {
  return (
    <CenteredState
      title="Page not found"
      body="This link doesn't match a story in the app."
      action={{ label: 'Go to feed', onPress: () => router.replace('/') }}
    />
  );
}
