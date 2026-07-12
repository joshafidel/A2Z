import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { Chip } from '../components/Chip';
import { airportsNear, findCityCoords, type Airport } from '../data/airports';
import type { OnboardingScreenProps } from '../navigation/types';
import { guessHomeCity } from '../services/locationService';
import {
  BAG_HABIT_LABELS,
  DEFAULT_PROFILE,
  getProfile,
  saveProfile,
  type BagHabit,
  type TransportationPriority,
  type TravelerProfile,
} from '../services/preferencesService';
import { RIDESHARE_APPS, setConnectedRideshareApps } from '../services/storageService';
import { colors, radii, spacing, typography } from '../theme';

type StepKey = 'home' | 'airports' | 'rideshare' | 'security' | 'bag' | 'timing' | 'priority';

const STEPS: StepKey[] = ['home', 'airports', 'rideshare', 'security', 'bag', 'timing', 'priority'];

const PRIORITY_OPTIONS: Array<[TransportationPriority, string, string]> = [
  ['cheapest', 'Cheapest', 'Save the money'],
  ['fastest', 'Fastest', 'Save the time'],
  ['balanced', 'Balanced', 'Best mix of both'],
  ['comfort', 'Comfort', 'Least hassle, even if it costs more'],
];

/**
 * First-open welcome: one question at a time, every one skippable (or
 * skip the whole thing). Answers land in the traveler profile — saved in
 * this browser, editable any time in Settings — and shape every plan.
 */
