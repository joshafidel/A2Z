import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { ModeIcon } from '../components/ModeIcon';
import { PlaceInput } from '../components/PlaceInput';
import { useTrip } from '../context/TripContext';
import type { HomeScreenProps } from '../navigation/types';
import { getCurrentLocation } from '../services/locationService';
import { colors, radii, shadows, spacing, typography } from '../theme';
import type { Place } from '../types';
import { formatCountdown, formatDate, formatMoney, formatTime } from '../utils/time';

/**
 * Home page: one clean question — "Where are you going?" — with your
 * current location already filled in as the starting point and an arrow
 * showing the direction of travel. Picking a destination starts the plan.
 */
export function HomeScreen({ navigation }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { activeTrip } = useTrip();
  const [origin, setOrigin] = useState<Place>();
  const [locating, setLocating] = useState(true);

  // Your current address is pulled in automatically as the starting point.
  useEffect(() => {
    let cancelled = false;
    getCurrentLocation().then((r) => {
      if (cancelled) return;
      setLocating(false);
      if (r.ok) setOrigin({ ...r.data, label: r.data.address });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const startPlan = (destination: Place) => {
    navigation.navigate('Planner', { origin, destination });
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={[colors.navy, '#1E2B66', colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + spacing.xxl }]}
      >
        <Text style={styles.brand}>
          A<Text style={styles.brandAccent}>2</Text>Z
        </Text>
        <Text style={styles.heroTitle}>Where are you going?</Text>
      </LinearGradient>

      {/* From → To, direction made obvious */}
      <View style={styles.searchCard}>
        <View style={styles.fieldRow}>
          <View style={styles.fieldIcon}>
            <Ionicons name="ellipse" size={10} color={colors.textMuted} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.fieldLabel}>FROM</Text>
            <PlaceInput
              placeholder={locating ? 'Finding your location…' : 'Your starting point'}
              value={origin?.label}
              onSelect={(p) => setOrigin({ address: p.address, label: p.label })}
            />
          </View>
        </View>

        <View style={styles.arrowRow}>
          <View style={styles.arrowLine} />
          <View style={styles.arrowCircle}>
            <Ionicons name="arrow-down" size={16} color="#FFFFFF" />
          </View>
          <View style={styles.arrowLine} />
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.fieldIcon}>
            <Ionicons name="location" size={14} color={colors.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.fieldLabel}>TO</Text>
            <PlaceInput
              placeholder="City, address, or hotel"
              onSelect={(p) => startPlan({ address: p.address, label: p.label })}
            />
          </View>
        </View>
      </View>

      <Pressable
        onPress={() => navigation.navigate('ImportTrip')}
        style={styles.importLink}
        accessibilityRole="button"
      >
        <Ionicons name="document-text-outline" size={15} color={colors.primary} />
        <Text style={styles.importLinkText}>Paste a confirmation email instead</Text>
      </Pressable>

      {activeTrip && (
        <View style={styles.body}>
          <Card
            onPress={() => navigation.getParent()?.navigate('TripTab' as never)}
            style={styles.tripCard}
          >
            <View style={styles.tripHeader}>
              <Text style={styles.tripLabel}>
                NEXT TRIP · LEAVE {formatCountdown(activeTrip.route.recommendedLeaveTime).toUpperCase()}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </View>
            <Text style={styles.tripTitle}>
              {activeTrip.search.origin.label ?? 'Home'} → {activeTrip.search.destination.label}
            </Text>
            <View style={styles.tripMetaRow}>
              <ModeIcon mode={activeTrip.route.primaryMode} size={13} />
              <Text style={styles.tripMeta}>
                {formatDate(activeTrip.route.departureTime)} · leave{' '}
                {formatTime(activeTrip.route.recommendedLeaveTime)} ·{' '}
                {formatMoney(activeTrip.route.totalPriceUsd)}
              </Text>
            </View>
          </Card>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  hero: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl + spacing.xxl,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    gap: spacing.md,
  },
  brand: { color: colors.textOnDark, fontSize: 18, fontWeight: '900', letterSpacing: 4 },
  brandAccent: { color: colors.primary },
  heroTitle: { ...typography.hero, fontSize: 32, lineHeight: 38, color: colors.textOnDark },
  searchCard: {
    marginTop: -spacing.xxxl,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.floating,
  },
  fieldRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  fieldIcon: { width: 24, alignItems: 'center', paddingTop: 30 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginBottom: 4,
  },
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 2,
  },
  arrowLine: { flex: 1, height: 1, backgroundColor: colors.border },
  arrowCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
  },
  importLinkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  body: { padding: spacing.lg, gap: spacing.lg, marginTop: spacing.sm },
  tripCard: { gap: spacing.sm },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripLabel: { fontSize: 11, fontWeight: '900', color: colors.primary, letterSpacing: 0.8 },
  tripTitle: { ...typography.heading, color: colors.ink },
  tripMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tripMeta: { fontSize: 13, color: colors.textSecondary },
});
