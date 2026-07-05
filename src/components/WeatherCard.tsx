import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../theme';
import type { WeatherCondition, WeatherKind } from '../types';

const KIND_ICONS: Record<WeatherKind, keyof typeof Ionicons.glyphMap> = {
  clear: 'sunny',
  clouds: 'cloud',
  rain: 'rainy',
  'heavy-rain': 'rainy',
  snow: 'snow',
  storm: 'thunderstorm',
  heat: 'thermometer',
  cold: 'snow',
  wind: 'flag',
  fog: 'cloud-outline',
};

interface WeatherCardProps {
  origin?: WeatherCondition;
  destination?: WeatherCondition;
}

/** Origin/destination weather strip with advisories. Renders nothing when data is missing. */
export function WeatherCard({ origin, destination }: WeatherCardProps) {
  const both = [origin, destination].filter((w): w is WeatherCondition => Boolean(w));
  if (both.length === 0) return null;

  const advisories = Array.from(new Set(both.flatMap((w) => w.advisories))).slice(0, 3);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {both.map((w) => (
          <View key={w.locationLabel} style={styles.cell}>
            <Ionicons name={KIND_ICONS[w.kind]} size={22} color={colors.textOnDark} />
            <View>
              <Text style={styles.temp}>{w.tempF}°F</Text>
              <Text style={styles.place}>{w.locationLabel}</Text>
              <Text style={styles.summary}>{w.summary.split(',')[0]}</Text>
            </View>
          </View>
        ))}
      </View>
      {advisories.length > 0 && (
        <View style={styles.advisories}>
          {advisories.map((a) => (
            <Text key={a} style={styles.advisory}>
              · {a}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.navy,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', gap: spacing.xl },
  cell: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  temp: { ...typography.heading, color: colors.textOnDark },
  place: { fontSize: 12, color: colors.textOnDarkMuted, fontWeight: '600' },
  summary: { fontSize: 12, color: colors.textOnDarkMuted },
  advisories: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: spacing.md,
    gap: 4,
  },
  advisory: { fontSize: 13, color: colors.textOnDarkMuted, lineHeight: 18 },
});
