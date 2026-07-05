import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme';
import type { RouteOption } from '../types';
import { modeColor } from './ModeIcon';

/**
 * Stylized route preview.
 *
 * REAL API: replace with `react-native-maps` (MapView + Polyline) fed by
 * Google Directions polylines, or a static Maps image via
 * `https://maps.googleapis.com/maps/api/staticmap?...&key=${apiConfig.googleMapsApiKey}`.
 * This placeholder keeps the MVP dependency-free while showing the route shape.
 */
export function MapPreview({ route }: { route: RouteOption }) {
  const rides = route.segments.filter((s) => s.mode !== 'wait');

  return (
    <View style={styles.map}>
      {/* Decorative grid to suggest a map */}
      <View style={styles.gridOverlay}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.gridLineH, { top: `${(i + 1) * 20}%` }]} />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 16}%` }]} />
        ))}
      </View>

      <View style={styles.routeRow}>
        <View style={styles.endpoint}>
          <View style={styles.originDot} />
          <Text style={styles.endpointLabel} numberOfLines={1}>
            {rides[0]?.from ?? 'Origin'}
          </Text>
        </View>

        <View style={styles.pathRow}>
          {rides.map((s) => (
            <View
              key={s.id}
              style={[
                styles.pathSegment,
                { backgroundColor: modeColor(s.mode), flex: Math.max(1, s.durationMinutes) },
              ]}
            />
          ))}
        </View>

        <View style={styles.endpoint}>
          <Ionicons name="location" size={18} color={colors.danger} />
          <Text style={styles.endpointLabel} numberOfLines={1}>
            {rides[rides.length - 1]?.to ?? 'Destination'}
          </Text>
        </View>
      </View>

      <Text style={styles.hint}>Route preview — open in Maps for live navigation</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: '#E8EDF5',
    borderRadius: radii.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    gap: spacing.md,
  },
  gridOverlay: { ...StyleSheet.absoluteFillObject },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(16,26,61,0.05)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(16,26,61,0.05)',
  },
  routeRow: { gap: spacing.sm, paddingVertical: spacing.md },
  endpoint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  originDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  endpointLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, flex: 1 },
  pathRow: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginHorizontal: 5,
    gap: 2,
  },
  pathSegment: { height: 6 },
  hint: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
});
