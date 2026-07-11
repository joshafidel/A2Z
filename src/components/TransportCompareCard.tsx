import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from './AppButton';
import { Card } from './Card';
import { Chip } from './Chip';
import { DataFreshnessBadge } from './DataFreshnessBadge';
import { SectionHeader } from './SectionHeader';
import type { TransportationPriority } from '../services/preferencesService';
import {
  addTransportOption,
  compareTransportOptions,
  getTransportOptions,
  removeTransportOption,
  TRANSPORT_KIND_LABELS,
  type ManualTransportKind,
  type ManualTransportOption,
} from '../services/transportOptionsService';
import { colors, radii, spacing } from '../theme';

/**
 * Manual transportation comparison: the user enters the options they're
 * weighing with their own numbers; A2Z marks cheapest / fastest /
 * recommended with a transparent explanation. "Continue with provider"
 * opens the provider's site — never claimed as booked.
 */
export function TransportCompareCard({
  tripId,
  priority,
  onCountChange,
}: {
  tripId: string;
  priority: TransportationPriority;
  onCountChange?: (count: number) => void;
}) {
  const [options, setOptions] = useState<ManualTransportOption[]>([]);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<ManualTransportKind>('rideshare');
  const [provider, setProvider] = useState('');
  const [minutes, setMinutes] = useState('');
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string>();
  const [openedId, setOpenedId] = useState<string>();

  useEffect(() => {
    getTransportOptions(tripId).then((o) => {
      setOptions(o);
      onCountChange?.(o.length);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const comparison = useMemo(() => compareTransportOptions(options, priority), [options, priority]);

  const add = async () => {
    const mins = parseInt(minutes, 10);
    if (provider.trim() === '') {
      setError('Name the provider (Uber, MBTA, your own car…).');
      return;
    }
    if (!Number.isFinite(mins) || mins <= 0) {
      setError('Duration must be a number of minutes above 0.');
      return;
    }
    const priceNum = price.trim() === '' ? undefined : Number(price.replace(/[$,]/g, ''));
    if (priceNum !== undefined && !Number.isFinite(priceNum)) {
      setError('Price must be a number (or leave it empty).');
      return;
    }
    setError(undefined);
    const next = await addTransportOption({
      tripId,
      kind,
      providerName: provider.trim(),
      durationMinutes: mins,
      priceUsd: priceNum,
      url: url.trim() === '' ? undefined : url.trim(),
    });
    setOptions(next);
    onCountChange?.(next.length);
    setProvider('');
    setMinutes('');
    setPrice('');
    setUrl('');
    setAdding(false);
  };

  const remove = async (id: string) => {
    const next = await removeTransportOption(tripId, id);
    setOptions(next);
    onCountChange?.(next.length);
  };

  const openProvider = (o: ManualTransportOption) => {
    if (!o.url) return;
    Linking.openURL(o.url);
    setOpenedId(o.id);
  };

  return (
    <Card>
      <SectionHeader
        title="Getting around"
        subtitle="Enter the options you're considering — with your own duration and price"
      />
      <DataFreshnessBadge mode="user" provider="Your numbers · A2Z scoring" />

      {options.length === 0 && !adding && (
        <Text style={styles.empty}>
          No options yet. Add the ways you could get there (rideshare, transit, driving…) and A2Z
          will mark the cheapest, fastest, and best fit for your "{priority}" preference.
        </Text>
      )}

      {options.map((o) => {
        const badges: string[] = [];
        if (o.id === comparison.recommendedId && options.length > 1) badges.push('Recommended');
        if (o.id === comparison.cheapestId && options.length > 1) badges.push('Cheapest');
        if (o.id === comparison.fastestId && options.length > 1) badges.push('Fastest');
        return (
          <View key={o.id} style={styles.optionRow}>
            <View style={styles.flex}>
              <View style={styles.optionHeader}>
                <Text style={styles.optionName}>{o.providerName}</Text>
                {badges.map((b) => (
                  <View key={b} style={[styles.badge, b === 'Recommended' && styles.badgeRec]}>
                    <Text style={[styles.badgeText, b === 'Recommended' && styles.badgeTextRec]}>{b}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.optionMeta}>
                {TRANSPORT_KIND_LABELS[o.kind]} · {o.durationMinutes} min ·{' '}
                {o.priceUsd !== undefined ? `$${o.priceUsd}` : 'price unknown'}
              </Text>
              {o.url && (
                <Pressable onPress={() => openProvider(o)} style={styles.providerLink} accessibilityRole="link">
                  <Ionicons name="open-outline" size={13} color={colors.primary} />
                  <Text style={styles.providerLinkText}>Continue with provider</Text>
                </Pressable>
              )}
              {openedId === o.id && (
                <Text style={styles.openedNote}>
                  You opened the provider's website. A2Z cannot confirm whether the booking was
                  completed.
                </Text>
              )}
            </View>
            <Pressable onPress={() => remove(o.id)} style={styles.remove} accessibilityLabel={`Remove ${o.providerName}`}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        );
      })}

      {comparison.explanation && <Text style={styles.explanation}>{comparison.explanation}</Text>}

      {adding ? (
        <View style={styles.form}>
          <View style={styles.chipRow}>
            {(Object.keys(TRANSPORT_KIND_LABELS) as ManualTransportKind[]).map((k) => (
              <Chip key={k} label={TRANSPORT_KIND_LABELS[k]} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={provider}
            onChangeText={setProvider}
            placeholder="Provider (Uber, MBTA, my car…)"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Provider name"
          />
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={minutes}
              onChangeText={setMinutes}
              placeholder="Minutes"
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Duration in minutes"
            />
            <TextInput
              style={[styles.input, styles.flex]}
              value={price}
              onChangeText={setPrice}
              placeholder="Price $ (optional)"
              keyboardType="numeric"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Price in dollars"
            />
          </View>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="Provider link (optional)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            accessibilityLabel="Provider URL"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.formActions}>
            <AppButton label="Add option" icon="add" small onPress={add} />
            <AppButton label="Cancel" variant="ghost" small onPress={() => setAdding(false)} />
          </View>
        </View>
      ) : (
        <AppButton label="Add an option" icon="add" variant="secondary" small onPress={() => setAdding(true)} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginVertical: spacing.sm },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  optionName: { fontSize: 14, fontWeight: '800', color: colors.ink },
  optionMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  badge: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeRec: { borderColor: colors.success, backgroundColor: colors.successSoft },
  badgeText: { fontSize: 9.5, fontWeight: '800', color: colors.textSecondary },
  badgeTextRec: { color: colors.success },
  providerLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, minHeight: 28 },
  providerLinkText: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
  openedNote: { fontSize: 11.5, color: colors.textMuted, marginTop: 4, lineHeight: 15 },
  remove: { padding: 8 },
  explanation: { fontSize: 12.5, color: colors.text, fontWeight: '600', lineHeight: 17, marginTop: spacing.sm, marginBottom: spacing.sm },
  form: { gap: spacing.sm, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inputRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 13.5,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  error: { fontSize: 12, color: colors.danger, fontWeight: '600' },
  formActions: { flexDirection: 'row', gap: spacing.sm },
});
