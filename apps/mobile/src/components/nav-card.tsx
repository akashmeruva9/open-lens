import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette } from '@/lib/settings';
import { radius, space } from '@/theme';

import { T } from './ui';

/** Large tappable row that leads to a deeper screen (dossier, assessment, media). */
export function NavCard({
  icon,
  title,
  body,
  onPress,
  hint,
}: {
  icon: string;
  title: string;
  body: string;
  onPress: () => void;
  hint?: string;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.card, { backgroundColor: p.surface, borderColor: p.border, opacity: pressed ? 0.8 : 1 }]}>
      <View style={[styles.icon, { backgroundColor: p.accentSoft }]}>
        <Text style={{ color: p.accent, fontSize: 20, fontWeight: '700' }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <T variant="headline">{title}</T>
        <T variant="caption" tone="muted" style={{ marginTop: 2 }}>
          {body}
        </T>
      </View>
      <Text style={{ color: p.textFaint, fontSize: 24 }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 72,
  },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
