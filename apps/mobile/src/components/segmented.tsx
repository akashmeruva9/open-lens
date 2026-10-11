import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { usePalette } from '@/lib/settings';
import { radius, space } from '@/theme';

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  const p = usePalette();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={[styles.bar]}
      accessibilityRole="tablist"
      accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            style={[styles.item, { borderBottomColor: selected ? p.accent : 'transparent' }]}>
            <Text maxFontSizeMultiplier={1.6} style={[styles.text, { color: selected ? p.text : p.textMuted }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: space.md, gap: space.xs },
  item: { paddingHorizontal: space.md, paddingVertical: space.md, borderBottomWidth: 3, minHeight: 44, justifyContent: 'center', borderRadius: radius.sm },
  text: { fontSize: 15, fontWeight: '700' },
});
