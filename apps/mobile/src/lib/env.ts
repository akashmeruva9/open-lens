// Build-time env (inlined by Expo for EXPO_PUBLIC_* vars).
// Fixture mode is ON unless explicitly disabled with EXPO_PUBLIC_USE_FIXTURES=0.
const rawFixtures = process.env.EXPO_PUBLIC_USE_FIXTURES;

export const USE_FIXTURES = rawFixtures === undefined || !['0', 'false', 'no', 'off'].includes(rawFixtures.toLowerCase());

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/$/, '');

/** Public web origin used for share links and universal links. */
export const WEB_ORIGIN = (process.env.EXPO_PUBLIC_WEB_URL || 'https://openlens.app').replace(/\/$/, '');

export const storyWebUrl = (id: string) => `${WEB_ORIGIN}/story/${encodeURIComponent(id)}`;
export const storyAppUrl = (id: string) => `openlens://story/${encodeURIComponent(id)}`;
