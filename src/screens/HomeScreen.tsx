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
import { colors, radii, spacing, typography } from '../theme';
import {
  PREFERENCE_LABELS,
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

/** Quick departure choices — replace with a full date-time picker post-MVP. */
function departureChoices(): Array<{ label: string; iso: string }> {
  const mk = (daysAhead: number, hour: number, label: string) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    return { label, iso: d.toISOString() };
  };
  return [
    mk(0, 8, 'Today 8 AM'),
    mk(0, 14, 'Today 2 PM'),
    mk(1, 7, 'Tomorrow 7 AM'),
    mk(1, 9, 'Tomorrow 9 AM'),
    mk(2, 8, 'In 2 days, 8 AM'),
  ];
}

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
  const [destination, setDestination] = useState('');
  const [destLabel, setDestLabel] = useState<string>();
  const [choices] = useState(departureChoices);
  const [departureIso, setDepartureIso] = useState(choices[2].iso);
  const [travelers, setTravelers] = useState(1);
  const [bags, setBags] = useState(1);
  const [preference, setPreference] = useState<TravelPreference>(defaultPreference);
  const [hasTicket, setHasTicket] = useState(false);
  const [ticketMode, setTicketMode] = useState<'flight' | 'train' | 'bus'>('train');
  const [touched, setTouched] = useState(false);

  const valid = origin.trim().length > 3 && destination.trim().length > 3;

  const applySample = (s: (typeof SAMPLE_TRIPS)[number]) => {
    setOrigin(s.origin);
    setDestination(s.destination);
    setDestLabel(s.destLabel);
    setTouched(false);
  };

  const plan = () => {
    setTouched(true);
    if (!valid) return;
    const search: TripSearch = {
      origin: { address: origin.trim(), label: 'Home' },
      destination: { address: destination.trim(), label: destLabel ?? 'destination' },
      departureTime: departureIso,
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
              onChangeText={setOrigin}
              error={touched && origin.trim().length <= 3 ? 'Enter a starting address' : undefined}
            />
            <View style={styles.divider} />
            <Field
              icon="location"
              iconColor={colors.danger}
              placeholder="Destination address"
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

          {/* Departure */}
          <Text style={styles.sectionLabel}>WHEN ARE YOU LEAVING?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {choices.map((c) => (
              <Chip
                key={c.iso}
                label={c.label}
                selected={departureIso === c.iso}
                onPress={() => setDepartureIso(c.iso)}
              />
            ))}
          </ScrollView>

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
