import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme';
import type { RiskWarning } from '../types';

const LEVEL_META = {
  low: { bg: colors.infoSoft, fg: colors.info, icon: 'information-circle' as const },
  medium: { bg: colors.warningSoft, fg: colors.warning, icon: 'warning' as const },
  high: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' as const },
};

/** Stacked risk/weather warning banners. */
export function WarningList({ warnings }: { warnings: RiskWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <View style={styles.stack}>
      {warnings.map((w) => {
        const meta = LEVEL_META[w.level];
        return (
          <View key={w.id} style={[styles.banner, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={17} color={meta.fg} />
            <Text style={[styles.text, { color: meta.fg }]}>{w.message}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  text: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
