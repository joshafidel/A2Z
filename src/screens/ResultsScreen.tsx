import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { RouteCard } from '../components/RouteCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { WeatherCard } from '../components/WeatherCard';
import { useTrip } from '../context/TripContext';
import type { ResultsScreenProps } from '../navigation/types';
import { searchRoutes } from '../services/tripService';
import type { TripSearchResults } from '../services/tripService';
import { colors, spacing, typography } from '../theme';
import { PREFERENCE_LABELS } from '../types';
import { formatDate, formatTime } from '../utils/time';

export function ResultsScreen({ navigation, route }: ResultsScreenProps) {
  const { search } = route.params;
  const { setSearchResults } = useTrip();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [results, setResults] = useState<TripSearchResults>();

  const run = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const result = await searchRoutes(search);
    if (result.ok) {
      setResults(result.data);
      setSearchResults(search, result.data);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [search, setSearchResults]);

  useEffect(() => {
    run();
  }, [run]);

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

      <Text style={styles.count}>
        {results.routes.length} way{results.routes.length === 1 ? '' : 's'} to get there
      </Text>

      {results.routes.map((r) => (
        <RouteCard
          key={r.id}
          route={r}
          onPress={() => navigation.navigate('RouteDetail', { routeId: r.id })}
        />
      ))}
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
  count: { ...typography.caption, color: colors.textMuted },
});
