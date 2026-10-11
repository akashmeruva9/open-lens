import { Platform } from 'react-native';

import type { EvidenceState, Lens } from '@/lib/types';

/** "Transparent newsroom" palette: dark navy + sky-blue accent (matches rendered video frames). */
export const palettes = {
  dark: {
    scheme: 'dark' as const,
    background: '#0B1426',
    surface: '#121F38',
    surfaceAlt: '#18284A',
    border: '#24375E',
    text: '#EEF3FB',
    textMuted: '#9DB0CF',
    textFaint: '#6F82A3',
    accent: '#38BDF8',
    accentText: '#04121F',
    accentSoft: 'rgba(56,189,248,0.16)',
    highlight: 'rgba(250,204,21,0.30)',
    danger: '#F87171',
    dangerSoft: 'rgba(248,113,113,0.16)',
    overlay: 'rgba(4,10,22,0.72)',
  },
  light: {
    scheme: 'light' as const,
    background: '#F4F7FC',
    surface: '#FFFFFF',
    surfaceAlt: '#EAF0F9',
    border: '#D5DFEE',
    text: '#0B1426',
    textMuted: '#465A7A',
    textFaint: '#6B7C99',
    accent: '#0369A1',
    accentText: '#FFFFFF',
    accentSoft: 'rgba(3,105,161,0.10)',
    highlight: 'rgba(250,204,21,0.45)',
    danger: '#B91C1C',
    dangerSoft: 'rgba(185,28,28,0.10)',
    overlay: 'rgba(11,20,38,0.55)',
  },
};

export type Palette = (typeof palettes)['dark'] | (typeof palettes)['light'];

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

type Tone = { fg: string; bg: string; label: string; icon: string; description: string };

/** Evidence-state badges. Colour is never the only signal: every badge also has text. */
export function evidenceTone(state: EvidenceState, p: Palette): Tone {
  const dark = p.scheme === 'dark';
  switch (state) {
    case 'supported':
      return { fg: dark ? '#4ADE80' : '#15803D', bg: dark ? 'rgba(74,222,128,0.14)' : 'rgba(21,128,61,0.10)', label: 'Supported', icon: '✓', description: 'Backed by cited source passages' };
    case 'contested':
      return { fg: dark ? '#FBBF24' : '#B45309', bg: dark ? 'rgba(251,191,36,0.14)' : 'rgba(180,83,9,0.10)', label: 'Contested', icon: '⇄', description: 'Sources disagree' };
    case 'attributed':
      return { fg: dark ? '#A5B4FC' : '#4338CA', bg: dark ? 'rgba(165,180,252,0.14)' : 'rgba(67,56,202,0.10)', label: 'Attributed', icon: '❝', description: 'Someone said it; not independently verified' };
    case 'unverified':
      return { fg: dark ? '#CBD5E1' : '#475569', bg: dark ? 'rgba(203,213,225,0.12)' : 'rgba(71,85,105,0.10)', label: 'Unverified', icon: '?', description: 'Not yet corroborated' };
    case 'superseded':
      return { fg: dark ? '#F87171' : '#B91C1C', bg: dark ? 'rgba(248,113,113,0.14)' : 'rgba(185,28,28,0.10)', label: 'Superseded', icon: '↺', description: 'Replaced by newer information' };
  }
}

export function lensTone(lens: Lens, p: Palette): { fg: string; bg: string; label: string } {
  const dark = p.scheme === 'dark';
  // Deliberately non-partisan hues (no red/blue team colours).
  switch (lens) {
    case 'left':
      return { fg: dark ? '#C4B5FD' : '#6D28D9', bg: dark ? 'rgba(196,181,253,0.14)' : 'rgba(109,40,217,0.10)', label: 'Left' };
    case 'center':
      return { fg: dark ? '#7DD3FC' : '#0369A1', bg: dark ? 'rgba(125,211,252,0.14)' : 'rgba(3,105,161,0.10)', label: 'Center' };
    case 'right':
      return { fg: dark ? '#FDBA74' : '#C2410C', bg: dark ? 'rgba(253,186,116,0.14)' : 'rgba(194,65,12,0.10)', label: 'Right' };
    default:
      return { fg: p.textMuted, bg: p.surfaceAlt, label: 'Unrated' };
  }
}
