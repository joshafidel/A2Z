import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { SectionHeader } from '../components/SectionHeader';
import { useTrip } from '../context/TripContext';
import { BUILD_INFO } from '../buildInfo';
import { apiConfig } from '../services/config';
import { getAuditLog, type AuditEntry } from '../services/approvalService';
import type { RootTabParamList } from '../navigation/types';
import {
  ACCEPTED_MODE_LABELS,
  AIRPORT_ACCESS_LABELS,
  BAG_HABIT_LABELS,
  DEFAULT_PROFILE,
  getProfile,
  saveProfile,
  type AcceptedMode,
  type AirportAccessMode,
  type BagHabit,
  type TransportationPriority,
  type TravelerProfile,
} from '../services/preferencesService';
import * as storage from '../services/storageService';
import { RIDESHARE_APPS } from '../services/storageService';
import { colors, radii, spacing, typography } from '../theme';
import { confirmAction } from '../utils/confirm';
import { PREFERENCE_LABELS, type TravelPreference } from '../types';

const RIDESHARE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; note: string }> = {
  Uber: { icon: 'car', note: 'UberX + Uber Shuttle where offered' },
  Lyft: { icon: 'car-sport', note: 'Lyft Standard' },
  Empower: { icon: 'people', note: 'Driver-set prices · DC & Miami' },
  Taxi: { icon: 'car-outline', note: 'Metered taxi / Curb' },
};

