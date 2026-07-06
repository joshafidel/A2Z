import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { ModeIcon } from '../components/ModeIcon';
import { useTrip } from '../context/TripContext';
import type { HomeScreenProps } from '../navigation/types';
import { colors, radii, spacing, typography } from '../theme';
import { formatCountdown, formatDate, formatMoney, formatTime } from '../utils/time';

/**
 * Starting page: no search form, no clutter — one clear action.
 * A2Z interviews you (where from, where to, what day, how) and curates
 * the plan; this page just opens the door.
 */
export function HomeScreen({ navigation }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { activeTrip, savedTrips } = useTrip();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: spacing.xxxl }}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={[colors.navy, '#1E2B66', colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + spacing.xxxl }]}
      >
        <Text style={styles.brand}>A2Z</Text>
        <Text style={styles.heroTitle}>Your trip,{'\n'}curated for you.</Text>
        <Text style={styles.heroSubtitle}>
          Answer a few questions — we compare every way to get there, pick your tickets, sort your
          stay, and plan door to door.
        </Text>
        <AppButton
          label="Plan a trip"
          icon="sparkles"
          onPress={() => navigation.navigate('Planner')}
          style={styles.cta}
        />
        <View style={styles.heroSteps}>
          {['Where from', 'Where to', 'What day', 'How'].map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <Ionicons name="chevron-forward" size={12} color={colors.textOnDarkMuted} />}
              <Text style={styles.heroStep}>{s}</Text>
            </React.Fragment>
          ))}
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {activeTrip ? (
          <Card
            onPress={() => navigation.getParent()?.navigate('TripTab' as never)}
            style={styles.tripCard}
          >
            <View style={styles.tripHeader}>
              <Text style={styles.tripLabel}>NEXT TRIP · LEAVE {formatCountdown(activeTrip.route.recommendedLeaveTime).toUpperCase()}</Text>
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
        ) : (
          <Card style={styles.emptyCard}>
            <Ionicons name="compass-outline" size={22} color={colors.primary} />
            <Text style={styles.emptyText}>
              No trips yet. Tap "Plan a trip" and answer a few questions — takes about a minute.
            </Text>
          </Card>
        )}

        {savedTrips.length > 1 && (
          <Text style={styles.savedCount}>
            {savedTrips.length} saved trips in My Trip
          </Text>
        )}

        {/* What A2Z does */}
        <View style={styles.featureGrid}>
          <Feature icon="pricetags" title="Honest pricing" text="Cheapest, priciest, and typical — hidden fees included." />
          <Feature icon="rainy" title="Weather-aware" text="Real forecasts shape every walk-or-ride call." />
          <Feature icon="notifications" title="Nudges on time" text="Walk now, call your ride — with grace periods." />
          <Feature icon="bed" title="Stay sorted" text="Hotels matched to why you're traveling." />
        </View>
      </View>
    </ScrollView>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={17} color={colors.primary} />
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  hero: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    gap: spacing.md,
  },
  brand: { color: colors.textOnDark, fontSize: 16, fontWeight: '900', letterSpacing: 4 },
  heroTitle: { ...typography.hero, fontSize: 34, lineHeight: 40, color: colors.textOnDark },
  heroSubtitle: { fontSize: 15, color: colors.textOnDarkMuted, lineHeight: 22, maxWidth: 330 },
  cta: { marginTop: spacing.md },
  heroSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  heroStep: { fontSize: 12, fontWeight: '700', color: colors.textOnDarkMuted },
  body: { padding: spacing.lg, gap: spacing.lg, marginTop: spacing.sm },
  tripCard: { gap: spacing.sm },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripLabel: { fontSize: 11, fontWeight: '900', color: colors.primary, letterSpacing: 0.8 },
  tripTitle: { ...typography.heading, color: colors.ink },
  tripMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tripMeta: { fontSize: 13, color: colors.textSecondary },
  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emptyText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  savedCount: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  feature: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 6,
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  featureText: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
});
