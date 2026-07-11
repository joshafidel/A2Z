import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from './AppButton';
import { Card } from './Card';
import { DataFreshnessBadge } from './DataFreshnessBadge';
import { SectionHeader } from './SectionHeader';
import { departureForManual, updateManualTrip } from '../services/manualTripService';
import type { TravelerProfile } from '../services/preferencesService';
import { colors, radii, spacing } from '../theme';
import type { SavedTrip } from '../types';
import { formatTime } from '../utils/time';

/**
 * Airport-departure calculator for manual trips: shows the recommended
 * leave time with every factor itemized, and lets the user edit the
 * assumptions (travel time, current traffic, buffer). Recalculating shows
 * the old and new recommendation side by side — always as an estimate.
 */
export function DepartureCard({
  trip,
  profile,
  onTripUpdated,
}: {
  trip: SavedTrip;
  profile: TravelerProfile;
  onTripUpdated: (trip: SavedTrip) => void;
}) {
  const m = trip.manual;
  const rec = useMemo(() => (m ? departureForManual(m, profile) : undefined), [m, profile]);

  const [editing, setEditing] = useState(false);
  const [travel, setTravel] = useState(String(m?.departure.estimatedTravelMinutes ?? ''));
  const [traffic, setTraffic] = useState(
    m?.departure.currentTrafficMinutes !== undefined ? String(m.departure.currentTrafficMinutes) : '',
  );
  const [buffer, setBuffer] = useState(
    m?.departure.airportBufferMinutes !== undefined ? String(m.departure.airportBufferMinutes) : '',
  );
  const [moveNote, setMoveNote] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (!m || !rec) return null;

  const recalc = async () => {
    if (busy) return;
    const travelNum = parseInt(travel, 10);
    if (!Number.isFinite(travelNum) || travelNum <= 0) {
      setError('Travel time must be a number of minutes above 0.');
      return;
    }
    const trafficNum = traffic.trim() === '' ? undefined : parseInt(traffic, 10);
    const bufferNum = buffer.trim() === '' ? undefined : parseInt(buffer, 10);
    if (traffic.trim() !== '' && !Number.isFinite(trafficNum)) {
      setError('Current traffic must be a number of minutes (or empty).');
      return;
    }
    if (buffer.trim() !== '' && !Number.isFinite(bufferNum)) {
      setError('The airport buffer must be a number of minutes (or empty).');
      return;
    }
    setError(undefined);
    setBusy(true);
    const before = rec;
    const updated = await updateManualTrip(
      trip,
      {
        ...m,
        departure: {
          ...m.departure,
          estimatedTravelMinutes: travelNum,
          currentTrafficMinutes: trafficNum,
          airportBufferMinutes: bufferNum,
        },
      },
      profile,
    );
    setBusy(false);
    if (!updated?.manual) return;
    const after = departureForManual(updated.manual, profile);
    const delta = Math.round((after.recommendedLeaveAt.getTime() - before.recommendedLeaveAt.getTime()) / 60_000);
    setMoveNote(
      delta === 0
        ? 'The recommendation did not move.'
        : `Your suggested leave time moved from ${formatTime(before.recommendedLeaveAt.toISOString())} to ${formatTime(after.recommendedLeaveAt.toISOString())}.`,
    );
    setEditing(false);
    onTripUpdated(updated);
  };

  return (
    <Card>
      <SectionHeader
        title="When to leave"
        subtitle="A deterministic estimate from your own numbers — tap any assumption to change it"
      />
      <DataFreshnessBadge mode="estimate" provider="A2Z departure calculator" />
      <Text style={styles.leaveTime}>Leave by {formatTime(rec.recommendedLeaveAt.toISOString())}</Text>
      <Text style={styles.explanation}>{rec.explanation}</Text>
      <Text style={styles.target}>
        Target airport arrival: {formatTime(rec.targetAirportArrivalAt.toISOString())} ·{' '}
        {rec.routeTimeMinutes} min travel · {rec.uncertaintyBufferMinutes} min uncertainty buffer
      </Text>

      {moveNote && (
        <View style={styles.moveRow}>
          <Ionicons name="swap-horizontal" size={14} color={colors.warning} />
          <Text style={styles.moveText}>{moveNote}</Text>
        </View>
      )}

      <Pressable onPress={() => setEditing((v) => !v)} style={styles.factorsToggle} accessibilityRole="button">
        <Text style={styles.factorsToggleText}>
          {editing ? 'Hide assumptions' : 'See & edit the assumptions'}
        </Text>
        <Ionicons name={editing ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
      </Pressable>

      {editing && (
        <View style={styles.editWrap}>
          {rec.factors.map((f) => (
            <View key={f.label} style={styles.factorRow}>
              <Text style={styles.factorLabel}>{f.label}</Text>
              <Text style={styles.factorValue}>
                {f.value}
                {f.impactMinutes !== undefined && f.impactMinutes !== 0
                  ? ` (${f.impactMinutes > 0 ? '+' : ''}${f.impactMinutes} min)`
                  : ''}
              </Text>
            </View>
          ))}
          <View style={styles.inputRow}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Travel (min)</Text>
              <TextInput
                style={styles.input}
                value={travel}
                onChangeText={setTravel}
                keyboardType="numeric"
                accessibilityLabel="Estimated travel minutes to the airport"
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Traffic now (min)</Text>
              <TextInput
                style={styles.input}
                value={traffic}
                onChangeText={setTraffic}
                keyboardType="numeric"
                placeholder="—"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Current total travel minutes with traffic"
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>Buffer (min)</Text>
              <TextInput
                style={styles.input}
                value={buffer}
                onChangeText={setBuffer}
                keyboardType="numeric"
                placeholder="default"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Airport buffer minutes"
              />
            </View>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AppButton label={busy ? 'Recalculating…' : 'Recalculate'} icon="refresh" small disabled={busy} onPress={recalc} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  leaveTime: { fontSize: 22, fontWeight: '900', color: colors.ink, marginTop: spacing.sm },
  explanation: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginTop: 4 },
  target: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 16 },
  moveRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: spacing.sm },
  moveText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.text, lineHeight: 17 },
  factorsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
    minHeight: 32,
  },
  factorsToggleText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  editWrap: { gap: spacing.sm, marginTop: spacing.sm },
  factorRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  factorLabel: { fontSize: 12, fontWeight: '700', color: colors.text, flexShrink: 0 },
  factorValue: { flex: 1, fontSize: 12, color: colors.textSecondary, textAlign: 'right' },
  inputRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  inputCol: { flex: 1 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 3 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  error: { fontSize: 12, color: colors.danger, fontWeight: '600' },
});
