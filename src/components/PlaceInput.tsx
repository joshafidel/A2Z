import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { suggestLocalPlaces, suggestPlaces, type PlaceSuggestion } from '../services/placesService';
import { colors, radii, shadows, spacing } from '../theme';

const KIND_ICONS: Record<PlaceSuggestion['kind'], keyof typeof Ionicons.glyphMap> = {
  airport: 'airplane',
  station: 'train',
  city: 'business',
  poi: 'location',
  address: 'home',
  home: 'home',
};

interface PlaceInputProps {
  placeholder: string;
  /** Fired when the user picks a suggestion or commits free text. */
  onSelect: (place: { address: string; label: string }) => void;
  /** Current committed value (label) — shown when not editing. */
  value?: string;
  autoFocus?: boolean;
}

/**
 * Autocomplete place field: local matches (airports/stations/cities,
 * alias-aware — "loga" → Logan Airport) appear instantly as you type;
 * live geocoder addresses merge in after a short debounce.
 */
export function PlaceInput({ placeholder, onSelect, value, autoFocus }: PlaceInputProps) {
  const [text, setText] = useState(value ?? '');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    setText(value ?? '');
  }, [value]);

  const onChange = (t: string) => {
    setText(t);
    // Instant local suggestions on every keystroke…
    const local = suggestLocalPlaces(t);
    setSuggestions(local);
    setOpen(t.trim().length >= 2);
    // …then merge live geocoder results after a pause in typing.
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const merged = await suggestPlaces(t);
      if (merged.ok) setSuggestions(merged.data);
    }, 350);
  };

  const pick = (s: PlaceSuggestion) => {
    setText(s.label);
    setOpen(false);
    onSelect({ address: s.address, label: s.label.split(' (')[0] });
  };

  const commitFreeText = () => {
    if (text.trim().length < 3) return;
    // Best local match wins if it's strong; otherwise use the raw text.
    const [top] = suggestLocalPlaces(text, 1);
    if (top) pick(top);
    else {
      setOpen(false);
      onSelect({ address: text.trim(), label: text.trim().split(',')[0] });
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={onChange}
          onSubmitEditing={commitFreeText}
          autoFocus={autoFocus}
          autoCorrect={false}
          returnKeyType="done"
        />
        {text.length > 0 && (
          <Pressable onPress={() => onChange('')} accessibilityLabel="Clear">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {open && suggestions.length > 0 && (
        <View style={styles.dropdown}>
          {suggestions.slice(0, 6).map((s) => (
            <Pressable
              key={s.id}
              onPress={() => pick(s)}
              style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
            >
              <View style={styles.suggestionIcon}>
                <Ionicons name={KIND_ICONS[s.kind]} size={15} color={colors.primary} />
              </View>
              <View style={styles.suggestionText}>
                <Text style={styles.suggestionLabel} numberOfLines={1}>
                  {s.label}
                </Text>
                <Text style={styles.suggestionSub} numberOfLines={1}>
                  {s.sublabel}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', zIndex: 10 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    minHeight: 54,
  },
  input: { flex: 1, fontSize: 16, color: colors.text },
  dropdown: {
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.floating,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  suggestionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: { flex: 1 },
  suggestionLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  suggestionSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
});
