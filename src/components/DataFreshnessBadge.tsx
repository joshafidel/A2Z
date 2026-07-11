import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../theme';

export type DataMode = 'live' | 'demo' | 'unavailable';

/**
 * Trust badge for every external-data card: LIVE only when the value came
 * from a real provider (with the provider named and when it was verified);
 * DEMO/ESTIMATE clearly labeled; UNAVAILABLE when a provider failed —
 * never a silent fake fallback dressed up as live.
 */
export function DataFreshnessBadge({
  mode,
  provider,
  lastVerifiedAt,
  stale,
}: {
  mode: DataMode;
  provider: string;
  lastVerifiedAt?: string | null;
  stale?: boolean;
}) {
  const meta =
    mode === 'live'
      ? { label: 'LIVE', color: colors.success, icon: 'radio-outline' as const }
      : mode === 'demo'
        ? { label: 'DEMO DATA', color: colors.warning, icon: 'flask-outline' as const }
        : { label: 'UNAVAILABLE', color: colors.textMuted, icon: 'cloud-offline-outline' as const };
  const verified =
    mode === 'live' && lastVerifiedAt
      ? ` · ${provider} · ${new Date(lastVerifiedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : mode === 'demo'
        ? ` · ${provider}`
        : '';
  return (
    <View style={styles.row}>
      <View style={[styles.badge, { borderColor: meta.color }]}>
        <Ionicons name={meta.icon} size={10} color={meta.color} />
        <Text style={[styles.text, { color: meta.color }]}>
          {meta.label}
          {verified}
        </Text>
      </View>
      {stale && mode === 'live' && (
        <Text style={styles.stale}>may be out of date — refresh</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  stale: { fontSize: 10, color: colors.warning, fontWeight: '700' },
});
