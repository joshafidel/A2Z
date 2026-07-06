import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { useTrip } from '../context/TripContext';
import type { HomeScreenProps } from '../navigation/types';
import { getCurrentLocation } from '../services/locationService';
import { colors, radii, spacing, typography } from '../theme';
import {
  PREFERENCE_LABELS,
  TIME_OF_DAY_LABELS,
  type TimeOfDay,
  type TransportMode,
  type TravelPreference,
  type TripSearch,
} from '../types';

// ---------------------------------------------------------------------------
// Sample trips (quick-fill) — the corridors the mock data layer supports.
// ---------------------------------------------------------------------------

const SAMPLE_TRIPS: Array<{ label: string; origin: string; destination: string; destLabel: string }> = [
  {
    label: 'NYC → Boston',
    origin: '215 W 75th St, New York, NY',
    destination: 'Downtown hotel, Boston, MA',
    destLabel: 'Boston hotel',
  },
  {
    label: 'NYC → Washington DC',
    origin: '215 W 75th St, New York, NY',
    destination: 'Downtown hotel, Washington, DC',
    destLabel: 'DC hotel',
  },
  {
    label: 'Manhattan → JFK',
    origin: 'Bryant Park, Manhattan, NY',
    destination: 'JFK Airport, Terminal 4',
    destLabel: 'JFK Terminal 4',
  },
  {
    label: 'Manhattan → Newark Airport',
    origin: 'Bryant Park, Manhattan, NY',
    destination: 'Newark Airport (EWR), Terminal B',
    destLabel: 'EWR Terminal B',
  },
  {
    label: 'Logan → Downtown Boston',
    origin: 'Boston Logan Airport, Terminal A',
    destination: 'Downtown hotel, Boston, MA',
    destLabel: 'Boston hotel',
  },
];

/** The next 14 days as selectable travel dates. */
function dateChoices(): Array<{ label: string; sublabel: string; dayOffset: number }> {
  const out: Array<{ label: string; sublabel: string; dayOffset: number }> = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      label: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString([], { weekday: 'short' }),
      sublabel: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      dayOffset: i,
    });
  }
  return out;
}

/** Departure hour for each (optional) time-of-day window. */
const TIME_OF_DAY_HOURS: Record<TimeOfDay, number> = { morning: 8, midday: 13, night: 19 };
const DEFAULT_HOUR = 9;

const TIME_OF_DAY_ICONS: Record<TimeOfDay, keyof typeof Ionicons.glyphMap> = {
  morning: 'sunny-outline',
  midday: 'partly-sunny-outline',
  night: 'moon-outline',
};

const PREFERENCE_ICONS: Record<TravelPreference, keyof typeof Ionicons.glyphMap> = {
  cheapest: 'pricetag',
  fastest: 'flash',
  easiest: 'happy',
  'least-walking': 'walk',
  'fewest-transfers': 'swap-horizontal',
  'most-reliable': 'shield-checkmark',
};

