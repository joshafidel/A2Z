import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { BADGE_LABELS, type RouteBadge } from '../types';

const BADGE_META: Record<RouteBadge, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  'best-overall': { color: colors.badgeBest, icon: 'star' },
  cheapest: { color: colors.badgeCheap, icon: 'pricetag' },
  fastest: { color: colors.badgeFast, icon: 'flash' },
  'least-stressful': { color: colors.badgeCalm, icon: 'leaf' },
};

export function Badge({ badge }: { badge: RouteBadge }) {
  const meta = BADGE_META[badge];
  return (
    <View style={[styles.badge, { backgroundColor: meta.color }]}>
      <Ionicons name={meta.icon} size={11} color="#FFFFFF" />
      <Text style={styles.text}>{BADGE_LABELS[badge]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
