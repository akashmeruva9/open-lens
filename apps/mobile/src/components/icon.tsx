import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Decorative icon; the surrounding control carries the accessible label. */
export function Icon({ name, size = 20, color }: { name: string; size?: number; color: string }) {
  return (
    <Ionicons
      name={name as IconName}
      size={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