export function HomeScreen({ navigation }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { defaultPreference } = useTrip();

  const [origin, setOrigin] = useState('');
  const [originIsCurrent, setOriginIsCurrent] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string>();
  const [destination, setDestination] = useState('');
  const [destLabel, setDestLabel] = useState<string>();
  const [dates] = useState(dateChoices);
  const [dayOffset, setDayOffset] = useState(1); // default tomorrow
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(); // optional
  const [travelers, setTravelers] = useState(1);
  const [bags, setBags] = useState(1);
  const [preference, setPreference] = useState<TravelPreference>(defaultPreference);
  const [hasTicket, setHasTicket] = useState(false);
  const [ticketMode, setTicketMode] = useState<'flight' | 'train' | 'bus'>('train');
  const [touched, setTouched] = useState(false);

  const valid = origin.trim().length > 3 && destination.trim().length > 3;

  const applySample = (s: (typeof SAMPLE_TRIPS)[number]) => {
    setOrigin(s.origin);
    setOriginIsCurrent(false);
    setDestination(s.destination);
    setDestLabel(s.destLabel);
    setTouched(false);
  };

  const useCurrentLocation = async () => {
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

  const departureIso = () => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(timeOfDay ? TIME_OF_DAY_HOURS[timeOfDay] : DEFAULT_HOUR, 0, 0, 0);
    return d.toISOString();
  };

  const plan = () => {
    setTouched(true);
    if (!valid) return;
    const search: TripSearch = {
      origin: { address: origin.trim(), label: originIsCurrent ? 'Current location' : 'Home' },
      destination: {
        address: destination.trim(),
        // Fall back to the first chunk of the typed address ("Downtown hotel").
        label: destLabel ?? destination.trim().split(',')[0],
      },
      departureTime: departureIso(),
      timeOfDay,
      travelers,
      bags,
      preference,
      existingTicket: hasTicket ? { mode: ticketMode as TransportMode & ('flight' | 'train' | 'bus') } : undefined,
    };
    navigation.navigate('Results', { search });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient
          colors={[colors.navy, '#1E2B66', colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}
        >
          <Text style={styles.brand}>A2Z</Text>
          <Text style={styles.heroTitle}>Door to door,{'\n'}planned to the minute.</Text>
          <Text style={styles.heroSubtitle}>
            Compare flights, trains, buses, rideshares and transit — with weather, prices, and
            timing built in.
          </Text>
        </LinearGradient>

        <View style={styles.body}>
          {/* Search card */}
          <Card style={styles.searchCard}>
            <Field
              icon="ellipse"
              iconColor={colors.primary}
              placeholder="Starting address"
              value={origin}
              onChangeText={(t) => {
                setOrigin(t);
                setOriginIsCurrent(false);
              }}
              error={touched && origin.trim().length <= 3 ? 'Enter a starting address' : undefined}
            />
            <Pressable
              onPress={useCurrentLocation}
              accessibilityRole="button"
              style={({ pressed }) => [styles.locationButton, pressed && styles.locationPressed]}
            >
              <Ionicons
                name={originIsCurrent ? 'locate' : 'locate-outline'}
                size={15}
                color={colors.primary}
              />
              <Text style={styles.locationText}>
                {locating
                  ? 'Finding your location…'
                  : originIsCurrent
                    ? 'Using your current location'
                    : 'Use my current location'}
              </Text>
            </Pressable>
            {locationError ? <Text style={styles.fieldError}>{locationError}</Text> : null}
            <View style={styles.divider} />
            <Field
              icon="location"
              iconColor={colors.danger}
              placeholder="Destination — address, hotel, or just a city"
              value={destination}
              onChangeText={(t) => {
                setDestination(t);
                setDestLabel(undefined);
              }}
              error={touched && destination.trim().length <= 3 ? 'Enter a destination' : undefined}
            />
          </Card>

          {/* Sample trips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {SAMPLE_TRIPS.map((s) => (
              <Chip
                key={s.label}
                label={s.label}
                icon="sparkles"
                selected={origin === s.origin && destination === s.destination}
                onPress={() => applySample(s)}
              />
            ))}
          </ScrollView>

          {/* Travel date */}
          <Text style={styles.sectionLabel}>TRAVEL DATE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {dates.map((d) => {
              const selected = dayOffset === d.dayOffset;
              return (
                <Pressable
                  key={d.dayOffset}
                  onPress={() => setDayOffset(d.dayOffset)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.dateChip, selected && styles.dateChipSelected]}
                >
                  <Text style={[styles.dateChipDay, selected && styles.dateChipTextSelected]}>
                    {d.label}
                  </Text>
                  <Text style={[styles.dateChipDate, selected && styles.dateChipTextSelected]}>
                    {d.sublabel}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Optional departure window */}
          <Text style={styles.sectionLabel}>DEPARTURE WINDOW (OPTIONAL)</Text>
          <View style={styles.prefGrid}>
            {(Object.keys(TIME_OF_DAY_LABELS) as TimeOfDay[]).map((t) => (
              <Chip
                key={t}
                label={TIME_OF_DAY_LABELS[t]}
                icon={TIME_OF_DAY_ICONS[t]}
                selected={timeOfDay === t}
                onPress={() => setTimeOfDay((prev) => (prev === t ? undefined : t))}
              />
            ))}
          </View>

          {/* Party */}
          <View style={styles.stepperRow}>
            <Stepper
              icon="people"
              label="Travelers"
              value={travelers}
              min={1}
              max={8}
              onChange={setTravelers}
            />
            <Stepper icon="briefcase" label="Bags" value={bags} min={0} max={6} onChange={setBags} />
          </View>

          {/* Preference */}
          <Text style={styles.sectionLabel}>WHAT MATTERS MOST?</Text>
          <View style={styles.prefGrid}>
            {(Object.keys(PREFERENCE_LABELS) as TravelPreference[]).map((p) => (
              <Chip
                key={p}
                label={PREFERENCE_LABELS[p]}
                icon={PREFERENCE_ICONS[p]}
                selected={preference === p}
                onPress={() => setPreference(p)}
              />
            ))}
          </View>

          {/* Existing ticket */}
          <Card style={styles.ticketCard}>
            <View style={styles.ticketRow}>
              <View style={styles.flex}>
                <Text style={styles.ticketTitle}>I already have a ticket</Text>
                <Text style={styles.ticketSubtitle}>
                  We'll plan around it and skip that fare in the totals.
                </Text>
              </View>
              <Switch
                value={hasTicket}
                onValueChange={setHasTicket}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#FFFFFF"
              />
            </View>
            {hasTicket && (
              <View style={styles.ticketModes}>
                {(['flight', 'train', 'bus'] as const).map((m) => (
                  <Chip
                    key={m}
                    label={m[0].toUpperCase() + m.slice(1)}
                    selected={ticketMode === m}
                    onPress={() => setTicketMode(m)}
                  />
                ))}
              </View>
            )}
          </Card>

          <AppButton label="Plan my trip" icon="navigate" onPress={plan} disabled={touched && !valid} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------

function Field({
  icon,
  iconColor,
  placeholder,
  value,
  onChangeText,
  error,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  error?: string;
}) {
  return (
    <View>
      <View style={styles.fieldRow}>
        <Ionicons name={icon} size={14} color={iconColor} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
        />
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function Stepper({
  icon,
  label,
  value,
  min,
  max,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <Card style={styles.stepper} padded={false}>
      <View style={styles.stepperInner}>
        <View style={styles.stepperLabelRow}>
          <Ionicons name={icon} size={15} color={colors.textSecondary} />
          <Text style={styles.stepperLabel}>{label}</Text>
        </View>
        <View style={styles.stepperControls}>
          <Pressable
            onPress={() => onChange(Math.max(min, value - 1))}
            style={styles.stepperButton}
            accessibilityLabel={`Decrease ${label}`}
          >
            <Ionicons name="remove" size={18} color={value <= min ? colors.textMuted : colors.primary} />
          </Pressable>
          <Text style={styles.stepperValue}>{value}</Text>
          <Pressable
            onPress={() => onChange(Math.min(max, value + 1))}
            style={styles.stepperButton}
            accessibilityLabel={`Increase ${label}`}
          >
            <Ionicons name="add" size={18} color={value >= max ? colors.textMuted : colors.primary} />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl + spacing.lg,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    gap: spacing.sm,
  },
  brand: {
    color: colors.textOnDark,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 4,
  },
  heroTitle: { ...typography.hero, color: colors.textOnDark, lineHeight: 36 },
  heroSubtitle: { fontSize: 14, color: colors.textOnDarkMuted, lineHeight: 20, maxWidth: 320 },
  body: {
    paddingHorizontal: spacing.lg,
    marginTop: -spacing.xxl,
    gap: spacing.lg,
  },
  searchCard: { gap: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 26 },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 26,
    marginBottom: spacing.sm,
    minHeight: 32,
  },
  locationPressed: { opacity: 0.7 },
  locationText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  dateChip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 72,
    minHeight: 56,
  },
  dateChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateChipDay: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  dateChipDate: { fontSize: 12, fontWeight: '500', color: colors.textMuted, marginTop: 1 },
  dateChipTextSelected: { color: '#FFFFFF' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 46 },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: spacing.sm },
  fieldError: { color: colors.danger, fontSize: 12, fontWeight: '600', marginLeft: 26, marginBottom: 4 },
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  sectionLabel: { ...typography.micro, color: colors.textMuted, marginTop: spacing.sm },
  stepperRow: { flexDirection: 'row', gap: spacing.md },
  stepper: { flex: 1 },
  stepperInner: { padding: spacing.md, gap: spacing.sm },
  stepperLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { ...typography.title, color: colors.ink },
  prefGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ticketCard: { gap: spacing.md },
  ticketRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ticketTitle: { ...typography.bodyMedium, color: colors.text },
  ticketSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  ticketModes: { flexDirection: 'row', gap: spacing.sm },
});
