import { Platform, type TextStyle } from 'react-native';

import type { EvidenceState, Lens } from '@/lib/types';

/**
 * "Video-first newsroom" tokens (docs/design-system.md §1): white / near-black canvas,
 * ink type, one OpenLens accent. Lens and evidence colours are unchanged; they carry meaning.
 *
 * Key names are kept from the previous palette so every screen picks the new look up:
 *   background = --bg, surface = --surface, surfaceAlt = --surface-2, border = --line,
 *   text = --ink, textMuted = --ink-2, textFaint = --ink-3, live = --live, marker = --highlight.
 */
export const palettes = {
  light: {
    scheme: 'light' as const,
    background: '#FFFFFF',
    surface: '#F4F4F4',
    surfaceAlt: '#E9E9E9',
    border: '#DEDEDE',
    text: '#0A0A0A',
    textMuted: '#3D3D3D',
    textFaint: '#737373', // --ink-3 darkened slightly from #8c8c8c so 12px metadata keeps 4.5:1 on white
    accent: '#2F5BFF',
    accentText: '#FFFFFF',
    accentSoft: 'rgba(47,91,255,0.10)',
    live: '#E5383B',
    liveSoft: 'rgba(229,56,59,0.10)',
    marker: '#EAFF5C',
    highlight: 'rgba(234,255,92,0.75)',
    danger: '#C62828',
    dangerSoft: 'rgba(229,56,59,0.10)',
    overlay: 'rgba(0,0,0,0.55)',
    ink: '#0A0A0A',
    inkText: '#FFFFFF',
  },
  dark: {
    scheme: 'dark' as const,
    background: '#080808',
    surface: '#141414',
    surfaceAlt: '#1F1F1F',
    border: '#2A2A2A',
    text: '#F5F5F5',
    textMuted: '#C7C7C7',
    textFaint: '#8C8C8C',
    accent: '#6B8BFF',
    accentText: '#080808',
    accentSoft: 'rgba(107,139,255,0.16)',
    live: '#FF5A5D',
    liveSoft: 'rgba(255,90,93,0.16)',
    marker: '#EAFF5C',
    highlight: 'rgba(234,255,92,0.35)',
    danger: '#FF5A5D',
    dangerSoft: 'rgba(255,90,93,0.16)',
    overlay: 'rgba(0,0,0,0.7)',
    ink: '#F5F5F5',
    inkText: '#080808',
  },
};

export type Palette = (typeof palettes)['dark'] | (typeof palettes)['light'];

/** Media overlays are always on dark imagery, so they use fixed colours in both themes. */
export const onMedia = {
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.82)',
  pill: 'rgba(0,0,0,0.62)',
  scrim: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)'] as const,
};

/** 4px spacing unit; 16px outer margin on phones, 12px rail gutter. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const gutter = { page: 16, rail: 12 } as const;
export const radius = { sm: 4, md: 6, lg: 10, pill: 999 } as const;

export const fonts = {
  /** Display: system bold grotesk (San Francisco / Roboto). Inter Tight is optional per spec. */
  display: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

/** Type scale (docs/design-system.md §2). Sizes scale with Dynamic Type; never pair with fixed heights. */
export const type = {
  hero: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5 },
  display: { fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.4 },
  rail: { fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.3 },
  title: { fontSize: 20, lineHeight: 24, fontWeight: '800', letterSpacing: -0.2 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.1 },
  card: { fontSize: 15, lineHeight: 19, fontWeight: '700', letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  dek: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
} satisfies Record<string, TextStyle>;

export const motion = { duration: 150 } as const;

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

/** Evidence chip colours for use on top of video/imagery (solid backgrounds for contrast). */
export function evidenceOnMedia(state: EvidenceState): { fg: string; bg: string } {
  switch (state) {
    case 'supported':
      return { fg: '#FFFFFF', bg: 'rgba(21,128,61,0.92)' };
    case 'contested':
      return { fg: '#1A1200', bg: 'rgba(251,191,36,0.95)' };
    case 'attributed':
      return { fg: '#FFFFFF', bg: 'rgba(67,56,202,0.92)' };
    case 'unverified':
      return { fg: '#FFFFFF', bg: 'rgba(71,85,105,0.92)' };
    case 'superseded':
      return { fg: '#FFFFFF', bg: 'rgba(185,28,28,0.92)' };
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
