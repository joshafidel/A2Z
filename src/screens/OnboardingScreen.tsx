import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { DragRankList } from '../components/DragRankList';
import { airportsNear, findCityCoords } from '../data/airports';
import type { OnboardingScreenProps } from '../navigation/types';
import { guessHomeCity } from '../services/locationService';
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
import { RIDESHARE_APPS, setConnectedRideshareApps } from '../services/storageService';
import { colors, radii, spacing, typography } from '../theme';

type StepKey = 'home' | 'modes' | 'access' | 'rideshare' | 'security' | 'bag' | 'timing' | 'priority';

const STEPS: StepKey[] = ['home', 'modes', 'access', 'rideshare', 'security', 'bag', 'timing', 'priority'];

/** Airports within a metro-sized radius — 60 mi keeps PHL out of NYC. */
const AIRPORT_RADIUS_MILES = 60;

const PRIORITY_OPTIONS: Array<[TransportationPriority, string, string]> = [
  ['cheapest', 'Cheapest', 'Save the money'],
  ['fastest', 'Fastest', 'Save the time'],
  ['balanced', 'Balanced', 'Best mix of both'],
  ['comfort', 'Comfort', 'Least hassle, even if it costs more'],
];

/**
 * First-open welcome: one question at a time, every one skippable (or the
 * whole thing). Answers land in the traveler profile — saved in this
 * browser, editable any time in Settings — and the planner uses them so
 * you are never re-asked what you already answered.
 */
