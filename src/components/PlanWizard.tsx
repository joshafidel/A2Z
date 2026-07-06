import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getCurrentLocation } from '../services/locationService';
import { colors, radii, shadows, spacing, typography } from '../theme';
import { TIME_OF_DAY_LABELS, type TimeOfDay } from '../types';
import { AppButton } from './AppButton';
import { Chip } from './Chip';

/**
 * Guided planning flow: one question at a time, popup style —
 * Where are you coming from? → Where are you going? → What day?
 * The follow-up popups (main travel method, then how to reach the
 * station) happen on the Results screen and in the Trip Builder.
 */

export interface WizardResult {
  origin: string;
  originIsCurrent: boolean;
  destination: string;
  destinationLabel?: string;
  dayOffset: number;
  timeOfDay?: TimeOfDay;
}

const ORIGIN_SUGGESTIONS = ['215 W 75th St, New York, NY', 'Bryant Park, Manhattan, NY', 'Boston Logan Airport, Terminal A'];
const DEST_SUGGESTIONS: Array<{ address: string; label: string }> = [
  { address: 'Downtown hotel, Boston, MA', label: 'Boston hotel' },
  { address: 'Downtown hotel, Washington, DC', label: 'DC hotel' },
  { address: 'JFK Airport, Terminal 4', label: 'JFK Terminal 4' },
  { address: 'Newark Airport (EWR), Terminal B', label: 'EWR Terminal B' },
];

function wizardDates(): Array<{ label: string; sublabel: string; dayOffset: number }> {
  const out: Array<{ label: string; sublabel: string; dayOffset: number }> = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'long' }),
      sublabel: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      dayOffset: i,
    });
  }
  return out;
}

const TIME_ICONS: Record<TimeOfDay, keyof typeof Ionicons.glyphMap> = {
  morning: 'sunny-outline',
  midday: 'partly-sunny-outline',
  night: 'moon-outline',
};

