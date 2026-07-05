import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import type { TransportMode } from '../types';

const MODE_META: Record<TransportMode, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  flight: { icon: 'airplane', color: colors.modeFlight },
  train: { icon: 'train', color: colors.modeTrain },
  bus: { icon: 'bus', color: colors.modeBus },
  drive: { icon: 'car', color: colors.modeDrive },
  walk: { icon: 'walk', color: colors.modeWalk },
  transit: { icon: 'subway', color: colors.modeTransit },
  rideshare: { icon: 'car-sport', color: colors.modeRideshare },
  'airport-transfer': { icon: 'trail-sign', color: colors.modeFlight },
  ferry: { icon: 'boat', color: colors.modeFlight },
  wait: { icon: 'time', color: colors.textMuted },
};

interface ModeIconProps {
  mode: TransportMode;
  size?: number;
  plain?: boolean; // no circle background
}

export function ModeIcon({ mode, size = 18, plain }: ModeIconProps) {
  const meta = MODE_META[mode];
  if (plain) return <Ionicons name={meta.icon} size={size} color={meta.color} />;
  return (
    <View
      style={[
        styles.circle,
        { width: size * 2, height: size * 2, borderRadius: size, backgroundColor: `${meta.color}1A` },
      ]}
    >
      <Ionicons name={meta.icon} size={size} color={meta.color} />
    </View>
  );
}

export function modeColor(mode: TransportMode): string {
  return MODE_META[mode].color;
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
