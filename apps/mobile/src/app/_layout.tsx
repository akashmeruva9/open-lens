import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { installNotificationRouting } from '@/lib/push';
import { SettingsProvider, useSettings } from '@/lib/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <AppNavigator />
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppNavigator() {
  const { palette: p, ready } = useSettings();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(
    () => installNotificationRouting((id) => router.push({ pathname: '/story/[id]', params: { id } })),
    [],
  );

  const navTheme = useMemo(() => {
    const base = p.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, primary: p.accent, background: p.background, card: p.background, text: p.text, border: p.border },
    };
  }, [p]);

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={p.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: p.background },
          headerTintColor: p.text,
          headerTitleStyle: { color: p.text, fontWeight: '800' },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: p.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
        <Stack.Screen name="watch" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen name="search" options={{ title: 'Search' }} />
        <Stack.Screen name="story/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="story/[id]/dossier" options={{ title: 'Research dossier' }} />
        <Stack.Screen name="story/[id]/assessment" options={{ title: 'AI assessment' }} />
        <Stack.Screen name="story/[id]/watch" options={{ title: 'Watch & listen' }} />
        <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
      </Stack>
    </ThemeProvider>
  );
}
