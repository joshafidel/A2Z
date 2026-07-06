import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Badge } from '../components/Badge';
import { BookingLinks } from '../components/BookingLinks';
import { Card } from '../components/Card';
import { MapPreview } from '../components/MapPreview';
import { ModeIcon } from '../components/ModeIcon';
import { PriceBreakdownView } from '../components/PriceBreakdownView';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState } from '../components/States';
import { TimelineView } from '../components/TimelineView';
import { WarningList } from '../components/WarningList';
import { useTrip } from '../context/TripContext';
import type { RouteDetailScreenProps } from '../navigation/types';
import { colors, radii, spacing, typography } from '../theme';
import { formatDuration, formatMoney, formatTime } from '../utils/time';

export function RouteDetailScreen({ navigation, route: navRoute }: RouteDetailScreenProps) {
  const { routeId } = navRoute.params;
  const { results, savedTrips, saveTrip } = useTrip();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hotelPrompt, setHotelPrompt] = useState(false);

  const route = useMemo(() => {
    const fromResults = results?.routes.find((r) => r.id === routeId);
    if (fromResults) return fromResults;
    return savedTrips.find((t) => t.route.id === routeId)?.route;
  }, [results, savedTrips, routeId]);

  if (!route) {
    return (
      <EmptyState
        title="Route not found"
        message="This route is no longer available. Run a new search to refresh options."
        actionLabel="New search"
        onAction={() => navigation.popToTop()}
      />
    );
  }

  const alreadySaved = saved || savedTrips.some((t) => t.route.id === route.id);

  const onSave = async () => {
    setSaving(true);
    const ok = await saveTrip(route);
    setSaving(false);
    if (ok) {
      setSaved(true);
      setHotelPrompt(true); // booked → offer a place to stay
    }
  };

  const intel = route.airportIntel;

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerCard}>
          {route.badges.length > 0 && (
            <View style={styles.badgeRow}>
              {route.badges.map((b) => (
                <Badge key={b} badge={b} />
              ))}
            </View>
          )}
          <Text style={styles.title}>{route.title}</Text>
          <Text style={styles.summary}>{route.summary}</Text>

          <View style={styles.keyStats}>
            <KeyStat label="Door to door" value={formatDuration(route.totalDurationMinutes)} />
            <KeyStat label="Total cost" value={formatMoney(route.totalPriceUsd)} />
            <KeyStat
              label="Leave by"
              value={formatTime(route.recommendedLeaveTime)}
              highlight
            />
          </View>

          {route.score?.explanation ? (
            <Text style={styles.explanation}>{route.score.explanation}</Text>
          ) : null}
        </View>

        <WarningList warnings={route.warnings} />

        <MapPreview route={route} />

        {/* Airport intelligence */}
        {intel && (
          <Card>
            <SectionHeader
              title={`${intel.airportCode} airport plan`}
              subtitle={intel.airportName}
            />
            <View style={styles.intelGrid}>
              <IntelRow
                icon="log-in-outline"
                label="Be at airport by"
                value={formatTime(intel.recommendedArrivalTime)}
              />
              <IntelRow
                icon="finger-print-outline"
                label="TSA estimate"
                value={`${intel.tsaWaitMinutes.min}–${intel.tsaWaitMinutes.max} min`}
              />
              <IntelRow
                icon="airplane-outline"
                label="Boarding around"
                value={formatTime(intel.boardingTime)}
              />
              {intel.baggageCheckCutoff && (
                <IntelRow
                  icon="briefcase-outline"
                  label="Bag check closes"
                  value={formatTime(intel.baggageCheckCutoff)}
                />
              )}
              <IntelRow
                icon="home-outline"
                label="Leave home by"
                value={formatTime(intel.leaveHomeBy)}
              />
            </View>
            <Text style={styles.gateNote}>{intel.gateArrivalRecommendation}</Text>
            {intel.reasons.map((r) => (
              <Text key={r} style={styles.intelReason}>
                · {r}
              </Text>
            ))}
          </Card>
        )}

        {/* Timeline */}
        <Card>
          <SectionHeader
            title="Door-to-door timeline"
            subtitle={`${formatTime(route.departureTime)} → ${formatTime(route.arrivalTime)} · ${route.arrivalBufferMinutes} min buffer built in`}
          />
          <TimelineView steps={route.timeline} />
        </Card>

        {/* Walk vs ride tradeoffs */}
        {route.walkAdvice.length > 0 && (
          <Card>
            <SectionHeader title="Walk or ride?" subtitle="For each walking stretch on this route" />
            <View style={styles.adviceStack}>
              {route.walkAdvice.map((a) => (
                <View key={a.segmentId} style={styles.adviceRow}>
                  <ModeIcon mode={a.recommendation === 'ride' ? 'rideshare' : 'walk'} size={15} />
                  <Text style={styles.adviceText}>{a.explanation}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Price breakdown */}
        <Card>
          <SectionHeader title="Price breakdown" subtitle="Including the costs people forget" />
          <PriceBreakdownView breakdown={route.priceBreakdown} />
        </Card>

        {/* Booking links */}
        <Card>
          <SectionHeader title="Book & navigate" subtitle="Opens the app when installed, web otherwise" />
          <BookingLinks links={route.bookingLinks} />
        </Card>

        {/* Backup plans */}
        {route.backupPlans.length > 0 && (
          <Card>
            <SectionHeader title="If things go wrong" subtitle="Backup options for this route" />
            <View style={styles.adviceStack}>
              {route.backupPlans.map((b) => (
                <View key={b.id} style={styles.backupRow}>
                  <ModeIcon mode={b.mode} size={14} />
                  <View style={styles.flex}>
                    <Text style={styles.backupTitle}>{b.title}</Text>
                    <Text style={styles.backupDesc}>{b.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}
      </ScrollView>

      {/* Sticky save CTA / post-save hotel prompt */}
      <View style={styles.footer}>
        {hotelPrompt ? (
          <View style={styles.hotelPrompt}>
            <View style={styles.hotelPromptHeader}>
              <Ionicons name="bed" size={20} color={colors.primary} />
              <View style={styles.flex}>
                <Text style={styles.hotelPromptTitle}>Trip saved! Need a place to stay?</Text>
                <Text style={styles.hotelPromptText}>
                  We can recommend hotels near your destination
                  {route.primaryMode === 'flight' ? ' and the airport' : ''}.
                </Text>
              </View>
            </View>
            <View style={styles.hotelPromptButtons}>
              <AppButton
                label="Not now"
                variant="ghost"
                small
                style={styles.flex}
                onPress={() => setHotelPrompt(false)}
              />
              <AppButton
                label="Find hotels"
                icon="bed"
                small
                style={styles.flex}
                onPress={() => {
                  setHotelPrompt(false);
                  navigation.navigate('Hotels');
                }}
              />
            </View>
          </View>
        ) : (
          <AppButton
            label={alreadySaved ? 'Saved — view My Trip' : 'Save this trip'}
            icon={alreadySaved ? 'checkmark-circle' : 'bookmark'}
            onPress={onSave}
            loading={saving}
            disabled={alreadySaved}
          />
        )}
      </View>
    </View>
  );
}

function KeyStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={[styles.keyStat, highlight && styles.keyStatHighlight]}>
      <Text style={[styles.keyStatValue, highlight && styles.keyStatValueHl]}>{value}</Text>
      <Text style={[styles.keyStatLabel, highlight && styles.keyStatLabelHl]}>{label}</Text>
    </View>
  );
}

function IntelRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.intelRow}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.intelLabel}>{label}</Text>
      <Text style={styles.intelValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 },
  headerCard: { gap: spacing.sm },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  title: { ...typography.hero, color: colors.ink },
  summary: { ...typography.body, color: colors.textSecondary },
  keyStats: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  keyStat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  keyStatHighlight: { backgroundColor: colors.primary, borderColor: colors.primary },
  keyStatValue: { ...typography.heading, color: colors.ink },
  keyStatValueHl: { color: '#FFFFFF' },
  keyStatLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  keyStatLabelHl: { color: 'rgba(255,255,255,0.8)' },
  explanation: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    fontWeight: '500',
  },
  intelGrid: { gap: spacing.sm },
  intelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  intelLabel: { flex: 1, fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  intelValue: { fontSize: 14, fontWeight: '700', color: colors.ink },
  gateNote: {
    marginTop: spacing.md,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  intelReason: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
  adviceStack: { gap: spacing.md },
  adviceRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  adviceText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  backupRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  backupTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  backupDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
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
  hotelPrompt: { gap: spacing.md },
  hotelPromptHeader: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  hotelPromptTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  hotelPromptText: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  hotelPromptButtons: { flexDirection: 'row', gap: spacing.md },
});
