import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RouteCard } from '../components/RouteCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { WeatherCard } from '../components/WeatherCard';
import { useTrip } from '../context/TripContext';
import type { ResultsScreenProps } from '../navigation/types';
import { searchRoutes } from '../services/tripService';
import type { TripSearchResults } from '../services/tripService';
import { colors, radii, shadows, spacing, typography } from '../theme';
import { PREFERENCE_LABELS, type RouteOption } from '../types';
import { formatDate, formatDuration, formatMoney, formatTime } from '../utils/time';

// ---------------------------------------------------------------------------
// Mode groups — collapsible dropdowns so results are easy to scan.
// ---------------------------------------------------------------------------

type GroupKey = 'flights' | 'trains' | 'buses' | 'cars' | 'transit';

const GROUPS: Array<{
  key: GroupKey;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  match: (r: RouteOption) => boolean;
}> = [
  { key: 'flights', title: 'Flights', icon: 'airplane', match: (r) => r.primaryMode === 'flight' },
  { key: 'trains', title: 'Trains', icon: 'train', match: (r) => r.primaryMode === 'train' },
  { key: 'buses', title: 'Buses', icon: 'bus', match: (r) => r.primaryMode === 'bus' },
  {
    key: 'cars',
    title: 'Cars & rideshare',
    icon: 'car',
    match: (r) => r.primaryMode === 'drive' || r.primaryMode === 'rideshare',
  },
  {
    key: 'transit',
    title: 'Public transit',
    icon: 'subway',
    match: (r) =>
      r.primaryMode !== 'flight' &&
      r.primaryMode !== 'train' &&
      r.primaryMode !== 'bus' &&
      r.primaryMode !== 'drive' &&
      r.primaryMode !== 'rideshare',
  },
];

export function ResultsScreen({ navigation, route }: ResultsScreenProps) {
  const { search } = route.params;
  const { setSearchResults } = useTrip();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [results, setResults] = useState<TripSearchResults>();
  const [expanded, setExpanded] = useState<Set<GroupKey>>(new Set());

  const run = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const result = await searchRoutes(search);
    if (result.ok) {
      setResults(result.data);
      setSearchResults(search, result.data);
      // Expand the group holding the best-overall route by default.
      const best = result.data.routes.find((r) => r.badges.includes('best-overall'));
      const bestGroup = best ? GROUPS.find((g) => g.match(best))?.key : undefined;
      setExpanded(new Set(bestGroup ? [bestGroup] : []));
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [search, setSearchResults]);

  useEffect(() => {
    run();
  }, [run]);

  const grouped = useMemo(() => {
    if (!results) return [];
    return GROUPS.map((g) => ({ ...g, routes: results.routes.filter(g.match) })).filter(
      (g) => g.routes.length > 0,
    );
  }, [results]);

  if (loading) {
    return <LoadingState message="Comparing every way to get there…" />;
  }
  if (error) {
    return <ErrorState message={error} onRetry={run} />;
  }
  if (!results || results.routes.length === 0) {
    return (
      <EmptyState
        title="No routes found"
        message="We couldn't plan this trip yet. Try one of the sample corridors like NYC → Boston."
        actionLabel="Back to search"
        onAction={() => navigation.goBack()}
      />
    );
  }

  const best = results.routes.find((r) => r.badges.includes('best-overall'));

  const toggle = (key: GroupKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openRoute = (r: RouteOption) => {
    // Line-haul modes go through the step-by-step builder (choose how to
    // reach the station/airport); door-to-door modes go straight to detail.
    if (r.builder) navigation.navigate('TripBuilder', { routeId: r.id });
    else navigation.navigate('RouteDetail', { routeId: r.id });
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Trip header */}
      <View style={styles.header}>
        <Text style={styles.tripLine} numberOfLines={1}>
          {search.origin.label ?? search.origin.address} → {search.destination.label}
        </Text>
        <Text style={styles.tripMeta}>
          {formatDate(search.departureTime)} · leave ~{formatTime(search.departureTime)} ·{' '}
          {search.travelers} traveler{search.travelers === 1 ? '' : 's'} · {search.bags} bag
          {search.bags === 1 ? '' : 's'} · optimizing for {PREFERENCE_LABELS[search.preference].toLowerCase()}
        </Text>
      </View>

      <WeatherCard origin={results.originWeather} destination={results.destinationWeather} />

      {/* Recommendation summary */}
      {best?.score?.explanation ? (
        <View style={styles.recommendCard}>
          <Text style={styles.recommendTitle}>Our recommendation</Text>
          <Text style={styles.recommendText}>{best.score.explanation}</Text>
        </View>
      ) : null}

      {/* Grouped, collapsible results */}
      {grouped.map((group) => {
        const isOpen = expanded.has(group.key);
        const cheapestIn = group.routes
          .map((r) => r.totalPriceUsd)
          .filter((p): p is number => p !== undefined);
        const fastestIn = Math.min(...group.routes.map((r) => r.totalDurationMinutes));
        const hasBest = group.routes.some((r) => r.badges.includes('best-overall'));

        return (
          <View key={group.key} style={styles.group}>
            <Pressable
              onPress={() => toggle(group.key)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              style={({ pressed }) => [styles.groupHeader, pressed && styles.pressed]}
            >
              <View style={styles.groupIcon}>
                <Ionicons name={group.icon} size={18} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <View style={styles.groupTitleRow}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  {hasBest && (
                    <View style={styles.bestTag}>
                      <Ionicons name="star" size={10} color="#FFFFFF" />
                      <Text style={styles.bestTagText}>Top pick</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.groupMeta}>
                  {group.routes.length} option{group.routes.length === 1 ? '' : 's'}
                  {cheapestIn.length > 0 ? ` · from ${formatMoney(Math.min(...cheapestIn))}` : ''} ·
                  fastest {formatDuration(fastestIn)}
                </Text>
              </View>
              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>

            {isOpen && (
              <View style={styles.groupBody}>
                {group.routes.map((r) => (
                  <RouteCard key={r.id} route={r} onPress={() => openRoute(r)} />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  header: { gap: 4 },
  tripLine: { ...typography.title, color: colors.ink },
  tripMeta: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  recommendCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: spacing.lg,
    gap: 4,
  },
  recommendTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  recommendText: { fontSize: 14, color: colors.text, lineHeight: 20, fontWeight: '500' },
  group: { gap: spacing.sm },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    minHeight: 64,
    ...shadows.card,
  },
  pressed: { opacity: 0.85 },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupTitle: { ...typography.heading, color: colors.ink },
  bestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.badgeBest,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  bestTagText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  groupMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  groupBody: { gap: spacing.md },
});
