// Build-time env (inlined by Expo for EXPO_PUBLIC_* vars).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/$/, '');

/** Public web origin used for share links and universal links. */
export const WEB_ORIGIN = (process.env.EXPO_PUBLIC_WEB_URL || 'https://openlens.app').replace(/\/$/, '');

export const storyWebUrl = (id: string) => `${WEB_ORIGIN}/story/${encodeURIComponent(id)}`;
export const storyAppUrl = (id: string) => `openlens://story/${encodeURIComponent(id)}`;
