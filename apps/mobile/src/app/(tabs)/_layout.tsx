import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { useSettings } from '@/lib/settings';

export default function TabsLayout() {
  const { palette: p } = useSettings();
  return (
    <NativeTabs
      backgroundColor={p.background}
      indicatorColor={p.accentSoft}
      iconColor={{ default: p.textFaint, selected: p.accent }}
      labelStyle={{ default: { color: p.textFaint }, selected: { color: p.accent } }}
      tintColor={p.accent}>
      {/* Feed manages its own insets (snap-paged list sized to the visible area). */}
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets={Platform.OS === 'ios'}>
        <NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'newspaper', selected: 'newspaper.fill' }} md="newspaper" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="corrections">
        <NativeTabs.Trigger.Label>Corrections</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.seal', selected: 'checkmark.seal.fill' }} md="fact_check" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
