import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { Card } from '../components/Card';
import { AIRPORTS } from '../data/airports';
import type { ImportTripScreenProps } from '../navigation/types';
import {
  extractTrip,
  type ImportedTripFields,
  type ImportResult,
} from '../services/importService';
import { colors, radii, spacing, typography } from '../theme';

const FIELD_LABELS: Record<keyof ImportedTripFields, string> = {
  originAirportCode: 'From airport (code)',
  destinationAirportCode: 'To airport (code)',
  airlineCode: 'Airline code',
  flightNumber: 'Flight number',
  departureDate: 'Departure date (YYYY-MM-DD)',
  confirmationCode: 'Confirmation code',
  hotelName: 'Hotel',
};

/**
 * Paste-a-confirmation import: extract → REVIEW (everything editable,
 * low-confidence flagged) → confirm. Nothing is saved until confirmed,
 * and missing fields stay blank — never invented.
 */
export function ImportTripScreen({ navigation }: ImportTripScreenProps) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult>();
  const [fields, setFields] = useState<ImportedTripFields>();

  const runExtract = async () => {
    if (text.trim().length < 20 || busy) return;
    setBusy(true);
    const r = await extractTrip(text);
    setResult(r);
    setFields(r.fields);
    setBusy(false);
  };

  const airportPlace = (code: string | null) => {
    if (!code) return undefined;
    const airport = AIRPORTS.find((a) => a.code === code.toUpperCase());
    return airport
      ? { address: `${airport.name} (${airport.code})`, label: `${airport.city} (${airport.code})` }
      : { address: code.toUpperCase(), label: code.toUpperCase() };
  };

  const confirm = () => {
    if (!fields) return;
    navigation.replace('Planner', {
      origin: airportPlace(fields.originAirportCode),
      destination: airportPlace(fields.destinationAirportCode),
      importedDate: fields.departureDate ?? undefined,
    });
  };

  const lowConfidence = (key: keyof ImportedTripFields) =>
    fields?.[key] !== null && (result?.confidence[key] ?? 0) < 0.7;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Paste a confirmation</Text>
      </View>

      <Text style={styles.hint}>
        Paste the text of an airline or hotel confirmation email. A2Z extracts the details for you
        to review — nothing is saved until you confirm, and missing fields stay blank.
      </Text>

      <TextInput
        style={styles.paste}
        multiline
        placeholder={'Paste the confirmation email text here…\n\ne.g. "Your Delta confirmation ABC123: DL 1232, JFK to MIA, Jul 25, 2026"'}
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        textAlignVertical="top"
      />
      <AppButton
        label={busy ? 'Extracting…' : 'Extract details'}
        icon="sparkles"
        disabled={busy || text.trim().length < 20}
        onPress={runExtract}
      />

      {result && fields && (
        <Card style={styles.review}>
          <Text style={styles.reviewTitle}>
            Review before continuing
            {result.source === 'ai' ? ' · extracted by Claude' : ' · extracted by pattern matching'}
          </Text>
          {(Object.keys(FIELD_LABELS) as Array<keyof ImportedTripFields>).map((key) => (
            <View key={key} style={styles.fieldRow}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>{FIELD_LABELS[key]}</Text>
                {lowConfidence(key) && (
                  <View style={styles.lowConf}>
                    <Ionicons name="alert-circle" size={11} color={colors.warning} />
                    <Text style={styles.lowConfText}>check this</Text>
                  </View>
                )}
              </View>
              <TextInput
                style={[styles.fieldInput, lowConfidence(key) && styles.fieldInputWarn]}
                value={fields[key] ?? ''}
                placeholder="Not found — fill in if you know it"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                onChangeText={(v) => setFields({ ...fields, [key]: v.trim() === '' ? null : v })}
              />
            </View>
          ))}
          <AppButton
            label="Looks right — plan this trip"
            icon="arrow-forward"
            disabled={!fields.originAirportCode && !fields.destinationAirportCode}
            onPress={confirm}
          />
          <Text style={styles.confirmHint}>
            Continuing opens the planner pre-filled with these details. Nothing has been saved yet.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.title, color: colors.ink },
  hint: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  paste: {
    minHeight: 140,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  review: { gap: spacing.md },
  reviewTitle: { fontSize: 13, fontWeight: '800', color: colors.ink },
  fieldRow: { gap: 4 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.4 },
  lowConf: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lowConfText: { fontSize: 10, fontWeight: '700', color: colors.warning },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  fieldInputWarn: { borderColor: colors.warning },
  confirmHint: { fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },
});