export function OnboardingScreen({ navigation }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<TravelerProfile>({ ...DEFAULT_PROFILE });
  const [homeCity, setHomeCity] = useState('');
  const [cityGuessed, setCityGuessed] = useState(false);
  const [locBusy, setLocBusy] = useState(true);
  const [homeCoords, setHomeCoords] = useState<{ lat: number; lng: number }>();
  const [ranking, setRanking] = useState<Array<{ id: string; title: string; subtitle?: string }>>([]);
  const [apps, setApps] = useState<string[]>([]);
  const [modes, setModes] = useState<AcceptedMode[]>([]);
  const [precheck, setPrecheck] = useState(false);
  const [clear, setClear] = useState(false);

  /** Airports near the typed/guessed city — pops up as soon as we know it. */
  const refreshAirports = (
    city: string,
    coordsOverride?: { lat: number; lng: number },
    savedOrder?: string[],
  ) => {
    const entry = findCityCoords(city);
    const coords = entry ? { lat: entry.lat, lng: entry.lng } : coordsOverride;
    if (!coords) {
      setRanking([]);
      return;
    }
    const near = airportsNear(coords, AIRPORT_RADIUS_MILES, 5).map((r) => r.airport);
    const items = near.map((a) => ({
      id: a.code,
      title: `${a.code} — ${a.name}`,
      subtitle: a.city,
    }));
    if (savedOrder && savedOrder.length > 0) {
      items.sort((x, y) => {
        const xi = savedOrder.indexOf(x.id);
        const yi = savedOrder.indexOf(y.id);
        return (xi === -1 ? 99 : xi) - (yi === -1 ? 99 : yi);
      });
    }
    setRanking(items);
  };

  // Start from whatever is saved (redo case), then GUESS the home city
  // from the current location — clearly labeled, always editable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getProfile();
      if (cancelled) return;
      setProfile(p);
      setHomeCity(p.homeCity ?? '');
      setPrecheck(p.hasTsaPrecheck);
      setClear(p.hasClear);
      setModes(p.acceptedModes ?? []);
      if (p.homeCity) refreshAirports(p.homeCity, undefined, p.airportRanking);
      const guess = await guessHomeCity();
      if (cancelled) return;
      setLocBusy(false);
      if (guess) {
        setHomeCoords({ lat: guess.lat, lng: guess.lng });
        if (!p.homeCity) {
          setHomeCity(guess.city);
          setCityGuessed(true);
          refreshAirports(guess.city, { lat: guess.lat, lng: guess.lng }, p.airportRanking);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /** Buffer row in the Settings style: −  [tappable value]  + */
  const stepperRow = (
    label: string,
    prefKey: 'domesticBufferMinutes' | 'internationalBufferMinutes' | 'trafficUncertaintyMinutes',
    delta: number,
    min: number,
    max: number,
  ) => {
    const value = profile[prefKey];
    const clamp = (v: number) => Math.min(max, Math.max(min, v));
    return (
      <View style={styles.stepperRow}>
        <Text style={styles.stepperLabel}>{label}</Text>
        <View style={styles.stepperControls}>
          <Pressable
            onPress={() => setProfile((p) => ({ ...p, [prefKey]: clamp(value - delta) }))}
            style={styles.stepperButton}
            accessibilityLabel={`Decrease ${label}`}
            accessibilityRole="button"
          >
            <Ionicons name="remove" size={18} color={colors.primary} />
          </Pressable>
          <TextInput
            style={styles.stepperInput}
            value={String(value)}
            keyboardType="numeric"
            accessibilityLabel={`${label} in minutes — tap to type a custom number`}
            onChangeText={(v) => {
              const n = parseInt(v.replace(/\D/g, ''), 10);
              setProfile((p) => ({ ...p, [prefKey]: Number.isFinite(n) ? n : min }));
            }}
            onEndEditing={() => setProfile((p) => ({ ...p, [prefKey]: clamp(p[prefKey]) }))}
            onBlur={() => setProfile((p) => ({ ...p, [prefKey]: clamp(p[prefKey]) }))}
          />
          <Text style={styles.stepperUnit}>min</Text>
          <Pressable
            onPress={() => setProfile((p) => ({ ...p, [prefKey]: clamp(value + delta) }))}
            style={styles.stepperButton}
            accessibilityLabel={`Increase ${label}`}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={18} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    );
  };

  const checkRow = (
    label: string,
    checked: boolean,
    onToggle: () => void,
    subtitle?: string,
  ) => (
    <Pressable
      key={label}
      onPress={onToggle}
      style={styles.checkRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={styles.flex1}>
        <Text style={styles.checkLabel}>{label}</Text>
        {subtitle ? <Text style={styles.checkSub}>{subtitle}</Text> : null}
      </View>
      <Ionicons
        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
        size={26}
        color={checked ? colors.success : colors.textMuted}
      />
    </Pressable>
  );

  return (
    <View style={styles.screen}>
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
        style={styles.flexBg}
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
                refreshAirports(v, homeCoords, profile.airportRanking);
              }}
              placeholder={locBusy ? 'Finding your city…' : 'New York'}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Your home city"
            />
            {ranking.length > 0 && (
              <>
                <Text style={styles.fieldLabel}>
                  Your airports, in preference order — drag the handle to reorder
                </Text>
                <DragRankList
                  items={ranking}
                  onReorder={(ids) =>
                    setRanking((prev) => ids.map((id) => prev.find((i) => i.id === id)!))
                  }
                />
              </>
            )}
            <AppButton
              label="Next"
              icon="arrow-forward"
              onPress={() =>
                next({
                  homeCity: homeCity.trim() === '' ? undefined : homeCity.trim(),
                  airportRanking: ranking.length > 0 ? ranking.map((r) => r.id) : undefined,
                  homeAirportCode: ranking[0]?.id ?? profile.homeAirportCode,
                })
              }
            />
          </>
        )}

        {key === 'modes' && (
          <>
            <Text style={styles.question}>Which ways of traveling are OK with you?</Text>
            <Text style={styles.hint}>
              The planner will only suggest modes you accept — and it won't ask again on every trip.
            </Text>
            {(Object.keys(ACCEPTED_MODE_LABELS) as AcceptedMode[]).map((m) =>
              checkRow(ACCEPTED_MODE_LABELS[m], modes.includes(m), () =>
                setModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m])),
              ),
            )}
            <AppButton
              label="Next"
              icon="arrow-forward"
              onPress={() => next({ acceptedModes: modes.length > 0 ? modes : undefined })}
            />
          </>
        )}

        {key === 'access' && (
          <>
            <Text style={styles.question}>How do you prefer to get to the airport?</Text>
            <Text style={styles.hint}>Seeds the airport-leg comparison on every trip.</Text>
            <View style={styles.answerCol}>
              {(Object.keys(AIRPORT_ACCESS_LABELS) as AirportAccessMode[]).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => next({ airportAccessMode: m })}
                  style={styles.optionRow}
                  accessibilityRole="button"
                >
                  <Text style={styles.optionLabel}>{AIRPORT_ACCESS_LABELS[m]}</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                </Pressable>
              ))}
            </View>
          </>
        )}

        {key === 'rideshare' && (
          <>
            <Text style={styles.question}>Which ride apps do you use?</Text>
            <Text style={styles.hint}>
              Ride suggestions only come from apps you actually have. Pick any, or none.
            </Text>
            {RIDESHARE_APPS.map((app) =>
              checkRow(app, apps.includes(app), () =>
                setApps((prev) => (prev.includes(app) ? prev.filter((a) => a !== app) : [...prev, app])),
              ),
            )}
            <AppButton label="Next" icon="arrow-forward" onPress={() => next()} />
          </>
        )}

        {key === 'security' && (
          <>
            <Text style={styles.question}>Airport security programs</Text>
            <Text style={styles.hint}>
              PreCheck saves ~15 minutes and CLEAR ~5 more — the leave-time math uses both.
            </Text>
            {checkRow('TSA PreCheck', precheck, () => setPrecheck((v) => !v))}
            {checkRow('CLEAR', clear, () => setClear((v) => !v))}
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
                <Pressable
                  key={h}
                  onPress={() =>
                    next({ bagHabit: h, usuallyChecksBag: h === 'usually' || h === 'always' })
                  }
                  style={styles.optionRow}
                  accessibilityRole="button"
                >
                  <Text style={styles.optionLabel}>{BAG_HABIT_LABELS[h]}</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                </Pressable>
              ))}
            </View>
          </>
        )}

        {key === 'timing' && (
          <>
            <Text style={styles.question}>How much airport buffer do you like?</Text>
            <Text style={styles.hint}>
              Use − and +, or tap a number to type your own.
            </Text>
            {stepperRow('Domestic airport buffer', 'domesticBufferMinutes', 15, 75, 240)}
            {stepperRow('International airport buffer', 'internationalBufferMinutes', 15, 120, 300)}
            {stepperRow('Traffic uncertainty', 'trafficUncertaintyMinutes', 5, 0, 60)}
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
                  style={styles.optionRow}
                  accessibilityRole="button"
                >
                  <View style={styles.flex1}>
                    <Text style={styles.optionLabel}>{label}</Text>
                    <Text style={styles.optionSub}>{sub}</Text>
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
  screen: { flex: 1, backgroundColor: colors.background },
  flexBg: { flex: 1 },
  flex1: { flex: 1 },
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
  answerCol: { gap: spacing.sm, marginTop: spacing.sm },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  checkLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  checkSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.lg,
    minHeight: 58,
  },
  optionLabel: { fontSize: 15, fontWeight: '800', color: colors.ink },
  optionSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
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
  stepperInput: {
    minWidth: 52,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 7,
    paddingHorizontal: 6,
    backgroundColor: colors.surface,
  },
  stepperUnit: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
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
