import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { useSettings } from '@/lib/settings';

export default function TabsLayout() {
  const { palette: p } = useSettings();
  return (
    <NativeTabs
      backgroundColor={p.background}
      indicatorColor={p.surfaceAlt}
      iconColor={{ default: p.textFaint, selected: p.text }}
      labelStyle={{ default: { color: p.textFaint }, selected: { color: p.text, fontWeight: '700' } }}
      tintColor={p.text}>
      {/* Home manages its own top inset (sticky header). */}
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets={Platform.OS === 'ios'}>
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'play.square.stack', selected: 'play.square.stack.fill' }} md="home" />
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