/** Settings / preferences: default optimization + integration status. */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const { defaultPreference, setDefaultPreference, savedTrips, refreshTrips } = useTrip();
  const [connectedApps, setConnectedApps] = useState<string[]>([...RIDESHARE_APPS]);

  // --- Traveler profile ------------------------------------------------------
  const [profile, setProfile] = useState<TravelerProfile>(DEFAULT_PROFILE);
  useEffect(() => {
    getProfile().then(setProfile);
  }, []);
  const patchProfile = (patch: Partial<TravelerProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      saveProfile(next);
      return next;
    });
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

  useEffect(() => {
    storage.getConnectedRideshareApps().then(setConnectedApps);
  }, []);

  const toggleApp = (app: string) => {
    setConnectedApps((prev) => {
      const next = prev.includes(app) ? prev.filter((a) => a !== app) : [...prev, app];
      storage.setConnectedRideshareApps(next);
      return next;
    });
  };

  type ConnState = 'working' | 'configured' | 'not_configured' | 'partnership';
  const keyed = (configured: boolean): ConnState => (configured ? 'configured' : 'not_configured');
  const connections: Array<{ name: string; state: ConnState; note: string; envVar?: string }> = [
    { name: 'Weather (Open-Meteo)', state: 'working', note: 'Real forecasts for your travel dates — shapes walk-vs-ride advice.' },
    { name: 'Road routing (OSRM + Nominatim)', state: 'working', note: 'Real driving distances and address lookup.' },
    { name: 'Transit routing (Transitous)', state: 'working', note: 'Real subway/bus itineraries from public GTFS feeds.' },
    { name: 'Uber / Lyft handoff', state: 'working', note: 'Opens the ride app to book your airport leg.' },
    { name: 'Google Routes', state: keyed(Boolean(apiConfig.googleMapsApiKey)), envVar: 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY', note: 'Sharper transit routes with real fares and clock times.' },
    { name: 'Anthropic (Claude)', state: keyed(Boolean(process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY)), envVar: 'EXPO_PUBLIC_ANTHROPIC_API_KEY', note: 'AI concierge, packing lists, ride-price calibration, trip import.' },
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

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>Settings</Text>

      <Card>
        <SectionHeader
          title="Default preference"
          subtitle="New searches start with this optimization"
        />
        <View style={styles.prefGrid}>
          {(Object.keys(PREFERENCE_LABELS) as TravelPreference[]).map((p) => (
            <Chip
              key={p}
              label={PREFERENCE_LABELS[p]}
              selected={defaultPreference === p}
              onPress={() => setDefaultPreference(p)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <SectionHeader
          title="Traveler profile"
          subtitle="Shapes the leave-time estimate, packing list, and transport comparison"
        />
        <Text style={styles.fieldHint}>Home city (new trips start here)</Text>
        <TextInput
          style={styles.homeInput}
          value={profile.homeCity ?? ''}
          onChangeText={(v) => patchProfile({ homeCity: v.trim() === '' ? undefined : v })}
          placeholder="New York"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Home city"
        />
        {profile.airportRanking && profile.airportRanking.length > 0 && (
          <Text style={styles.fieldHint}>
            Airport ranking:{' '}
            {profile.airportRanking.map((c, i) => `${i + 1}. ${c}`).join('  ·  ')} (change via
            "Redo the welcome questions")
          </Text>
        )}
        {(
          [
            ['TSA PreCheck', 'hasTsaPrecheck'],
            ['CLEAR', 'hasClear'],
          ] as const
        ).map(([label, key]) => (
          <Pressable
            key={key}
            onPress={() => patchProfile({ [key]: !profile[key] } as Partial<TravelerProfile>)}
            style={styles.integrationRow}
            accessibilityRole="switch"
            accessibilityState={{ checked: profile[key] }}
          >
            <Text style={[styles.integrationName, styles.flex]}>{label}</Text>
            <Ionicons
              name={profile[key] ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={profile[key] ? colors.success : colors.textMuted}
            />
          </Pressable>
        ))}
        {(
          [
            ['Domestic airport buffer', 'domesticBufferMinutes', 15, 75, 240],
            ['International airport buffer', 'internationalBufferMinutes', 15, 120, 300],
            ['Traffic uncertainty', 'trafficUncertaintyMinutes', 5, 0, 60],
          ] as const
        ).map(([label, key, step, min, max]) => (
          <View key={key} style={styles.stepperRow}>
            <Text style={styles.stepperLabel}>{label}</Text>
            <View style={styles.stepperControls}>
              <Pressable
                onPress={() => patchProfile({ [key]: Math.max(min, profile[key] - step) } as Partial<TravelerProfile>)}
                style={styles.stepperButton}
                accessibilityLabel={`Decrease ${label}`}
                accessibilityRole="button"
              >
                <Ionicons name="remove" size={16} color={colors.primary} />
              </Pressable>
              <TextInput
                style={styles.stepperValueInput}
                value={String(profile[key])}
                keyboardType="numeric"
                accessibilityLabel={`${label} in minutes — tap to type a custom number`}
                onChangeText={(v) => {
                  const n = parseInt(v.replace(/\D/g, ''), 10);
                  if (Number.isFinite(n)) patchProfile({ [key]: n } as Partial<TravelerProfile>);
                }}
                onBlur={() =>
                  patchProfile({ [key]: Math.min(max, Math.max(min, profile[key])) } as Partial<TravelerProfile>)
                }
              />
              <Text style={styles.stepperUnit}>min</Text>
              <Pressable
                onPress={() => patchProfile({ [key]: Math.min(max, profile[key] + step) } as Partial<TravelerProfile>)}
                style={styles.stepperButton}
                accessibilityLabel={`Increase ${label}`}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={16} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        ))}
        <Text style={styles.fieldHint}>Bag habit</Text>
        <View style={styles.prefGrid}>
          {(Object.keys(BAG_HABIT_LABELS) as BagHabit[]).map((h) => (
            <Chip
              key={h}
              label={BAG_HABIT_LABELS[h].split(' — ')[0]}
              selected={(profile.bagHabit ?? (profile.usuallyChecksBag ? 'usually' : 'sometimes')) === h}
              onPress={() =>
                patchProfile({ bagHabit: h, usuallyChecksBag: h === 'usually' || h === 'always' })
              }
            />
          ))}
        </View>
        <Text style={styles.fieldHint}>Acceptable travel modes (planner preselects these)</Text>
        <View style={styles.prefGrid}>
          {(Object.keys(ACCEPTED_MODE_LABELS) as AcceptedMode[]).map((m) => (
            <Chip
              key={m}
              label={ACCEPTED_MODE_LABELS[m]}
              selected={(profile.acceptedModes ?? []).includes(m)}
              onPress={() => {
                const current = profile.acceptedModes ?? [];
                const next = current.includes(m) ? current.filter((x) => x !== m) : [...current, m];
                patchProfile({ acceptedModes: next.length > 0 ? next : undefined });
              }}
            />
          ))}
        </View>
        <Text style={styles.fieldHint}>Getting to the airport</Text>
        <View style={styles.prefGrid}>
          {(Object.keys(AIRPORT_ACCESS_LABELS) as AirportAccessMode[]).map((m) => (
            <Chip
              key={m}
              label={AIRPORT_ACCESS_LABELS[m]}
              selected={profile.airportAccessMode === m}
              onPress={() => patchProfile({ airportAccessMode: m })}
            />
          ))}
        </View>
        <Text style={styles.fieldHint}>Temperature unit</Text>
        <View style={styles.prefGrid}>
          {(['fahrenheit', 'celsius'] as const).map((u) => (
            <Chip
              key={u}
              label={u === 'fahrenheit' ? '°F' : '°C'}
              selected={profile.temperatureUnit === u}
              onPress={() => patchProfile({ temperatureUnit: u })}
            />
          ))}
        </View>
        <Text style={styles.fieldHint}>Transportation priority</Text>
        <View style={styles.prefGrid}>
          {(['cheapest', 'balanced', 'fastest', 'comfort'] as TransportationPriority[]).map((p) => (
            <Chip
              key={p}
              label={p[0].toUpperCase() + p.slice(1)}
              selected={profile.transportationPriority === p}
              onPress={() => patchProfile({ transportationPriority: p })}
            />
          ))}
        </View>
        {profile.homeCity || profile.homeAirportCode ? (
          <Text style={styles.fieldHint}>
            Home: {profile.homeCity ?? '—'}
            {profile.homeAirportCode ? ` · ${profile.homeAirportCode}` : ''}
          </Text>
        ) : null}
        <AppButton
          label="Redo the welcome questions"
          icon="sparkles-outline"
          variant="ghost"
          small
          onPress={() => navigation.navigate('PlanTab', { screen: 'Onboarding' })}
        />
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
            <Text style={styles.fieldHint}>
              Importing replaces everything currently stored in this browser.
            </Text>
          </View>
        )}
        {dataMessage ? <Text style={styles.dataMessage}>{dataMessage}</Text> : null}
      </Card>

      <Card>
        <SectionHeader
          title="Rideshare apps"
          subtitle="Connect the apps you use — ride options only come from these"
        />
        <View style={styles.integrationStack}>
          {RIDESHARE_APPS.map((app) => {
            const connected = connectedApps.includes(app);
            return (
              <Pressable
                key={app}
                onPress={() => toggleApp(app)}
                accessibilityRole="switch"
                accessibilityState={{ checked: connected }}
                style={styles.integrationRow}
              >
                <Ionicons
                  name={RIDESHARE_META[app]?.icon ?? 'car'}
                  size={18}
                  color={connected ? colors.primary : colors.textMuted}
                />
                <View style={styles.flex}>
                  <Text style={styles.integrationName}>{app}</Text>
                  <Text style={styles.integrationNote}>{RIDESHARE_META[app]?.note}</Text>
                </View>
                <Ionicons
                  name={connected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={connected ? colors.success : colors.textMuted}
                />
              </Pressable>
            );
          })}
        </View>
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
                color={
                  i.state === 'working' || i.state === 'configured'
                    ? colors.success
                    : colors.textMuted
                }
              />
              <View style={styles.flex}>
                <Text style={styles.integrationName}>{i.name}</Text>
                <Text style={styles.integrationNote}>
                  {i.note}
                  {i.state === 'not_configured' && i.envVar
                    ? ` Add ${i.envVar} on Vercel to enable.`
                    : ''}
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
        <Text style={styles.envHint}>
          Keys live in environment variables (see SETUP_REAL_DATA.md) — nothing is hardcoded, and
          nothing shows "Live" unless a real provider answered.
        </Text>
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
          {BUILD_INFO.builtAt !== 'dev'
            ? ` · ${new Date(BUILD_INFO.builtAt).toLocaleString()}`
            : ' (development)'}
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  screenTitle: { ...typography.hero, color: colors.ink },
  prefGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  integrationStack: { gap: spacing.md },
  integrationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  integrationName: { fontSize: 14, fontWeight: '600', color: colors.text },
  integrationNote: { fontSize: 12, color: colors.textMuted },
  integrationState: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  integrationLive: { color: colors.success },
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
  envHint: {
    marginTop: spacing.md,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  aboutText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  aboutMeta: { marginTop: spacing.md, fontSize: 12, color: colors.textMuted },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: spacing.md,
  },
  stepperLabel: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { fontSize: 13, fontWeight: '700', color: colors.ink, minWidth: 58, textAlign: 'center' },
  stepperValueInput: {
    minWidth: 48,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 5,
    paddingHorizontal: 4,
    backgroundColor: colors.surface,
  },
  stepperUnit: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  fieldHint: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.md, marginBottom: 6 },
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
  homeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  futureRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 4 },
  futureText: { flex: 1, fontSize: 12.5, color: colors.textSecondary, lineHeight: 17 },
});
