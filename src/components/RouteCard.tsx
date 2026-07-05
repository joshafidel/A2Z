import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';
import type { RouteOption } from '../types';
import { formatDuration, formatMoney, formatTime } from '../utils/time';
import { Badge } from './Badge';
import { Card } from './Card';
import { ModeIcon } from './ModeIcon';

interface RouteCardProps {
  route: RouteOption;
  onPress: () => void;
}

/** Comparison card on the results screen: badges, mode mix, key stats. */
export function RouteCard({ route, onPress }: RouteCardProps) {
  const hasWarnings = route.warnings.some((w) => w.level !== 'low');

  return (
    <Card onPress={onPress} style={styles.card}>
      {route.badges.length > 0 && (
        <View style={styles.badgeRow}>
          {route.badges.map((b) => (
            <Badge key={b} badge={b} />
          ))}
        </View>
      )}

      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{route.title}</Text>
          <Text style={styles.summary}>{route.summary}</Text>
        </View>
        <View style={styles.priceWrap}>
          <Text style={styles.price}>{formatMoney(route.totalPriceUsd)}</Text>
          {route.priceBreakdown.incomplete && (
            <Text style={styles.priceNote}>partial price</Text>
          )}
        </View>
      </View>

      <View style={styles.modeRow}>
        {route.modeMix.map((mode, i) => (
          <React.Fragment key={`${mode}-${i}`}>
            {i > 0 && <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />}
            <ModeIcon mode={mode} size={13} />
          </React.Fragment>
        ))}
      </View>

      <View style={styles.statsRow}>
        <Stat icon="time-outline" text={formatDuration(route.totalDurationMinutes)} />
        <Stat
          icon="swap-horizontal"
          text={`${route.transferCount} transfer${route.transferCount === 1 ? '' : 's'}`}
        />
        <Stat icon="walk" text={`${route.walkingMinutes} min walk`} />
        <Stat icon="shield-checkmark-outline" text={`${route.reliabilityScore}%`} />
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.times}>
          {formatTime(route.departureTime)} → {formatTime(route.arrivalTime)}
        </Text>
        {hasWarnings && (
          <View style={styles.warningPill}>
            <Ionicons name="warning" size={12} color={colors.warning} />
            <Text style={styles.warningText}>
              {route.warnings.filter((w) => w.level !== 'low').length} alert
              {route.warnings.filter((w) => w.level !== 'low').length === 1 ? '' : 's'}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

function Stat({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={13} color={colors.textSecondary} />
      <Text style={styles.statText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  titleWrap: { flex: 1, gap: 2 },
  title: { ...typography.heading, color: colors.text },
  summary: { ...typography.caption, color: colors.textSecondary },
  priceWrap: { alignItems: 'flex-end' },
  price: { ...typography.title, color: colors.ink },
  priceNote: { fontSize: 11, color: colors.warning, fontWeight: '600' },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  times: { ...typography.bodyMedium, color: colors.text },
  warningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningSoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  warningText: { fontSize: 12, fontWeight: '600', color: colors.warning },
});
