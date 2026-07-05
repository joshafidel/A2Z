import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';
import type { TimelineStep } from '../types';
import { formatTime } from '../utils/time';
import { modeColor } from './ModeIcon';

/** Chronological door-to-door timeline with a connecting rail. */
export function TimelineView({ steps }: { steps: TimelineStep[] }) {
  return (
    <View style={styles.container}>
      {steps.map((step, i) => (
        <View key={step.id} style={styles.row}>
          <Text style={styles.time}>{formatTime(step.time)}</Text>

          <View style={styles.railColumn}>
            <View
              style={[
                styles.dot,
                { backgroundColor: modeColor(step.mode) },
                step.emphasis === 'critical' && styles.dotCritical,
              ]}
            />
            {i < steps.length - 1 && <View style={styles.rail} />}
          </View>

          <View style={[styles.content, i < steps.length - 1 && styles.contentSpacing]}>
            <Text
              style={[styles.title, step.emphasis === 'critical' && styles.titleCritical]}
            >
              {step.title}
            </Text>
            {step.subtitle ? <Text style={styles.subtitle}>{step.subtitle}</Text> : null}
            {step.warning ? (
              <View style={styles.warningRow}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={styles.warningText}>{step.warning}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  time: {
    width: 66,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingTop: 1,
    textAlign: 'right',
    paddingRight: spacing.md,
  },
  railColumn: { alignItems: 'center', width: 20 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 3,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  dotCritical: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  rail: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  content: { flex: 1, paddingLeft: spacing.md },
  contentSpacing: { paddingBottom: spacing.xl },
  title: { ...typography.body, fontWeight: '600', color: colors.text },
  titleCritical: { fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  warningText: { fontSize: 12, fontWeight: '600', color: colors.danger },
});
