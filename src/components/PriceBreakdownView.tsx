import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';
import type { PriceBreakdown } from '../types';
import { formatMoney } from '../utils/time';

/** Itemized cost list with a "hidden costs" section and true total. */
export function PriceBreakdownView({ breakdown }: { breakdown: PriceBreakdown }) {
  const visible = breakdown.items.filter((i) => !i.hidden);
  const hidden = breakdown.items.filter((i) => i.hidden);

  return (
    <View style={styles.container}>
      {visible.map((item, idx) => (
        <Row key={`${item.label}-${idx}`} label={item.label} amount={item.amountUsd} note={item.note} />
      ))}

      {hidden.length > 0 && (
        <>
          <View style={styles.hiddenHeader}>
            <Ionicons name="eye-off-outline" size={14} color={colors.textMuted} />
            <Text style={styles.hiddenTitle}>Hidden costs people forget</Text>
          </View>
          {hidden.map((item, idx) => (
            <Row
              key={`h-${item.label}-${idx}`}
              label={item.label}
              amount={item.amountUsd}
              note={item.note}
              muted
            />
          ))}
        </>
      )}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total real cost</Text>
        <Text style={styles.totalValue}>{formatMoney(breakdown.totalUsd)}</Text>
      </View>

      {breakdown.incomplete && (
        <View style={styles.incompleteRow}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.warning} />
          <Text style={styles.incompleteText}>
            Some provider prices were unavailable — total shown is partial.
          </Text>
        </View>
      )}

      {breakdown.timeCostUsd !== undefined && (
        <Text style={styles.timeCost}>
          Time cost: ≈{formatMoney(breakdown.timeCostUsd)} of your day (at $25/hr) — not included in
          total.
        </Text>
      )}
    </View>
  );
}

function Row({
  label,
  amount,
  note,
  muted,
}: {
  label: string;
  amount?: number;
  note?: string;
  muted?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.labelWrap}>
        <Text style={[styles.label, muted && styles.mutedText]}>{label}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <Text style={[styles.amount, muted && styles.mutedText, amount === undefined && styles.unavailable]}>
        {amount === undefined ? 'N/A' : formatMoney(amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  labelWrap: { flex: 1 },
  label: { ...typography.body, color: colors.text },
  note: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  amount: { ...typography.bodyMedium, color: colors.text },
  mutedText: { color: colors.textSecondary },
  unavailable: { color: colors.warning },
  hiddenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  hiddenTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  totalLabel: { ...typography.heading, color: colors.ink },
  totalValue: { ...typography.heading, color: colors.ink },
  incompleteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  incompleteText: { flex: 1, fontSize: 12, color: colors.warning, fontWeight: '600' },
  timeCost: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
});
