import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { SectionHeader } from '../components/SectionHeader';
import { useTrip } from '../context/TripContext';
import { apiConfig } from '../services/config';
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

  const integrations: Array<{ name: string; configured: boolean; note: string }> = [
    { name: 'OpenWeather', configured: Boolean(apiConfig.openWeatherApiKey), note: 'Live forecasts' },
    { name: 'Google Maps', configured: Boolean(apiConfig.googleMapsApiKey), note: 'Directions & transit' },
    { name: 'Amadeus / Duffel', configured: Boolean(apiConfig.amadeusClientId || apiConfig.duffelApiKey), note: 'Flight search' },
    { name: 'Rome2Rio', configured: Boolean(apiConfig.rome2RioApiKey), note: 'Multimodal routing' },
    { name: 'Transitland', configured: Boolean(apiConfig.transitlandApiKey), note: 'GTFS transit feeds' },
    { name: 'Uber / Lyft', configured: Boolean(apiConfig.uberServerToken || apiConfig.lyftClientId), note: 'Live ride pricing' },
    { name: 'aviationstack', configured: Boolean(apiConfig.aviationstackApiKey), note: 'Real-time flight status alerts' },
    { name: 'TSA Wait Times', configured: Boolean(apiConfig.tsaWaitApiKey), note: 'Live security lines → leave-by advice' },
  ];

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
          title="Data sources"
          subtitle={`Mode: ${apiConfig.mode === 'mock' ? 'Demo (mock data)' : 'Live APIs'}`}
        />
        <View style={styles.integrationStack}>
          {integrations.map((i) => (
            <View key={i.name} style={styles.integrationRow}>
              <Ionicons
                name={i.configured ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={i.configured ? colors.success : colors.textMuted}
              />
              <View style={styles.flex}>
                <Text style={styles.integrationName}>{i.name}</Text>
                <Text style={styles.integrationNote}>{i.note}</Text>
              </View>
              <Text style={[styles.integrationState, i.configured && styles.integrationLive]}>
                {i.configured ? 'Configured' : 'Mock'}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.envHint}>
          Add API keys in a local .env file (see .env.example). Keys are read from environment
          variables — nothing is hardcoded.
        </Text>
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
  envHint: {
    marginTop: spacing.md,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  aboutText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  aboutMeta: { marginTop: spacing.md, fontSize: 12, color: colors.textMuted },
});
