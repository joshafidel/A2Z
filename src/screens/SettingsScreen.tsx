import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { SectionHeader } from '../components/SectionHeader';
import { useTrip } from '../context/TripContext';
import { BUILD_INFO } from '../buildInfo';
import { apiConfig } from '../services/config';
import { getAuditLog, type AuditEntry } from '../services/approvalService';
import * as storage from '../services/storageService';
import { RIDESHARE_APPS } from '../services/storageService';
import { colors, spacing, typography } from '../theme';
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
  const { defaultPreference, setDefaultPreference, savedTrips } = useTrip();
  const [connectedApps, setConnectedApps] = useState<string[]>([...RIDESHARE_APPS]);

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
    { name: 'Uber / Lyft handoff', state: 'working', note: 'Opens the ride app with pickup & drop-off already filled.' },
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
});
