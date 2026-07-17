import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { useTrip } from '../context/TripContext';
import { BUILD_INFO } from '../buildInfo';
import type { SettingsStackParamList } from '../navigation/types';
import { apiConfig } from '../services/config';
import { getAuditLog, type AuditEntry } from '../services/approvalService';
import {
  notificationsSupported,
  requestNotificationPermission,
} from '../services/notificationService';
import { DEFAULT_PROFILE, getProfile, type TravelerProfile } from '../services/preferencesService';
import * as storage from '../services/storageService';
import { colors, radii, spacing, typography } from '../theme';
import { confirmAction } from '../utils/confirm';

const LIVE_SITE = 'https://joshafidel.github.io/A2Z/';
const REPO_BLOB = 'https://github.com/joshafidel/A2Z/blob/claude/a2z-travel-planning-mvp-4f1920';

/** Settings: app-level controls. Travel preferences live on their own page. */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const { savedTrips, refreshTrips } = useTrip();

  // Snapshot of the profile for the preferences-card summary line.
  const [profile, setProfile] = useState<TravelerProfile>(DEFAULT_PROFILE);
  useEffect(() => {
    const load = () => getProfile().then(setProfile);
    load();
    const unsub = navigation.addListener('focus', load); // refresh after edits
    return unsub;
  }, [navigation]);

  // --- Notifications ----------------------------------------------------------
  const [notifMessage, setNotifMessage] = useState<string>();
  const notifPermission =
    Platform.OS === 'web' && typeof Notification !== 'undefined' ? Notification.permission : 'default';
  const enableNotifications = async () => {
    if (!notificationsSupported()) {
      setNotifMessage('This browser does not support notifications.');
      return;
    }
    const granted = await requestNotificationPermission();
    setNotifMessage(
      granted
        ? 'Notifications are on — trip reminders can now alert you while this site is open.'
        : 'Permission was denied — enable notifications for this site in your browser settings.',
    );
  };

  // --- Data management: export / import / reset --------------------------------
  const [dataMessage, setDataMessage] = useState<string>();
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const onExport = async () => {
    const result = await storage.exportAllData();
    if (!result.ok) {
      setDataMessage(result.error);
      return;
    }
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([result.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `a2z-trips-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDataMessage('Downloaded your data as a JSON file — keep it somewhere safe.');
    } else {
      setDataMessage('Export is available in the web version of A2Z.');
    }
  };

  const onImport = async () => {
    const result = await storage.importAllData(importText);
    if (!result.ok) {
      setDataMessage(result.error);
      return;
    }
    setDataMessage(
      `Imported ${result.data.trips} trip${result.data.trips === 1 ? '' : 's'} across ${result.data.keys} data sections.`,
    );
    setImportOpen(false);
    setImportText('');
    setProfile(await getProfile());
    await refreshTrips();
  };

  const onReset = () => {
    confirmAction(
      'Delete ALL A2Z data?',
      'Every trip, packing list, approval, and setting stored in this browser will be permanently removed. Export first if you want a backup.',
      async () => {
        await storage.resetAllData();
        setProfile({ ...DEFAULT_PROFILE });
        setDataMessage('All data was removed from this browser.');
        await refreshTrips();
      },
    );
  };

  // --- Connections (honest status) ----------------------------------------------
  type ConnState = 'working' | 'configured' | 'not_configured' | 'partnership';
  const keyed = (configured: boolean): ConnState => (configured ? 'configured' : 'not_configured');
  const connections: Array<{ name: string; state: ConnState; note: string; envVar?: string }> = [
    { name: 'Weather (Open-Meteo)', state: 'working', note: 'Real forecasts for your travel dates — shapes walk-vs-ride advice.' },
    { name: 'Road routing (OSRM + Nominatim)', state: 'working', note: 'Real driving distances and address lookup.' },
    { name: 'Transit routing (Transitous)', state: 'working', note: 'Real subway/bus itineraries from public GTFS feeds.' },
    { name: 'Uber / Lyft handoff', state: 'working', note: 'Opens the ride app to book your airport leg.' },
    { name: 'Google Routes', state: keyed(Boolean(apiConfig.googleMapsApiKey)), envVar: 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY', note: 'Sharper transit routes with real fares and clock times.' },
    { name: 'Anthropic (Claude)', state: keyed(Boolean(process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY)), envVar: 'EXPO_PUBLIC_ANTHROPIC_API_KEY', note: 'AI concierge, packing lists, ride-price calibration, trip chat.' },
    { name: 'aviationstack', state: keyed(Boolean(apiConfig.aviationstackApiKey)), envVar: 'EXPO_PUBLIC_AVIATIONSTACK_API_KEY', note: 'Real-time flight delay/cancellation/gate alerts.' },
    { name: 'TSA Wait Times', state: keyed(Boolean(apiConfig.tsaWaitApiKey)), envVar: 'EXPO_PUBLIC_TSA_WAIT_API_KEY', note: 'Live security lines feeding the leave-by advice.' },
    { name: 'Amadeus', state: keyed(Boolean(apiConfig.amadeusClientId)), envVar: 'EXPO_PUBLIC_AMADEUS_CLIENT_ID', note: 'Live airline fares on the ticket board.' },
    { name: 'In-app ticket purchase', state: 'partnership', note: 'Buying flights/hotels inside A2Z requires commercial provider agreements — not possible in a client-only app. A2Z hands you to the provider instead.' },
  ];
  const CONN_LABEL: Record<ConnState, string> = {
    working: 'Working (keyless)',
    configured: 'Configured',
    not_configured: 'Not configured',
    partnership: 'Requires partnership',
  };

  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  useEffect(() => {
    getAuditLog().then(setAuditLog);
  }, []);

  const prefsSummary = [
    profile.homeCity,
    profile.airportRanking?.[0] && `✈ ${profile.airportRanking[0]} first`,
    profile.hasTsaPrecheck && 'PreCheck',
    profile.transportationPriority,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>Settings</Text>

      {/* Travel preferences — its own page, always tweakable */}
      <Card onPress={() => navigation.navigate('Preferences')}>
        <View style={styles.prefsRow}>
          <View style={styles.prefsIcon}>
            <Ionicons name="options" size={20} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.prefsTitle}>Travel preferences</Text>
            <Text style={styles.prefsSub}>
              {prefsSummary || 'Home city, airports, modes, buffers, bags, priorities'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Card>

      <Card>
        <SectionHeader
          title="Notifications"
          subtitle="Trip reminders while this site is open — background alerts need the backend step"
        />
        <View style={styles.dataActions}>
          <AppButton
            label={notifPermission === 'granted' ? 'Notifications are on' : 'Enable notifications'}
            icon={notifPermission === 'granted' ? 'notifications' : 'notifications-outline'}
            variant={notifPermission === 'granted' ? 'secondary' : 'primary'}
            small
            onPress={enableNotifications}
          />
        </View>
        {notifMessage ? <Text style={styles.dataMessage}>{notifMessage}</Text> : null}
      </Card>

      <Card>
        <SectionHeader
          title="Your data"
          subtitle="Trips and settings are stored in this browser only — they are not synchronized across devices"
        />
        <View style={styles.dataActions}>
          <AppButton label="Export data" icon="download-outline" variant="secondary" small onPress={onExport} />
          <AppButton
            label={importOpen ? 'Cancel import' : 'Import data'}
            icon="cloud-upload-outline"
            variant="secondary"
            small
            onPress={() => setImportOpen((v) => !v)}
          />
          <AppButton label="Reset all data" icon="trash-outline" variant="ghost" small onPress={onReset} />
        </View>
        {importOpen && (
          <View style={styles.importWrap}>
            <TextInput
              style={styles.importInput}
              multiline
              value={importText}
              onChangeText={setImportText}
              placeholder="Paste the contents of an A2Z export file here…"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Paste exported A2Z JSON"
            />
            <AppButton label="Import this data" icon="checkmark" small onPress={onImport} />
            <Text style={styles.smallHint}>
              Importing replaces everything currently stored in this browser.
            </Text>
          </View>
        )}
        {dataMessage ? <Text style={styles.dataMessage}>{dataMessage}</Text> : null}
      </Card>

      <Card>
        <SectionHeader
          title="Connections"
          subtitle="What each data source really is — no pretend integrations"
        />
        <View style={styles.integrationStack}>
          {connections.map((i) => (
            <View key={i.name} style={styles.integrationRow}>
              <Ionicons
                name={
                  i.state === 'working' || i.state === 'configured'
                    ? 'checkmark-circle'
                    : i.state === 'partnership'
                      ? 'business-outline'
                      : 'ellipse-outline'
                }
                size={18}
                color={i.state === 'working' || i.state === 'configured' ? colors.success : colors.textMuted}
              />
              <View style={styles.flex}>
                <Text style={styles.integrationName}>{i.name}</Text>
                <Text style={styles.integrationNote}>
                  {i.note}
                  {i.state === 'not_configured' && i.envVar ? ` Add ${i.envVar} on Vercel to enable.` : ''}
                </Text>
              </View>
              <Text
                style={[
                  styles.integrationState,
                  (i.state === 'working' || i.state === 'configured') && styles.integrationLive,
                ]}
              >
                {CONN_LABEL[i.state]}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.smallHint}>
          Keys live in environment variables (see SETUP_REAL_DATA.md) — nothing is hardcoded, and
          nothing shows "Live" unless a real provider answered.
        </Text>
      </Card>

      <Card>
        <SectionHeader title="Help & guides" subtitle="The instructions written for this project" />
        {(
          [
            ['Open the live site', LIVE_SITE, 'globe-outline'],
            ['Going Live guide — backend, accounts, costs', `${REPO_BLOB}/GOING_LIVE.md`, 'rocket-outline'],
            ['Real-data setup guide — API keys step by step', `${REPO_BLOB}/SETUP_REAL_DATA.md`, 'key-outline'],
            ['Project README', `${REPO_BLOB}/README.md`, 'book-outline'],
          ] as Array<[string, string, keyof typeof Ionicons.glyphMap]>
        ).map(([label, url, icon]) => (
          <Pressable key={url} onPress={() => Linking.openURL(url)} style={styles.linkRow} accessibilityRole="link">
            <Ionicons name={icon} size={17} color={colors.primary} />
            <Text style={styles.linkText}>{label}</Text>
            <Ionicons name="open-outline" size={14} color={colors.textMuted} />
          </Pressable>
        ))}
      </Card>

      <Card>
        <SectionHeader
          title="What needs a backend (honestly)"
          subtitle="These are not switched off — they are impossible in a static site"
        />
        {[
          'Email trip import requires a backend and OAuth.',
          'Automatic flight monitoring requires a secure backend.',
          'Account syncing requires user authentication.',
          'Automatic booking requires commercial provider access.',
          'Cross-device sync requires a database.',
        ].map((line) => (
          <View key={line} style={styles.futureRow}>
            <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
            <Text style={styles.futureText}>{line}</Text>
          </View>
        ))}
        <Text style={styles.smallHint}>The Going Live guide above walks through fixing every one of these.</Text>
      </Card>

      <Card>
        <SectionHeader
          title="Activity log"
          subtitle="Every recommendation change, approval, and handoff — newest first"
        />
        {auditLog.length === 0 ? (
          <Text style={styles.aboutText}>Nothing yet — activity appears as you plan and book.</Text>
        ) : (
          auditLog.slice(0, 15).map((e, i) => (
            <View key={`${e.at}-${i}`} style={styles.auditRow}>
              <Ionicons
                name={e.actor === 'user' ? 'person-circle-outline' : 'cog-outline'}
                size={15}
                color={colors.textMuted}
              />
              <View style={styles.flex}>
                <Text style={styles.auditSummary}>{e.summary}</Text>
                <Text style={styles.auditMeta}>
                  {new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {e.action}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <Card>
        <SectionHeader title="About A2Z" />
        <Text style={styles.aboutText}>
          A2Z plans your whole journey — from your front door to your final destination — across
          flights, trains, buses, rideshares, and transit, with weather-aware advice and honest
          all-in pricing.
        </Text>
        <Text style={styles.aboutMeta}>
          Version 1.0.0 (MVP) · {savedTrips.length} saved trip{savedTrips.length === 1 ? '' : 's'}
        </Text>
        <Text style={styles.aboutMeta}>
          Build {BUILD_INFO.commit}
          {BUILD_INFO.builtAt !== 'dev' ? ` · ${new Date(BUILD_INFO.builtAt).toLocaleString()}` : ' (development)'}
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  screenTitle: { ...typography.hero, color: colors.ink },
  prefsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  prefsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefsTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  prefsSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  integrationStack: { gap: spacing.md },
  integrationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  integrationName: { fontSize: 14, fontWeight: '600', color: colors.text },
  integrationNote: { fontSize: 12, color: colors.textMuted },
  integrationState: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  integrationLive: { color: colors.success },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  linkText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  auditRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'flex-start',
  },
  auditSummary: { fontSize: 12.5, color: colors.text, lineHeight: 17 },
  auditMeta: { fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
  smallHint: { marginTop: spacing.md, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  aboutText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  aboutMeta: { marginTop: spacing.md, fontSize: 12, color: colors.textMuted },
  dataActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  importWrap: { gap: spacing.sm, marginTop: spacing.md },
  importInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 110,
    fontSize: 12,
    color: colors.text,
    textAlignVertical: 'top',
    backgroundColor: colors.surface,
  },
  dataMessage: { fontSize: 12.5, fontWeight: '600', color: colors.text, marginTop: spacing.sm, lineHeight: 17 },
  futureRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 4 },
  futureText: { flex: 1, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
});
