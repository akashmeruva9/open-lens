import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { palettes, type Palette } from '@/theme';

import { isLangCode, type LangCode } from './catalog';
import { readJson, writeJson } from './storage';

export type ThemePref = 'system' | 'dark' | 'light';

export type Settings = {
  lang: LangCode;
  /** '' = all regions */
  region: string;
  topics: string[];
  lowData: boolean;
  notifications: boolean;
  theme: ThemePref;
  /** Set once a WhatsApp digest subscription succeeded (no phone number is stored). */
  whatsappSubscribedAt?: string;
};

const KEY = 'openlens.settings.v1';

function defaultLang(): LangCode {
  try {
    const code = getLocales()[0]?.languageCode ?? 'en';
    return isLangCode(code) ? code : 'en';
  } catch {
    return 'en';
  }
}

const defaults = (): Settings => ({
  lang: defaultLang(),
  region: '',
  topics: [],
  lowData: false,
  notifications: false,
  theme: 'system',
});

type Ctx = {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
  palette: Palette;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [ready, setReady] = useState(false);
  const system = useColorScheme();

  useEffect(() => {
    readJson<Partial<Settings>>(KEY).then((saved) => {
      if (saved) setSettings((s) => ({ ...s, ...saved }));
      setReady(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      void writeJson(KEY, next);
      return next;
    });
  }, []);

  const scheme = settings.theme === 'system' ? (system === 'light' ? 'light' : 'dark') : settings.theme;
  const palette = palettes[scheme];

  const value = useMemo(() => ({ settings, ready, update, palette }), [settings, ready, update, palette]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}

export function usePalette(): Palette {
  return useSettings().palette;
}
