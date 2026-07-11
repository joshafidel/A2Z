import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from './AppButton';
import { Card } from './Card';
import { Chip } from './Chip';
import { DataFreshnessBadge } from './DataFreshnessBadge';
import { SectionHeader } from './SectionHeader';
import {
  conditionFromExpected,
  getLiveWeatherOnly,
  getStoredWeatherSnapshot,
  storeWeatherSnapshot,
  type WeatherSnapshot,
} from '../services/weatherService';
import { colors, spacing } from '../theme';
import {
  EXPECTED_CONDITIONS_LABELS,
  type ExpectedConditions,
  type SavedTrip,
} from '../types';
import { formatTime } from '../utils/time';

/**
 * Destination weather for the active trip. LIVE only when Open-Meteo
 * actually answered (with a "last checked" time); otherwise an honest
 * unavailable state with a manual "expected conditions" fallback that is
 * labeled as the user's own estimate.
 */
export function TripWeatherCard({
  trip,
  onPickExpected,
}: {
  trip: SavedTrip;
  /** Persist the user's expected-conditions pick (manual trips only). */
  onPickExpected?: (kind: ExpectedConditions) => void;
}) {
  const city = trip.search.destination.label ?? trip.search.destination.address;
  const [snapshot, setSnapshot] = useState<WeatherSnapshot>();
  const [failed, setFailed] = useState<string>();
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    const result = await getLiveWeatherOnly(city, trip.route.departureTime);
    if (result.ok) {
      setSnapshot(await storeWeatherSnapshot(trip.id, result.data));
      setFailed(undefined);
    } else {
      setFailed(result.error);
    }
    setBusy(false);
  };

  // On mount: show the stored snapshot immediately, then try one refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getStoredWeatherSnapshot(trip.id);
      if (!cancelled && stored) setSnapshot(stored);
      const result = await getLiveWeatherOnly(city, trip.route.departureTime);
      if (cancelled) return;
      if (result.ok) {
        setSnapshot(await storeWeatherSnapshot(trip.id, result.data));
        setFailed(undefined);
      } else {
        setFailed(result.error);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  const expected = trip.manual?.expectedConditions;
  const expectedCondition = expected ? conditionFromExpected(expected, city) : undefined;
  const shown = snapshot?.condition ?? expectedCondition;

  return (
    <Card>
      <SectionHeader title={`Weather in ${city}`} subtitle="For your travel date" />
      {snapshot ? (
        <DataFreshnessBadge
          mode="live"
          provider="Open-Meteo"
          lastVerifiedAt={snapshot.checkedAt}
          stale={Boolean(failed)}
        />
      ) : expectedCondition ? (
        <DataFreshnessBadge mode="user" provider="Your expected conditions" />
      ) : (
        <DataFreshnessBadge mode="unavailable" provider="Open-Meteo" />
      )}

      {shown ? (
        <View style={styles.row}>
          <Ionicons
            name={shown.kind === 'rain' || shown.kind === 'heavy-rain' ? 'rainy' : shown.kind === 'snow' ? 'snow' : shown.kind === 'storm' ? 'thunderstorm' : shown.kind === 'clouds' ? 'cloud' : shown.kind === 'cold' ? 'snow-outline' : 'sunny'}
            size={30}
            color={colors.primary}
          />
          <View style={styles.flex}>
            <Text style={styles.summary}>{shown.summary}</Text>
            <Text style={styles.meta}>
              {Math.round(shown.tempF)}°F · {Math.round(shown.precipChance)}% chance of rain ·{' '}
              {Math.round(shown.windMph)} mph wind
            </Text>
            {shown.advisories.slice(0, 2).map((a) => (
              <Text key={a} style={styles.advisory}>
                {a}
              </Text>
            ))}
            {snapshot && (
              <Text style={styles.checked}>Last checked {formatTime(snapshot.checkedAt)}</Text>
            )}
          </View>
        </View>
      ) : (
        <Text style={styles.unavailable}>
          {failed ?? 'No forecast yet.'} The rest of your trip still works — pick what you expect
          below so packing advice stays useful.
        </Text>
      )}

      {failed && snapshot && (
        <Text style={styles.staleNote}>
          Refresh failed — showing the forecast from {formatTime(snapshot.checkedAt)}, which may be
          out of date.
        </Text>
      )}

      {!snapshot && onPickExpected && (
        <View style={styles.chipRow}>
          {(Object.keys(EXPECTED_CONDITIONS_LABELS) as ExpectedConditions[]).map((k) => (
            <Chip
              key={k}
              label={EXPECTED_CONDITIONS_LABELS[k]}
              selected={expected === k}
              onPress={() => onPickExpected(k)}
            />
          ))}
        </View>
      )}

      <AppButton
        label={busy ? 'Checking…' : 'Refresh forecast'}
        icon="refresh"
        variant="ghost"
        small
        disabled={busy}
        onPress={refresh}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', marginTop: spacing.sm },
  summary: { fontSize: 15, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  advisory: { fontSize: 12, color: colors.warning, fontWeight: '600', marginTop: 3, lineHeight: 16 },
  checked: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  unavailable: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginTop: spacing.sm },
  staleNote: { fontSize: 11.5, color: colors.warning, fontWeight: '600', marginTop: spacing.sm, lineHeight: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
});
