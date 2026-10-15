import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { usePalette } from '@/lib/settings';
import type { EvidenceState, Lens } from '@/lib/types';
import { evidenceTone, fonts, lensTone, radius, space, type } from '@/theme';

type Variant = 'hero' | 'display' | 'rail' | 'title' | 'headline' | 'card' | 'body' | 'bodyStrong' | 'dek' | 'caption' | 'label' | 'mono';

const variants: Record<Variant, TextStyle> = {
  ...type,
  mono: { fontSize: 12, lineHeight: 16, fontFamily: fonts.mono },
};

export function T({
  variant = 'body',
  tone = 'text',
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: 'text' | 'muted' | 'faint' | 'accent' | 'danger' | 'live' }) {
  const p = usePalette();
  const color = { text: p.text, muted: p.textMuted, faint: p.textFaint, accent: p.accent, danger: p.danger, live: p.live }[tone];
  return <Text {...rest} style={[variants[variant], { color }, style]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }, style]}>{children}</View>;
}

export function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionHeader} accessibilityRole="header">
      <View style={{ flex: 1 }}>
        <T variant="title">{title}</T>
        {subtitle ? (
          <T variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Pill({
  label,
  fg,
  bg,
  icon,
  accessibilityLabel,
  style,
}: {
  label: string;
  fg: string;
  bg: string;
  icon?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.pill, { backgroundColor: bg }, style]}>
      <Text maxFontSizeMultiplier={1.6} style={[styles.pillText, { color: fg }]}>
        {icon ? `${icon} ` : ''}
        {label}
      </Text>
    </View>
  );
}

export function EvidenceBadge({ state, count }: { state: EvidenceState; count?: number }) {
  const p = usePalette();
  const t = evidenceTone(state, p);
  const label = count === undefined ? t.label : `${count} ${t.label.toLowerCase()}`;
  return (
    <Pill
      label={label}
      icon={t.icon}
      fg={t.fg}
      bg={t.bg}
      accessibilityLabel={count === undefined ? `Evidence state: ${t.label}. ${t.description}` : `${count} ${t.label} claims`}
    />
  );
}

export function LensPill({ lens }: { lens: Lens }) {
  const p = usePalette();
  const t = lensTone(lens, p);
  return <Pill label={t.label} fg={t.fg} bg={t.bg} accessibilityLabel={`Outlet lens rating: ${t.label}`} />;
}

export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? p.ink : p.surface,
          borderColor: selected ? p.ink : p.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <Text maxFontSizeMultiplier={1.6} style={[styles.chipText, { color: selected ? p.inkText : p.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  loading,
  icon,
  accessibilityHint,
  style,
}: {
  label: string;
  onPress?: PressableProps['onPress'];
  kind?: 'primary' | 'ink' | 'outline' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const bg = { primary: p.accent, ink: p.ink, outline: 'transparent', secondary: p.surface, ghost: 'transparent' }[kind];
  const fg = { primary: p.accentText, ink: p.inkText, outline: p.text, secondary: p.text, ghost: p.accent }[kind];
  const border = kind === 'outline' ? p.text : kind === 'secondary' ? p.border : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, borderWidth: kind === 'outline' ? 1.5 : StyleSheet.hairlineWidth, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>
        {icon ? `${icon}  ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

export function Disclosure({ text, icon = 'ⓘ' }: { text: string; icon?: string }) {
  const p = usePalette();
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      style={[styles.disclosure, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Text style={{ color: p.textMuted, fontWeight: '700' }}>{icon}</Text>
      <T variant="caption" style={{ flex: 1, color: p.text }}>
        {text}
      </T>
    </View>
  );
}

export function CenteredState({
  title,
  body,
  action,
  loading,
}: {
  title?: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  loading?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={[styles.centered, { backgroundColor: p.background }]} accessibilityLiveRegion="polite">
      {loading ? <ActivityIndicator size="large" color={p.accent} accessibilityLabel="Loading" /> : null}
      {title ? (
        <T variant="title" style={{ textAlign: 'center', marginTop: loading ? space.lg : 0 }} accessibilityRole="header">
          {title}
        </T>
      ) : null}
      {body ? (
        <T tone="muted" style={{ textAlign: 'center', marginTop: space.sm }}>
          {body}
        </T>
      ) : null}
      {action ? <Button label={action.label} onPress={action.onPress} style={{ marginTop: space.xl }} /> : null}
    </View>
  );
}

export function Banner({
  text,
  tone = 'info',
  onPress,
  accessibilityHint,
}: {
  text: string;
  tone?: 'info' | 'danger';
  onPress?: () => void;
  accessibilityHint?: string;
}) {
  const p = usePalette();
  const fg = tone === 'danger' ? p.live : p.accent;
  const bg = tone === 'danger' ? p.liveSoft : p.accentSoft;
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'alert'}
      accessibilityLabel={text}
      accessibilityHint={accessibilityHint}
      style={[styles.banner, { backgroundColor: bg, borderLeftColor: fg }]}>
      <T variant="caption" style={{ color: p.text, flex: 1 }}>
        {text}
      </T>
      {onPress ? <Text style={{ color: fg, fontWeight: '700' }}>›</Text> : null}
    </Pressable>
  );
}

/** Static placeholder block (no shimmer, so nothing to disable for reduced motion). */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return <View importantForAccessibility="no-hide-descendants" style={[styles.skeleton, { backgroundColor: p.surfaceAlt }, style]} />;
}

/** Outline chip for "Auto-published · not editor-reviewed" (spec §3 Chips). */
export function AutoPublishedChip() {
  const p = usePalette();
  return (
    <Pill
      label="Auto-published · not editor-reviewed"
      fg={p.textFaint}
      bg="transparent"
      style={{ borderWidth: 1, borderColor: p.textFaint }}
      accessibilityLabel="Auto-published, not yet reviewed by an editor"
    />
  );
}

/** LIVE / Developing / Corrected chip (spec: --live). */
export function LiveChip({ label, icon }: { label: string; icon?: string }) {
  const p = usePalette();
  return <Pill label={label} icon={icon} fg="#FFFFFF" bg={p.live} />;
}

export const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: space.md, gap: space.md },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  chip: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  skeleton: { borderRadius: radius.md },
  button: {
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  disclosure: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.sm,
    borderLeftWidth: 4,
  },
});
