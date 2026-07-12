import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { Chip } from '../components/Chip';
import type { OnboardingScreenProps } from '../navigation/types';
import {
  DEFAULT_PROFILE,
  getProfile,
  saveProfile,
  type TransportationPriority,
  type TravelerProfile,
} from '../services/preferencesService';
import { RIDESHARE_APPS, setConnectedRideshareApps } from '../services/storageService';
import { colors, radii, spacing, typography } from '../theme';

type StepKey =
  | 'home'
  | 'rideshare'
  | 'precheck'
  | 'clear'
  | 'bag'
  | 'timing'
  | 'priority';

const STEPS: StepKey[] = ['home', 'rideshare', 'precheck', 'clear', 'bag', 'timing', 'priority'];

/**
 * First-open welcome: one question at a time. Every answer lands in the
 * traveler profile (saved in this browser) and shapes later plans — the
 * departure calculator, packing, transport scoring, and trip prefills.
 * Fully skippable, and re-runnable from Settings.
 */
export function OnboardingScreen({ navigation }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<TravelerProfile>({ ...DEFAULT_PROFILE });
  const [homeCity, setHomeCity] = useState('');
  const [homeAirport, setHomeAirport] = useState('');
  const [apps, setApps] = useState<string[]>([]);
  const [airportError, setAirportError] = useState<string>();

  // Start from whatever is already saved (redo case).
  React.useEffect(() => {
    getProfile().then((p) => {
      setProfile(p);
      setHomeCity(p.homeCity ?? '');
      setHomeAirport(p.homeAirportCode ?? '');
    });
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

  const yesNo = (patchKey: 'hasTsaPrecheck' | 'hasClear' | 'usuallyChecksBag') => (
    <View style={styles.answerCol}>
      <AppButton label="Yes" icon="checkmark" onPress={() => next({ [patchKey]: true })} />
      <AppButton label="No" variant="secondary" onPress={() => next({ [patchKey]: false })} />
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
          Question {step + 1} of {STEPS.length} · answers are saved only in this browser and shape
          every plan A2Z builds for you
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
              A2Z will start new trips from here, so you type less every time.
            </Text>
            <Text style={styles.fieldLabel}>Your city</Text>
            <TextInput
              style={styles.input}
              value={homeCity}
              onChangeText={setHomeCity}
              placeholder="New York"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Your home city"
            />
            <Text style={styles.fieldLabel}>Preferred departing airport (3-letter code, optional)</Text>
            <TextInput
              style={styles.input}
              value={homeAirport}
              onChangeText={(v) => {
                setHomeAirport(v);
                setAirportError(undefined);
              }}
              placeholder="JFK"
              autoCapitalize="characters"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Preferred departing airport code"
            />
            {airportError ? <Text style={styles.error}>{airportError}</Text> : null}
            <AppButton
              label="Next"
              icon="arrow-forward"
              onPress={() => {
                const code = homeAirport.trim();
                if (code !== '' && !/^[A-Za-z]{3}$/.test(code)) {
                  setAirportError('Airport codes are 3 letters, like JFK or BOS.');
                  return;
                }
                next({
                  homeCity: homeCity.trim() === '' ? undefined : homeCity.trim(),
                  homeAirportCode: code === '' ? undefined : code.toUpperCase(),
                });
              }}
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

        {key === 'precheck' && (
          <>
            <Text style={styles.question}>Do you have TSA PreCheck?</Text>
            <Text style={styles.hint}>Shorter security lines shave 15 minutes off your airport buffer.</Text>
            {yesNo('hasTsaPrecheck')}
          </>
        )}

        {key === 'clear' && (
          <>
            <Text style={styles.question}>Do you have CLEAR?</Text>
            <Text style={styles.hint}>Skipping the ID line is worth about 5 more minutes.</Text>
            {yesNo('hasClear')}
          </>
        )}

        {key === 'bag' && (
          <>
            <Text style={styles.question}>Do you usually check a bag?</Text>
            <Text style={styles.hint}>
              Bag drop adds 20 minutes and a cutoff reminder to every flight plan.
            </Text>
            {yesNo('usuallyChecksBag')}
          </>
        )}

        {key === 'timing' && (
          <>
            <Text style={styles.question}>How early do you like to be at the airport?</Text>
            <Text style={styles.hint}>This sets your default buffer — you can fine-tune it in Settings.</Text>
            <View style={styles.answerCol}>
              <AppButton
                label="Relaxed — lounge time (2h30 domestic)"
                variant="secondary"
                onPress={() => next({ domesticBufferMinutes: 150, internationalBufferMinutes: 210 })}
              />
              <AppButton
                label="Standard (2h domestic)"
                onPress={() => next({ domesticBufferMinutes: 120, internationalBufferMinutes: 180 })}
              />
              <AppButton
                label="Tight — I run it close (1h30 domestic)"
                variant="secondary"
                onPress={() => next({ domesticBufferMinutes: 90, internationalBufferMinutes: 150 })}
              />
            </View>
          </>
        )}

        {key === 'priority' && (
          <>
            <Text style={styles.question}>When options differ, what wins?</Text>
            <Text style={styles.hint}>Used to rank transportation comparisons and route suggestions.</Text>
            <View style={styles.answerCol}>
              {(
                [
                  ['cheapest', 'Cheapest — save the money'],
                  ['balanced', 'Balanced — best mix'],
                  ['fastest', 'Fastest — save the time'],
                ] as Array<[TransportationPriority, string]>
              ).map(([p, label]) => (
                <AppButton
                  key={p}
                  label={label}
                  variant={p === 'balanced' ? 'primary' : 'secondary'}
                  onPress={() => next({ transportationPriority: p })}
                />
              ))}
            </View>
          </>
        )}

        <View style={styles.footerRow}>
          {step > 0 && (
            <Pressable onPress={() => setStep(step - 1)} style={styles.footerLink} accessibilityRole="button">
              <Ionicons name="arrow-back" size={14} color={colors.textMuted} />
              <Text style={styles.footerLinkText}>Back</Text>
            </Pressable>
          )}
          <Pressable onPress={() => finish(profile)} style={styles.footerLink} accessibilityRole="button">
            <Text style={styles.footerLinkText}>Skip for now</Text>
          </Pressable>
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
  error: { fontSize: 12.5, color: colors.danger, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  answerCol: { gap: spacing.sm, marginTop: spacing.sm },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
  },
  footerLinkText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
});
