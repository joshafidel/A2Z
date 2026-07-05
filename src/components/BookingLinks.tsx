import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme';
import type { BookingLink } from '../types';

/**
 * Open a provider link: try the native deep link first, fall back to web.
 * Exported so screens can reuse it for one-off buttons.
 */
export async function openBookingLink(link: BookingLink): Promise<void> {
  try {
    if (link.deepLink) {
      const supported = await Linking.canOpenURL(link.deepLink);
      if (supported) {
        await Linking.openURL(link.deepLink);
        return;
      }
    }
    await Linking.openURL(link.webUrl);
  } catch {
    Alert.alert('Could not open link', `${link.provider} is unavailable right now. Try again later.`);
  }
}

/** Grid of provider buttons ("Open in Uber", "Book train", …). */
export function BookingLinks({ links }: { links: BookingLink[] }) {
  if (links.length === 0) return null;
  return (
    <View style={styles.grid}>
      {links.map((link) => (
        <Pressable
          key={link.id}
          onPress={() => openBookingLink(link)}
          accessibilityRole="link"
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Ionicons
            name={(link.icon as keyof typeof Ionicons.glyphMap) ?? 'open-outline'}
            size={17}
            color={colors.primary}
          />
          <Text style={styles.label} numberOfLines={1}>
            {link.label}
          </Text>
          <Ionicons name="open-outline" size={14} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.sm },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    minHeight: 50,
  },
  pressed: { opacity: 0.7 },
  label: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
});
