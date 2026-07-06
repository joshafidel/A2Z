import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { ModeIcon } from '../components/ModeIcon';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { useTrip } from '../context/TripContext';
import type { TripBuilderScreenProps } from '../navigation/types';
import type { AccessOption } from '../services/accessService';
import { explainAccessChoice, getAccessOptions } from '../services/accessService';
import { rebuildRouteWithAccess } from '../services/tripService';
import type { CorridorKey } from '../data/cities';
import { colors, radii, spacing, typography } from '../theme';
import { formatDuration, formatMoney, formatTime } from '../utils/time';

/**
 * Step-by-step trip builder: the user has picked the MAIN travel method
 * (flight/train/bus); here they choose how to reach the airport/station
 * (first mile) and how to finish the trip (last mile), with live price
 * comparisons across transit, Uber, Uber Shuttle, Lyft, Empower, and taxi.
 */
export function TripBuilderScreen({ navigation, route: navRoute }: TripBuilderScreenProps) {
  const { routeId } = navRoute.params;
  const { search, results, replaceRoute } = useTrip();

  const route = useMemo(() => results?.routes.find((r) => r.id === routeId), [results, routeId]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [firstOptions, setFirstOptions] = useState<AccessOption[]>([]);
  const [lastOptions, setLastOptions] = useState<AccessOption[]>([]);
  const [firstId, setFirstId] = useState<string>();
  const [lastId, setLastId] = useState<string>();
  const [building, setBuilding] = useState(false);

  const load = useCallback(async () => {
    if (!route?.builder || !search) return;
    setLoading(true);
    setError(undefined);
    const corridor = route.builder.corridor as CorridorKey;
    const [first, last] = await Promise.all([
      getAccessOptions(corridor, route.builder.accessFacet, search, results?.originWeather),
      getAccessOptions(corridor, route.builder.egressFacet, search, results?.destinationWeather),
    ]);
    if (first.ok) {
      setFirstOptions(first.data);
      setFirstId(first.data.find((o) => o.badges.includes('recommended'))?.id ?? first.data[0]?.id);
    }
    if (last.ok) {
      setLastOptions(last.data);
      setLastId(last.data.find((o) => o.badges.includes('recommended'))?.id ?? last.data[0]?.id);
    }
    if (!first.ok && !last.ok) {
      setError('Could not load travel options for this route.');
    }
    setLoading(false);
  }, [route, search, results]);

  useEffect(() => {
    load();
  }, [load]);

  if (!route || !search) {
    return (
      <EmptyState
        title="Route not found"
        message="Run a new search to rebuild your options."
        actionLabel="New search"
        onAction={() => navigation.popToTop()}
      />
    );
  }

  // Routes without configurable access (drive, door-to-door rideshare,
  // pure transit) skip the builder entirely.
  if (!route.builder) {
    navigation.replace('RouteDetail', { routeId });
    return null;
  }

  if (loading) return <LoadingState message="Pricing every way to connect your trip…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const mainSegment = route.segments.find((s) => s.mode === route.primaryMode);
  const stationName = mainSegment?.from ?? 'the station';
  const destLabel = search.destination.label ?? 'your destination';

  const selectedFirst = firstOptions.find((o) => o.id === firstId);
  const selectedLast = lastOptions.find((o) => o.id === lastId);
  const extraCost = (selectedFirst?.costUsd ?? 0) + (selectedLast?.costUsd ?? 0);
  const haulCost = mainSegment?.costUsd;

  const confirm = async () => {
    setBuilding(true);
    const rebuilt = await rebuildRouteWithAccess(search, route, selectedFirst, selectedLast);
    setBuilding(false);
    if (rebuilt.ok) {
      replaceRoute(rebuilt.data);
      navigation.replace('RouteDetail', { routeId: rebuilt.data.id });
    } else {
      setError(rebuilt.error);
    }
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Step 1 — locked-in main method */}
        <Card style={styles.mainCard}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>STEP 1 · MAIN TRAVEL METHOD</Text>
          </View>
          <View style={styles.mainRow}>
            <ModeIcon mode={route.primaryMode} size={20} />
            <View style={styles.flex}>
              <Text style={styles.mainTitle}>{route.title}</Text>
              {mainSegment && (
                <Text style={styles.mainMeta}>
                  {formatTime(mainSegment.departureTime)} from {mainSegment.from} ·{' '}
                  {formatDuration(mainSegment.durationMinutes)} · {formatMoney(mainSegment.costUsd)}
                </Text>
              )}
            </View>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
          </View>
        </Card>

        {/* Step 2 — first mile */}
        <AccessSection
          step={2}
          title={`Getting to ${stationName}`}
          explanation={explainAccessChoice(firstOptions, results?.originWeather, search.bags)}
          options={firstOptions}
          selectedId={firstId}
          onSelect={setFirstId}
        />

        {/* Step 3 — last mile */}
        <AccessSection
          step={3}
          title={`Getting to ${destLabel}`}
          explanation={explainAccessChoice(lastOptions, results?.destinationWeather, search.bags)}
          options={lastOptions}
          selectedId={lastId}
          onSelect={setLastId}
        />
      </ScrollView>

      {/* Sticky summary + confirm */}
      <View style={styles.footer}>
        <View style={styles.footerSummary}>
          <Text style={styles.footerLabel}>
            {selectedFirst?.title ?? '—'} → {route.title} → {selectedLast?.title ?? '—'}
          </Text>
          <Text style={styles.footerPrice}>
            {haulCost !== undefined ? formatMoney(haulCost + extraCost) : `+${formatMoney(extraCost)}`}
          </Text>
        </View>
        <AppButton
          label="Build my door-to-door plan"
          icon="construct"
          onPress={confirm}
          loading={building}
          disabled={!selectedFirst && !selectedLast}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

function AccessSection({
  step,
  title,
  explanation,
  options,
  selectedId,
  onSelect,
}: {
  step: number;
  title: string;
  explanation: string;
  options: AccessOption[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>
          STEP {step} · {title.toUpperCase()}
        </Text>
      </View>
      {explanation ? <Text style={styles.explanation}>{explanation}</Text> : null}
      <View style={styles.optionStack}>
        {options.map((o) => {
          const selected = o.id === selectedId;
          return (
            <Pressable
              key={o.id}
              onPress={() => onSelect(o.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.pressed,
              ]}
            >
              <ModeIcon mode={o.modes[0] ?? 'walk'} size={15} />
              <View style={styles.flex}>
                <View style={styles.optionTitleRow}>
                  <Text style={styles.optionTitle}>{o.title}</Text>
                  {o.badges.map((b) => (
                    <View key={b} style={[styles.tag, TAG_STYLES[b]]}>
                      <Text style={styles.tagText}>{TAG_LABELS[b]}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.optionDesc} numberOfLines={2}>
                  {o.description}
                </Text>
              </View>
              <View style={styles.optionRight}>
                <Text style={styles.optionPrice}>{o.costLabel}</Text>
                <Text style={styles.optionTime}>{formatDuration(o.durationMinutes)}</Text>
                <Ionicons
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={selected ? colors.primary : colors.textMuted}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const TAG_LABELS: Record<'recommended' | 'cheapest' | 'fastest', string> = {
  recommended: 'Recommended',
  cheapest: 'Cheapest',
  fastest: 'Fastest',
};

const TAG_STYLES = StyleSheet.create({
  recommended: { backgroundColor: colors.primary },
  cheapest: { backgroundColor: colors.badgeCheap },
  fastest: { backgroundColor: colors.badgeFast },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: 170 },
  mainCard: { gap: spacing.md },
  stepBadge: { alignSelf: 'flex-start' },
  stepBadgeText: { ...typography.micro, color: colors.primary, letterSpacing: 0.8 },
  mainRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mainTitle: { ...typography.heading, color: colors.ink },
  mainMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  section: { gap: spacing.sm },
  explanation: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: spacing.md,
    fontWeight: '500',
  },
  optionStack: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.85 },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  optionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  optionDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  optionRight: { alignItems: 'flex-end', gap: 2 },
  optionPrice: { fontSize: 14, fontWeight: '800', color: colors.ink },
  optionTime: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  tag: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  footerPrice: { ...typography.heading, color: colors.ink },
});