export function OnboardingScreen({ navigation }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<TravelerProfile>({ ...DEFAULT_PROFILE });
  const [homeCity, setHomeCity] = useState('');
  const [cityGuessed, setCityGuessed] = useState(false);
  const [locBusy, setLocBusy] = useState(true);
  const [homeCoords, setHomeCoords] = useState<{ lat: number; lng: number }>();
  const [nearby, setNearby] = useState<Airport[]>([]);
  const [ranking, setRanking] = useState<string[]>([]);
  const [apps, setApps] = useState<string[]>([]);
  const [precheck, setPrecheck] = useState(false);
  const [clear, setClear] = useState(false);

  // Start from whatever is saved (redo case), then try to GUESS the home
  // city from the current location — always editable, never silently kept.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getProfile();
      if (cancelled) return;
      setProfile(p);
      setHomeCity(p.homeCity ?? '');
      setRanking(p.airportRanking ?? []);
      setPrecheck(p.hasTsaPrecheck);
      setClear(p.hasClear);
      const guess = await guessHomeCity();
      if (cancelled) return;
      setLocBusy(false);
      if (guess && !p.homeCity) {
        setHomeCity(guess.city);
        setCityGuessed(true);
      }
      if (guess) setHomeCoords({ lat: guess.lat, lng: guess.lng });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Airports near the (typed or guessed) home city, for the ranking step. */
  const loadNearby = (city: string) => {
    const entry = findCityCoords(city);
    const coords = entry ? { lat: entry.lat, lng: entry.lng } : homeCoords;
    setNearby(coords ? airportsNear(coords, 90, 5).map((r) => r.airport) : []);
  };

  // Entering the airports step always reflects the latest city answer.
  useEffect(() => {
    if (STEPS[step] === 'airports') loadNearby(homeCity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const finish = async (answers: TravelerProfile) => {
    await saveProfile({ ...answers, onboardingDone: true });
    if (apps.length > 0) await setConnectedRideshareApps(apps);
    navigation.goBack();
  };

  const next = async (patch: Partial<TravelerProfile> = {}) => {
    const updated = { ...profile, ...patch };
    setProfile(updated);
    if (step >= STEPS.length - 1) await finish(updated);
    else setStep(step + 1);
  };

  const key = STEPS[step];

  const toggleRank = (code: string) =>
    setRanking((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const stepper = (
    label: string,
    value: number,
    delta: number,
    min: number,
    max: number,
    onChange: (v: number) => void,
  ) => (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - delta))}
          style={styles.stepperButton}
          accessibilityLabel={`Decrease ${label}`}
          accessibilityRole="button"
        >
          <Ionicons name="remove" size={18} color={colors.primary} />
        </Pressable>
        <Text style={styles.stepperValue}>{value} min</Text>
        <Pressable
          onPress={() => onChange(Math.min(max, value + delta))}
          style={styles.stepperButton}
          accessibilityLabel={`Increase ${label}`}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={18} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.flex}>
      <LinearGradient
        colors={[colors.navy, '#1E2B66', colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}
      >
        <Text style={styles.brand}>
          A<Text style={styles.brandAccent}>2</Text>Z
        </Text>
        <Text style={styles.heroTitle}>
          {step === 0 ? "Let's set up your travel profile" : 'A few quick questions'}
        </Text>
        <Text style={styles.heroSub}>
          Question {step + 1} of {STEPS.length} · every answer is optional, saved only in this
          browser, and editable later in Settings
        </Text>
        <View style={styles.dots}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]} />
          ))}
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {key === 'home' && (
          <>
            <Text style={styles.question}>Where do you usually travel from?</Text>
            <Text style={styles.hint}>
              {locBusy
                ? 'Checking your current location to save you the typing…'
                : cityGuessed
                  ? 'Guessed from your current location — change it if that’s wrong.'
                  : 'A2Z starts new trips from here so you type less every time.'}
            </Text>
            <Text style={styles.fieldLabel}>Your city</Text>
            <TextInput
              style={styles.input}
              value={homeCity}
              onChangeText={(v) => {
                setHomeCity(v);
                setCityGuessed(false);
              }}
              placeholder={locBusy ? 'Finding your city…' : 'New York'}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Your home city"
            />
            <AppButton
              label="Next"
              icon="arrow-forward"
              onPress={() => {
                loadNearby(homeCity);
                next({ homeCity: homeCity.trim() === '' ? undefined : homeCity.trim() });
              }}
            />
          </>
        )}

        {key === 'airports' && (
          <>
            <Text style={styles.question}>Rank your preferred airports</Text>
            <Text style={styles.hint}>
              {nearby.length > 0
                ? `Tap in order of preference — first tap is your favorite. Near ${homeCity.trim() || 'you'}:`
                : 'Enter a home city on the previous question to see nearby airports — or skip this.'}
            </Text>
            {nearby.map((a) => {
              const pos = ranking.indexOf(a.code);
              return (
                <Pressable
                  key={a.code}
                  onPress={() => toggleRank(a.code)}
                  style={[styles.rankRow, pos >= 0 && styles.rankRowActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: pos >= 0 }}
                >
                  <View style={[styles.rankBadge, pos >= 0 && styles.rankBadgeActive]}>
                    <Text style={[styles.rankBadgeText, pos >= 0 && styles.rankBadgeTextActive]}>
                      {pos >= 0 ? pos + 1 : '·'}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rankName}>
                      {a.code} — {a.name}
                    </Text>
                    <Text style={styles.rankMeta}>{a.city}</Text>
                  </View>
                </Pressable>
              );
            })}
            <AppButton
              label="Next"
              icon="arrow-forward"
              onPress={() =>
                next({
                  airportRanking: ranking.length > 0 ? ranking : undefined,
                  homeAirportCode: ranking[0] ?? profile.homeAirportCode,
                })
              }
            />
          </>
        )}

        {key === 'rideshare' && (
          <>
            <Text style={styles.question}>Which ride apps do you use?</Text>
            <Text style={styles.hint}>
              Ride suggestions only come from apps you actually have. Pick any, or none.
            </Text>
            <View style={styles.chipWrap}>
              {RIDESHARE_APPS.map((app) => (
                <Chip
                  key={app}
                  label={app}
                  selected={apps.includes(app)}
                  onPress={() =>
                    setApps((prev) =>
                      prev.includes(app) ? prev.filter((a) => a !== app) : [...prev, app],
                    )
                  }
                />
              ))}
            </View>
            <AppButton label="Next" icon="arrow-forward" onPress={() => next()} />
          </>
        )}

        {key === 'security' && (
          <>
            <Text style={styles.question}>Airport security programs</Text>
            <Text style={styles.hint}>
              PreCheck saves ~15 minutes and CLEAR ~5 more — the leave-time math uses both.
            </Text>
            {(
              [
                ['TSA PreCheck', precheck, setPrecheck],
                ['CLEAR', clear, setClear],
              ] as Array<[string, boolean, (v: boolean) => void]>
            ).map(([label, value, set]) => (
              <Pressable
                key={label}
                onPress={() => set(!value)}
                style={styles.toggleRow}
                accessibilityRole="switch"
                accessibilityState={{ checked: value }}
              >
                <Text style={[styles.toggleLabel, styles.flex]}>{label}</Text>
                <Ionicons
                  name={value ? 'checkmark-circle' : 'ellipse-outline'}
                  size={26}
                  color={value ? colors.success : colors.textMuted}
                />
              </Pressable>
            ))}
            <AppButton
              label="Next"
              icon="arrow-forward"
              onPress={() => next({ hasTsaPrecheck: precheck, hasClear: clear })}
            />
          </>
        )}

        {key === 'bag' && (
          <>
            <Text style={styles.question}>How do you usually handle bags?</Text>
            <Text style={styles.hint}>
              Sets the checked-bag default on new trips (bag drop adds 20 minutes and a cutoff).
            </Text>
            <View style={styles.answerCol}>
              {(Object.keys(BAG_HABIT_LABELS) as BagHabit[]).map((h) => (
                <AppButton
                  key={h}
                  label={BAG_HABIT_LABELS[h]}
                  variant={h === 'sometimes' ? 'primary' : 'secondary'}
                  onPress={() =>
                    next({ bagHabit: h, usuallyChecksBag: h === 'usually' || h === 'always' })
                  }
                />
              ))}
            </View>
          </>
        )}

        {key === 'timing' && (
          <>
            <Text style={styles.question}>How much airport buffer do you like?</Text>
            <Text style={styles.hint}>
              Your defaults for every flight plan — adjust with the − and + buttons.
            </Text>
            {stepper('Domestic airport buffer', profile.domesticBufferMinutes, 15, 75, 240, (v) =>
              setProfile((p) => ({ ...p, domesticBufferMinutes: v })),
            )}
            {stepper('International airport buffer', profile.internationalBufferMinutes, 15, 120, 300, (v) =>
              setProfile((p) => ({ ...p, internationalBufferMinutes: v })),
            )}
            {stepper('Traffic uncertainty', profile.trafficUncertaintyMinutes, 5, 0, 60, (v) =>
              setProfile((p) => ({ ...p, trafficUncertaintyMinutes: v })),
            )}
            <AppButton label="Next" icon="arrow-forward" onPress={() => next()} />
          </>
        )}

        {key === 'priority' && (
          <>
            <Text style={styles.question}>When options differ, what wins?</Text>
            <Text style={styles.hint}>Used to rank transportation comparisons and route suggestions.</Text>
            <View style={styles.answerCol}>
              {PRIORITY_OPTIONS.map(([p, label, sub]) => (
                <Pressable
                  key={p}
                  onPress={() => next({ transportationPriority: p })}
                  style={styles.priorityRow}
                  accessibilityRole="button"
                >
                  <View style={styles.flex}>
                    <Text style={styles.priorityLabel}>{label}</Text>
                    <Text style={styles.prioritySub}>{sub}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                </Pressable>
              ))}
            </View>
          </>
        )}

        <View style={styles.footerRow}>
          {step > 0 ? (
            <Pressable onPress={() => setStep(step - 1)} style={styles.footerLink} accessibilityRole="button">
              <Ionicons name="arrow-back" size={14} color={colors.textMuted} />
              <Text style={styles.footerLinkText}>Back</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <View style={styles.footerRight}>
            <Pressable onPress={() => next()} style={styles.footerLink} accessibilityRole="button">
              <Text style={styles.footerLinkText}>Skip this question</Text>
            </Pressable>
            <Pressable onPress={() => finish(profile)} style={styles.footerLink} accessibilityRole="button">
              <Text style={styles.footerLinkText}>Skip all</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  hero: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    gap: spacing.sm,
  },
  brand: { color: colors.textOnDark, fontSize: 16, fontWeight: '900', letterSpacing: 4 },
  brandAccent: { color: colors.primary },
  heroTitle: { ...typography.title, color: colors.textOnDark },
  heroSub: { fontSize: 12.5, color: colors.textOnDarkMuted, lineHeight: 17 },
  dots: { flexDirection: 'row', gap: 6, marginTop: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { backgroundColor: '#FFFFFF', width: 20 },
  dotDone: { backgroundColor: colors.primary },
  body: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl },
  question: { ...typography.title, color: colors.ink },
  hint: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  answerCol: { gap: spacing.sm, marginTop: spacing.sm },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 56,
  },
  rankRowActive: { borderColor: colors.primary, borderWidth: 2 },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rankBadgeText: { fontSize: 13, fontWeight: '900', color: colors.textMuted },
  rankBadgeTextActive: { color: '#FFFFFF' },
  rankName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rankMeta: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  stepperLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { fontSize: 15, fontWeight: '800', color: colors.ink, minWidth: 64, textAlign: 'center' },
  priorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.lg,
    minHeight: 60,
  },
  priorityLabel: { fontSize: 15, fontWeight: '800', color: colors.ink },
  prioritySub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerRight: { flexDirection: 'row', gap: spacing.md },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  footerLinkText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
});
