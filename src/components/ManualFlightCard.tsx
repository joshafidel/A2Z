import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from './AppButton';
import { Card } from './Card';
import { Chip } from './Chip';
import { DataFreshnessBadge } from './DataFreshnessBadge';
import { SectionHeader } from './SectionHeader';
import { parseTimeInput } from '../screens/CreateTripScreen';
import { updateManualTrip } from '../services/manualTripService';
import type { TravelerProfile } from '../services/preferencesService';
import { colors, radii, spacing } from '../theme';
import type { ManualFlightStatus, SavedTrip } from '../types';
import { formatTime } from '../utils/time';

const STATUSES: ManualFlightStatus[] = ['scheduled', 'delayed', 'cancelled', 'landed', 'unknown'];

/**
 * Flight information entered by you — manual status controls. This is NOT
 * live flight tracking: the user types what they see in their airline app,
 * and A2Z recalculates the leave time and timeline from it.
 */
export function ManualFlightCard({
  trip,
  profile,
  onTripUpdated,
}: {
  trip: SavedTrip;
  profile: TravelerProfile;
  onTripUpdated: (trip: SavedTrip) => void;
}) {
  const m = trip.manual;
  const flight = m?.flight;
  const [status, setStatus] = useState<ManualFlightStatus>(flight?.status ?? 'scheduled');
  const [estTime, setEstTime] = useState(
    flight?.estimatedDepartureAt ? formatTime(flight.estimatedDepartureAt) : '',
  );
  const [gate, setGate] = useState(flight?.gate ?? '');
  const [terminal, setTerminal] = useState(flight?.terminal ?? '');
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (!m || !flight) return null;

  const save = async () => {
    if (busy) return;
    let estimatedIso: string | undefined;
    if (estTime.trim() !== '') {
      const mins = parseTimeInput(estTime);
      if (mins === undefined) {
        setError('Enter the estimated departure like "6:42 PM" (or leave it empty).');
        return;
      }
      const d = new Date(flight.scheduledDepartureAt);
      d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      estimatedIso = d.toISOString();
    }
    setError(undefined);
    setBusy(true);
    const beforeLeave = trip.route.recommendedLeaveTime;
    const beforeDep = flight.estimatedDepartureAt ?? flight.scheduledDepartureAt;
    const updated = await updateManualTrip(
      trip,
      {
        ...m,
        flight: {
          ...flight,
          status,
          estimatedDepartureAt: estimatedIso,
          gate: gate.trim() === '' ? undefined : gate.trim().toUpperCase(),
          terminal: terminal.trim() === '' ? undefined : terminal.trim().toUpperCase(),
        },
      },
      profile,
    );
    setBusy(false);
    if (!updated) return;
    const afterDep = estimatedIso ?? flight.scheduledDepartureAt;
    const depMoved = Math.abs(new Date(afterDep).getTime() - new Date(beforeDep).getTime()) >= 60_000;
    const leaveMoved = updated.route.recommendedLeaveTime !== beforeLeave;
    setNote(
      depMoved || leaveMoved
        ? `Departure ${depMoved ? `changed from ${formatTime(beforeDep)} to ${formatTime(afterDep)}` : 'unchanged'}. ` +
            `Your recommended leave time ${leaveMoved ? `changed from ${formatTime(beforeLeave)} to ${formatTime(updated.route.recommendedLeaveTime)}` : 'did not move'}.`
        : 'Saved. Nothing moved enough to change the plan.',
    );
    onTripUpdated(updated);
  };

  return (
    <Card>
      <SectionHeader
        title="Flight information entered by you"
        subtitle="Type what your airline app shows — A2Z updates the plan from it"
      />
      <DataFreshnessBadge mode="user" provider="Manual flight status" />
      <Text style={styles.flightLine}>
        {flight.airlineName ?? 'Flight'} {flight.flightNumber ?? ''} · scheduled{' '}
        {formatTime(flight.scheduledDepartureAt)}
      </Text>
      <View style={styles.chipRow}>
        {STATUSES.map((s) => (
          <Chip key={s} label={s[0].toUpperCase() + s.slice(1)} selected={status === s} onPress={() => setStatus(s)} />
        ))}
      </View>
      <View style={styles.inputRow}>
        <View style={styles.inputColWide}>
          <Text style={styles.inputLabel}>Estimated departure</Text>
          <TextInput
            style={styles.input}
            value={estTime}
            onChangeText={setEstTime}
            placeholder="6:42 PM"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Estimated departure time"
          />
        </View>
        <View style={styles.inputCol}>
          <Text style={styles.inputLabel}>Terminal</Text>
          <TextInput
            style={styles.input}
            value={terminal}
            onChangeText={setTerminal}
            placeholder="4"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            accessibilityLabel="Terminal"
          />
        </View>
        <View style={styles.inputCol}>
          <Text style={styles.inputLabel}>Gate</Text>
          <TextInput
            style={styles.input}
            value={gate}
            onChangeText={setGate}
            placeholder="B12"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            accessibilityLabel="Gate"
          />
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {note && (
        <View style={styles.noteRow}>
          <Ionicons name="swap-horizontal" size={14} color={colors.warning} />
          <Text style={styles.noteText}>{note}</Text>
        </View>
      )}
      <AppButton label={busy ? 'Saving…' : 'Save flight update'} icon="save-outline" small disabled={busy} onPress={save} />
      <View style={styles.futureRow}>
        <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
        <Text style={styles.futureText}>
          Automatic flight monitoring will require a secure backend in a later version — this page
          never checks your flight on its own.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flightLine: { fontSize: 13.5, fontWeight: '700', color: colors.ink, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  inputRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  inputCol: { flex: 1 },
  inputColWide: { flex: 1.6 },
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
  error: { fontSize: 12, color: colors.danger, fontWeight: '600', marginBottom: spacing.sm },
  noteRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginBottom: spacing.sm },
  noteText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.text, lineHeight: 17 },
  futureRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: spacing.md },
  futureText: { flex: 1, fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },
});
