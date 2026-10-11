import Constants from 'expo-constants';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, Card, Chip, SectionHeader, T } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { LANGUAGE_OPTIONS, NATIVE_LANGUAGE_NAMES, REGION_OPTIONS, TOPIC_OPTIONS, regionName } from '@/lib/catalog';
import { API_URL, USE_FIXTURES } from '@/lib/env';
import { enablePush, pushSupported } from '@/lib/push';
import { useSettings, type ThemePref } from '@/lib/settings';
import { radius, space } from '@/theme';

export default function SettingsScreen() {
  const { settings, update, palette: p } = useSettings();
  const insets = useSafeAreaInsets();
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const toggleTopic = (t: string) =>
    update({ topics: settings.topics.includes(t) ? settings.topics.filter((x) => x !== t) : [...settings.topics, t] });

  const onNotifications = async (on: boolean) => {
    setPushMsg(null);
    if (!on) {
      update({ notifications: false });
      setPushMsg('Notifications turned off on this device.');
      return;
    }
    setPushBusy(true);
    const r = await enablePush({ lang: settings.lang, region: settings.region || undefined, topics: settings.topics });
    setPushBusy(false);
    if (r.ok) {
      update({ notifications: true });
      setPushMsg(USE_FIXTURES ? 'Device token obtained (demo mode: not sent to a server).' : 'You will get alerts for new and corrected stories.');
    } else {
      update({ notifications: false });
      setPushMsg(r.reason);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Platform.OS === 'ios' ? space.md : insets.top + space.md }]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic">
        <T variant="display" accessibilityRole="header">
          Settings
        </T>

        <Section title="Language" subtitle="Default for briefings, digests and notifications">
          <View style={styles.wrap}>
            {LANGUAGE_OPTIONS.map((l) => (
              <Chip
                key={l.code}
                label={NATIVE_LANGUAGE_NAMES[l.code] ?? l.name}
                accessibilityLabel={l.name}
                selected={settings.lang === l.code}
                onPress={() => update({ lang: l.code })}
              />
            ))}
          </View>
        </Section>

        <Section title="Region">
          <View style={styles.wrap}>
            {REGION_OPTIONS.map((r) => (
              <Chip key={r.code || 'all'} label={r.name} selected={settings.region === r.code} onPress={() => update({ region: r.code })} />
            ))}
          </View>
        </Section>

        <Section title="Topics" subtitle="Followed topics are shown first in your feed">
          <View style={styles.wrap}>
            {TOPIC_OPTIONS.map((t) => (
              <Chip
                key={t}
                label={t}
                selected={settings.topics.includes(t)}
                onPress={() => toggleTopic(t)}
                accessibilityLabel={`${t} topic`}
                accessibilityHint={settings.topics.includes(t) ? 'Unfollow' : 'Follow'}
              />
            ))}
          </View>
        </Section>

        <Section title="Reading">
          <Card style={{ paddingVertical: space.sm }}>
            <ToggleRow
              label="Low-data mode"
              detail="No autoplay video or images in the feed; videos load only on request."
              value={settings.lowData}
              onChange={(v) => update({ lowData: v })}
            />
            <Divider />
            <ToggleRow
              label="Story alerts"
              detail={pushSupported() ? 'Push notifications for followed topics and corrections.' : 'Requires a development or store build (not available in Expo Go).'}
              value={settings.notifications}
              onChange={onNotifications}
              busy={pushBusy}
            />
            <Divider />
            <View style={{ paddingVertical: space.md, gap: space.sm }}>
              <T variant="bodyStrong">Appearance</T>
              <View style={styles.wrap}>
                {(['system', 'dark', 'light'] as ThemePref[]).map((t) => (
                  <Chip key={t} label={t[0].toUpperCase() + t.slice(1)} selected={settings.theme === t} onPress={() => update({ theme: t })} />
                ))}
              </View>
            </View>
          </Card>
          {pushMsg ? <Banner text={pushMsg} /> : null}
        </Section>

        <WhatsAppDigest />

        <Section title="About">
          <Card style={{ gap: space.xs }}>
            <T variant="caption" tone="muted">
              OpenLens builds each story from a reviewed Claim & Evidence Ledger. Lens framing and assessments are AI-drafted and editor-approved;
              presenters and narration are AI-generated and labelled.
            </T>
            <T variant="caption" tone="faint" style={{ marginTop: space.sm }}>
              Version {Constants.expoConfig?.version ?? '—'} · Data: {USE_FIXTURES ? 'offline demo fixtures' : API_URL}
            </T>
          </Card>
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function WhatsAppDigest() {
  const { settings, update, palette: p } = useSettings();
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'info' | 'danger' } | null>(null);
  const normalized = phone.replace(/[\s()-]/g, '');
  const valid = /^\+[1-9]\d{7,14}$/.test(normalized);

  const submit = async () => {
    if (!valid || !consent) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.subscribe({ phone: normalized, lang: settings.lang, region: settings.region || 'IN', topics: settings.topics, consent: true });
      update({ whatsappSubscribedAt: new Date().toISOString() });
      setPhone('');
      setConsent(false);
      setMsg({ text: USE_FIXTURES ? 'Subscribed (demo mode: nothing was sent).' : 'Subscribed. Reply STOP on WhatsApp at any time to unsubscribe.', tone: 'info' });
    } catch (e) {
      setMsg({ text: errorMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="WhatsApp digest" subtitle="A short daily digest with links to the evidence. Opt-in only.">
      <Card style={{ gap: space.md }}>
        {settings.whatsappSubscribedAt ? (
          <T variant="caption" tone="accent">
            ✓ Subscribed on this device. Reply STOP on WhatsApp to unsubscribe.
          </T>
        ) : null}
        <View style={{ gap: space.xs }}>
          <T variant="bodyStrong" nativeID="wa-phone-label">
            Mobile number
          </T>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+91 98765 43210"
            placeholderTextColor={p.textFaint}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            accessibilityLabel="Mobile number in international format"
            accessibilityLabelledBy="wa-phone-label"
            style={[styles.input, { color: p.text, borderColor: phone && !valid ? p.danger : p.border, backgroundColor: p.surfaceAlt }]}
          />
          {phone && !valid ? (
            <T variant="caption" tone="danger">
              Use international format, e.g. +91 98765 43210
            </T>
          ) : null}
        </View>
        <T variant="caption" tone="muted">
          Digest language: {NATIVE_LANGUAGE_NAMES[settings.lang] ?? settings.lang} · Region: {regionName(settings.region || 'IN')}
          {settings.topics.length ? ` · Topics: ${settings.topics.join(', ')}` : ''}
        </T>
        <Pressable
          onPress={() => setConsent((c) => !c)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          accessibilityLabel="I agree to receive the OpenLens digest on WhatsApp and can unsubscribe at any time"
          style={styles.consent}>
          <View style={[styles.box, { borderColor: consent ? p.accent : p.textFaint, backgroundColor: consent ? p.accent : 'transparent' }]}>
            {consent ? <Text style={{ color: p.accentText, fontWeight: '900' }}>✓</Text> : null}
          </View>
          <T variant="caption" style={{ flex: 1 }}>
            I agree to receive the OpenLens digest on WhatsApp. My number is stored hashed and used only for this digest; I can unsubscribe at
            any time.
          </T>
        </Pressable>
        <Button
          label="Subscribe on WhatsApp"
          onPress={submit}
          disabled={!valid || !consent}
          loading={busy}
          accessibilityHint={!consent ? 'Tick the consent box first' : undefined}
        />
        {msg ? <Banner text={msg.text} tone={msg.tone} /> : null}
      </Card>
    </Section>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader title={title} subtitle={subtitle} />
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  detail,
  value,
  onChange,
  busy,
}: {
  label: string;
  detail: string;
  value: boolean;
  onChange: (v: boolean) => void;
  busy?: boolean;
}) {
  const { palette: p } = useSettings();
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong">{label}</T>
        <T variant="caption" tone="muted">
          {detail}
        </T>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={busy}
        accessibilityLabel={label}
        accessibilityHint={detail}
        trackColor={{ true: p.accent, false: p.border }}
        thumbColor={Platform.OS === 'android' ? (value ? '#fff' : p.textFaint) : undefined}
      />
    </View>
  );
}

function Divider() {
  const { palette: p } = useSettings();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.border }} />;
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, paddingBottom: space.xxl * 3 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, fontSize: 17, minHeight: 48 },
  consent: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
