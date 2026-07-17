import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { DragRankList } from '../components/DragRankList';
import { SectionHeader } from '../components/SectionHeader';
import { useTrip } from '../context/TripContext';
import { airportsNear, findCityCoords } from '../data/airports';
import type { PreferencesScreenProps } from '../navigation/types';
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
import * as storage from '../services/storageService';
import { RIDESHARE_APPS } from '../services/storageService';
import { colors, radii, spacing, typography } from '../theme';
import { PREFERENCE_LABELS, type TravelPreference } from '../types';

const PRIORITY_LABELS: Record<TransportationPriority, string> = {
  cheapest: 'Cheapest',
  balanced: 'Balanced',
  fastest: 'Fastest',
  comfort: 'Comfort',
};

/**
 * Travel preferences — every welcome-question answer, editable any time.
 * Changes save instantly to this browser and flow into the planner, the
 * departure calculator, packing, and the transport comparison.
 */
export function PreferencesScreen({ navigation }: PreferencesScreenProps) {
  const insets = useSafeAreaInsets();
  const { defaultPreference, setDefaultPreference } = useTrip();
  const [profile, setProfile] = useState<TravelerProfile>(DEFAULT_PROFILE);
  const [apps, setApps] = useState<string[]>([]);
  const [rankItems, setRankItems] = useState<Array<{ id: string; title: string; subtitle?: string }>>([]);

  const refreshAirports = (city: string, order?: string[]) => {
    const entry = findCityCoords(city);
    if (!entry) {
      setRankItems([]);
      return;
    }
    const items = airportsNear({ lat: entry.lat, lng: entry.lng }, 60, 5).map((r) => ({
      id: r.airport.code,
      title: `${r.airport.code} — ${r.airport.name}`,
      subtitle: r.airport.city,
    }));
    if (order && order.length > 0) {
      items.sort((x, y) => {
        const xi = order.indexOf(x.id);
        const yi = order.indexOf(y.id);
        return (xi === -1 ? 99 : xi) - (yi === -1 ? 99 : yi);
      });
    }
    setRankItems(items);
  };

  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p);
      if (p.homeCity) refreshAirports(p.homeCity, p.airportRanking);
    });
    storage.getConnectedRideshareApps().then(setApps);
  }, []);

  const patch = (patchValues: Partial<TravelerProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patchValues };
      saveProfile(next);
      return next;
    });
  };

  const toggleApp = (app: string) => {
    setApps((prev) => {
      const next = prev.includes(app) ? prev.filter((a) => a !== app) : [...prev, app];
      storage.setConnectedRideshareApps(next);
      return next;
    });
  };

  const checkRow = (label: string, checked: boolean, onToggle: () => void, hint?: string) => (
    <Pressable
      key={label}
      onPress={onToggle}
      style={styles.checkRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={styles.flex1}>
        <Text style={styles.checkLabel}>{label}</Text>
        {hint ? <Text style={styles.checkHint}>{hint}</Text> : null}
      </View>
      <Ionicons
        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
        size={24}
        color={checked ? colors.success : colors.textMuted}
      />
    </Pressable>
  );

  const stepperRow = (
    label: string,
    key: 'domesticBufferMinutes' | 'internationalBufferMinutes' | 'trafficUncertaintyMinutes',
    step: number,
    min: number,
    max: number,
  ) => (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => patch({ [key]: Math.max(min, profile[key] - step) } as Partial<TravelerProfile>)}
          style={styles.stepperButton}
          accessibilityLabel={`Decrease ${label}`}
          accessibilityRole="button"
        >
          <Ionicons name="remove" size={16} color={colors.primary} />
        </Pressable>
        <TextInput
          style={styles.stepperInput}
          value={String(profile[key])}
          keyboardType="numeric"
          accessibilityLabel={`${label} in minutes — tap to type a custom number`}
          onChangeText={(v) => {
            const n = parseInt(v.replace(/\D/g, ''), 10);
            if (Number.isFinite(n)) patch({ [key]: n } as Partial<TravelerProfile>);
          }}
          onBlur={() => patch({ [key]: Math.min(max, Math.max(min, profile[key])) } as Partial<TravelerProfile>)}
        />
        <Text style={styles.stepperUnit}>min</Text>
        <Pressable
          onPress={() => patch({ [key]: Math.min(max, profile[key] + step) } as Partial<TravelerProfile>)}
          style={styles.stepperButton}
          accessibilityLabel={`Increase ${label}`}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={16} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back} accessibilityLabel="Back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.screenTitle}>Travel preferences</Text>
      </View>
      <Text style={styles.subtitle}>
        Everything the welcome questions asked, editable any time. Changes save instantly and shape
        every plan.
      </Text>

      <Card>
        <SectionHeader title="Home & airports" subtitle="New trips start here" />
        <Text style={styles.fieldLabel}>Home city</Text>
        <TextInput
          style={styles.input}
          value={profile.homeCity ?? ''}
          onChangeText={(v) => {
            patch({ homeCity: v.trim() === '' ? undefined : v });
            refreshAirports(v, profile.airportRanking);
          }}
          placeholder="New York"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Home city"
        />
        {rankItems.length > 0 ? (
          <>
            <Text style={styles.fieldLabel}>
              Preferred airports — drag the handle, or use the arrows
            </Text>
            <DragRankList
              items={rankItems}
              onReorder={(ids) => {
                setRankItems((prev) => ids.map((id) => prev.find((i) => i.id === id)!));
                patch({ airportRanking: ids, homeAirportCode: ids[0] });
              }}
            />
          </>
        ) : (
          <Text style={styles.emptyHint}>
            Type a city A2Z knows (New York, Boston, Miami…) to rank its airports.
          </Text>
        )}
      </Card>

      <Card>
        <SectionHeader title="How you travel" />
        <Text style={styles.fieldLabel}>Acceptable travel modes — the planner preselects these</Text>
        {(Object.keys(ACCEPTED_MODE_LABELS) as AcceptedMode[]).map((m) =>
          checkRow(ACCEPTED_MODE_LABELS[m], (profile.acceptedModes ?? []).includes(m), () => {
            const current = profile.acceptedModes ?? [];
            const next = current.includes(m) ? current.filter((x) => x !== m) : [...current, m];
            patch({ acceptedModes: next.length > 0 ? next : undefined });
          }),
        )}
        <Text style={styles.fieldLabel}>Getting to the airport</Text>
        <View style={styles.chipWrap}>
          {(Object.keys(AIRPORT_ACCESS_LABELS) as AirportAccessMode[]).map((m) => (
            <Chip
              key={m}
              label={AIRPORT_ACCESS_LABELS[m]}
              selected={profile.airportAccessMode === m}
              onPress={() => patch({ airportAccessMode: m })}
            />
          ))}
        </View>
        <Text style={styles.fieldLabel}>When options differ, what wins?</Text>
        <View style={styles.chipWrap}>
          {(Object.keys(PRIORITY_LABELS) as TransportationPriority[]).map((p) => (
            <Chip
              key={p}
              label={PRIORITY_LABELS[p]}
              selected={profile.transportationPriority === p}
              onPress={() => patch({ transportationPriority: p })}
            />
          ))}
        </View>
        <Text style={styles.fieldLabel}>Planner optimization (route ranking)</Text>
        <View style={styles.chipWrap}>
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
        <SectionHeader title="Airport & security" />
        {checkRow('TSA PreCheck', profile.hasTsaPrecheck, () => patch({ hasTsaPrecheck: !profile.hasTsaPrecheck }), 'Saves ~15 min in the leave-time math')}
        {checkRow('CLEAR', profile.hasClear, () => patch({ hasClear: !profile.hasClear }), 'Saves ~5 more minutes')}
        <Text style={styles.fieldLabel}>Bag habit</Text>
        <View style={styles.chipWrap}>
          {(Object.keys(BAG_HABIT_LABELS) as BagHabit[]).map((h) => (
            <Chip
              key={h}
              label={BAG_HABIT_LABELS[h].split(' — ')[0]}
              selected={(profile.bagHabit ?? (profile.usuallyChecksBag ? 'usually' : 'sometimes')) === h}
              onPress={() => patch({ bagHabit: h, usuallyChecksBag: h === 'usually' || h === 'always' })}
            />
          ))}
        </View>
        {stepperRow('Domestic airport buffer', 'domesticBufferMinutes', 15, 75, 240)}
        {stepperRow('International airport buffer', 'internationalBufferMinutes', 15, 120, 300)}
        {stepperRow('Traffic uncertainty', 'trafficUncertaintyMinutes', 5, 0, 60)}
      </Card>

      <Card>
        <SectionHeader
          title="Ride apps"
          subtitle="Ride suggestions only come from apps you actually have"
        />
        {RIDESHARE_APPS.map((app) => checkRow(app, apps.includes(app), () => toggleApp(app)))}
      </Card>

      <Card>
        <SectionHeader title="Units" />
        <Text style={styles.fieldLabel}>Temperature</Text>
        <View style={styles.chipWrap}>
          {(['fahrenheit', 'celsius'] as const).map((u) => (
            <Chip
              key={u}
              label={u === 'fahrenheit' ? '°F' : '°C'}
              selected={profile.temperatureUnit === u}
              onPress={() => patch({ temperatureUnit: u })}
            />
          ))}
        </View>
      </Card>

      <AppButton
        label="Redo the welcome questions instead"
        icon="sparkles-outline"
        variant="ghost"
        onPress={() => navigation.getParent()?.navigate('PlanTab', { screen: 'Onboarding' })}
      />
      <Text style={styles.footNote}>Saved instantly on this device — no save button needed.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { ...typography.hero, color: colors.ink },
  subtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginTop: -spacing.sm },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  emptyHint: { fontSize: 12.5, color: colors.textMuted, lineHeight: 17, marginTop: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 46,
  },
  checkLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  checkHint: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 8,
    minHeight: 48,
  },
  stepperLabel: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperInput: {
    minWidth: 48,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 5,
    paddingHorizontal: 4,
    backgroundColor: colors.surface,
  },
  stepperUnit: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  footNote: { fontSize: 11.5, color: colors.textMuted, textAlign: 'center', lineHeight: 16 },
});