export function PlanWizard({
  visible,
  onClose,
  onComplete,
}: {
  visible: boolean;
  onClose: () => void;
  onComplete: (result: WizardResult) => void;
}) {
  const [step, setStep] = useState(0);
  const [origin, setOrigin] = useState('');
  const [originIsCurrent, setOriginIsCurrent] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string>();
  const [destination, setDestination] = useState('');
  const [destinationLabel, setDestinationLabel] = useState<string>();
  const [dayOffset, setDayOffset] = useState<number>();
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>();
  const dates = useMemo(wizardDates, [visible]); // fresh dates every open

  const reset = () => {
    setStep(0);
    setLocationError(undefined);
  };

  const useLocation = async () => {
    setLocating(true);
    setLocationError(undefined);
    const result = await getCurrentLocation();
    setLocating(false);
    if (result.ok) {
      setOrigin(result.data.address);
      setOriginIsCurrent(true);
    } else {
      setLocationError(result.error);
    }
  };

  const finish = (offset: number) => {
    onComplete({
      origin: origin.trim(),
      originIsCurrent,
      destination: destination.trim(),
      destinationLabel,
      dayOffset: offset,
      timeOfDay,
    });
    reset();
  };

  const canContinue = step === 0 ? origin.trim().length > 3 : destination.trim().length > 3;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdropTouch} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Progress dots */}
          <View style={styles.progressRow}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.dot, i <= step && styles.dotActive]} />
            ))}
            <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {step === 0 && (
            <View style={styles.stepBody}>
              <Text style={styles.question}>Where are you coming from?</Text>
              <View style={styles.inputRow}>
                <Ionicons name="ellipse" size={12} color={colors.primary} />
                <TextInput
                  style={styles.input}
                  placeholder="Address, station, or airport"
                  placeholderTextColor={colors.textMuted}
                  value={origin}
                  onChangeText={(t) => {
                    setOrigin(t);
                    setOriginIsCurrent(false);
                  }}
                  autoFocus
                />
              </View>
              <Pressable onPress={useLocation} style={styles.locationRow}>
                <Ionicons name="locate" size={16} color={colors.primary} />
                <Text style={styles.locationText}>
                  {locating ? 'Finding your location…' : 'Use my current location'}
                </Text>
              </Pressable>
              {locationError ? <Text style={styles.error}>{locationError}</Text> : null}
              <View style={styles.suggestions}>
                {ORIGIN_SUGGESTIONS.map((s) => (
                  <Chip key={s} label={s.split(',')[0]} onPress={() => setOrigin(s)} selected={origin === s} />
                ))}
              </View>
              <AppButton label="Next" icon="arrow-forward" onPress={() => setStep(1)} disabled={!canContinue} />
            </View>
          )}

          {step === 1 && (
            <View style={styles.stepBody}>
              <Text style={styles.question}>Where are you going?</Text>
              <Text style={styles.hint}>A full address, someone's house, or just a city.</Text>
              <View style={styles.inputRow}>
                <Ionicons name="location" size={14} color={colors.danger} />
                <TextInput
                  style={styles.input}
                  placeholder="Destination"
                  placeholderTextColor={colors.textMuted}
                  value={destination}
                  onChangeText={(t) => {
                    setDestination(t);
                    setDestinationLabel(undefined);
                  }}
                  autoFocus
                />
              </View>
              <View style={styles.suggestions}>
                {DEST_SUGGESTIONS.map((s) => (
                  <Chip
                    key={s.address}
                    label={s.label}
                    onPress={() => {
                      setDestination(s.address);
                      setDestinationLabel(s.label);
                    }}
                    selected={destination === s.address}
                  />
                ))}
              </View>
              <AppButton label="Next" icon="arrow-forward" onPress={() => setStep(2)} disabled={!canContinue} />
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepBody}>
              <Text style={styles.question}>What day are you leaving?</Text>
              <Text style={styles.hint}>Optional: pick a departure window too.</Text>
              <View style={styles.windowRow}>
                {(Object.keys(TIME_OF_DAY_LABELS) as TimeOfDay[]).map((t) => (
                  <Chip
                    key={t}
                    label={TIME_OF_DAY_LABELS[t]}
                    icon={TIME_ICONS[t]}
                    selected={timeOfDay === t}
                    onPress={() => setTimeOfDay((prev) => (prev === t ? undefined : t))}
                  />
                ))}
              </View>
              <ScrollView style={styles.dateList} showsVerticalScrollIndicator={false}>
                {dates.map((d) => (
                  <Pressable
                    key={d.dayOffset}
                    onPress={() => {
                      setDayOffset(d.dayOffset);
                      finish(d.dayOffset);
                    }}
                    style={({ pressed }) => [
                      styles.dateRow,
                      dayOffset === d.dayOffset && styles.dateRowSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.dateLabel}>{d.label}</Text>
                    <Text style={styles.dateSub}>{d.sublabel}</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(14,19,48,0.5)', justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    maxHeight: '85%',
    ...shadows.floating,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  dot: { width: 24, height: 5, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary },
  close: { marginLeft: 'auto', padding: 4 },
  stepBody: { gap: spacing.md },
  question: { ...typography.title, color: colors.ink },
  hint: { fontSize: 13, color: colors.textSecondary, marginTop: -spacing.sm },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    minHeight: 54,
  },
  input: { flex: 1, fontSize: 16, color: colors.text },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  locationText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  error: { fontSize: 12, fontWeight: '600', color: colors.danger },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  windowRow: { flexDirection: 'row', gap: spacing.sm },
  dateList: { maxHeight: 320 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  dateRowSelected: { borderColor: colors.primary },
  pressed: { opacity: 0.85 },
  dateLabel: { fontSize: 15, fontWeight: '700', color: colors.text, width: 110 },
  dateSub: { flex: 1, fontSize: 14, color: colors.textSecondary },
});
