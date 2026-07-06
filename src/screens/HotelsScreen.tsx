import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { useTrip } from '../context/TripContext';
import { detectCityKey, CITY_NAMES } from '../data/cities';
import type { HotelsScreenProps } from '../navigation/types';
import { getHotelRecommendations } from '../services/hotelService';
import { colors, radii, spacing, typography } from '../theme';
import { TRIP_PURPOSE_LABELS, type HotelOption, type TripPurpose } from '../types';

/**
 * Hotel recommendations shown after a trip is saved — positioned around
 * where the traveler actually arrives (downtown station vs airport).
 */
export function HotelsScreen({ navigation }: HotelsScreenProps) {
  const { search, activeTrip } = useTrip();

  const destinationAddress =
    search?.destination.address ?? activeTrip?.search.destination.address ?? '';
  const arrivingByAir =
    (activeTrip?.route.primaryMode ?? 'train') === 'flight' ||
    /airport|jfk|ewr|logan/i.test(destinationAddress);

  const checkinIso =
    search?.departureTime ?? activeTrip?.search.departureTime ?? new Date().toISOString();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [purpose, setPurpose] = useState<TripPurpose>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const cityKey = detectCityKey(destinationAddress);
    const result = await getHotelRecommendations(cityKey, {
      arrivingByAir,
      destinationQuery: destinationAddress,
      purpose,
      checkinIso,
      nights: 1,
    });
    if (result.ok) setHotels(result.data);
    else setError(result.error);
    setLoading(false);
  }, [destinationAddress, arrivingByAir, purpose, checkinIso]);

  useEffect(() => {
    load();
  }, [load]);

  const purposeChips = (
    <View style={styles.purposeBlock}>
      <Text style={styles.purposeLabel}>WHAT'S THE OCCASION?</Text>
      <View style={styles.purposeRow}>
        {(Object.keys(TRIP_PURPOSE_LABELS) as TripPurpose[]).map((p) => (
          <Chip
            key={p}
            label={TRIP_PURPOSE_LABELS[p]}
            selected={purpose === p}
            onPress={() => setPurpose((prev) => (prev === p ? undefined : p))}
          />
        ))}
      </View>
    </View>
  );

  if (loading) return <LoadingState message="Finding places to stay near your destination…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (hotels.length === 0) {
    return (
      <EmptyState
        icon="bed-outline"
        title="No stays found"
        message="We couldn't find hotel recommendations for this destination yet."
        actionLabel="Back to my trip"
        onAction={() => navigation.goBack()}
      />
    );
  }

  const cityName = CITY_NAMES[detectCityKey(destinationAddress)];

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Stays near {cityName === 'your area' ? 'your destination' : cityName}
          {purpose
            ? ` — matched to your ${TRIP_PURPOSE_LABELS[purpose].toLowerCase()} trip.`
            : arrivingByAir
              ? ' — airport-friendly options first since you arrive by air.'
              : ', sorted by rating.'}
        </Text>

        {purposeChips}

        {hotels.map((h) => (
          <Card key={h.id} style={styles.hotelCard}>
            {h.whyRecommended ? (
              <View style={styles.whyRow}>
                <Ionicons name="sparkles" size={13} color={colors.primary} />
                <Text style={styles.whyText}>{h.whyRecommended}</Text>
              </View>
            ) : null}
            <View style={styles.headerRow}>
              <View style={styles.flex}>
                <Text style={styles.name}>{h.name}</Text>
                <Text style={styles.area}>{h.area}</Text>
              </View>
              <View style={styles.priceWrap}>
                <Text style={styles.price}>${h.pricePerNightUsd}</Text>
                <Text style={styles.priceUnit}>per night</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.rating}>
                <Ionicons name="star" size={13} color={colors.warning} />
                <Text style={styles.ratingText}>
                  {h.rating.toFixed(1)} · {h.reviewCount.toLocaleString()} reviews
                </Text>
              </View>
              {h.nearAirport && (
                <View style={styles.airportTag}>
                  <Ionicons name="airplane" size={11} color={colors.info} />
                  <Text style={styles.airportTagText}>Near airport</Text>
                </View>
              )}
            </View>

            <View style={styles.distanceRow}>
              <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.distance}>{h.distanceLabel}</Text>
            </View>

            <View style={styles.perksRow}>
              {h.perks.map((p) => (
                <View key={p} style={styles.perk}>
                  <Text style={styles.perkText}>{p}</Text>
                </View>
              ))}
            </View>

            <AppButton
              label="View & book"
              icon="open-outline"
              variant="secondary"
              small
              onPress={() => Linking.openURL(h.bookingUrl)}
            />
          </Card>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <AppButton label="No thanks — back to my trip" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 110 },
  intro: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  purposeBlock: { gap: spacing.sm },
  purposeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  purposeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  whyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  whyText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.primary },
  hotelCard: { gap: spacing.md },
  headerRow: { flexDirection: 'row', gap: spacing.md },
  name: { ...typography.heading, color: colors.ink },
  area: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  priceWrap: { alignItems: 'flex-end' },
  price: { ...typography.title, color: colors.ink },
  priceUnit: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: 13, fontWeight: '600', color: colors.text },
  airportTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.infoSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  airportTagText: { fontSize: 11, fontWeight: '700', color: colors.info },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distance: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  perksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  perk: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  perkText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
