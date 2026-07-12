import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { DataFreshnessBadge } from '../components/DataFreshnessBadge';
import type { TripChatScreenProps } from '../navigation/types';
import { getProfile } from '../services/preferencesService';
import {
  buildReply,
  chatAiConfigured,
  EMPTY_REQUEST,
  mergeRequest,
  missingFields,
  parseTripMessage,
  type TripRequestFields,
} from '../services/tripChatService';
import { colors, radii, spacing, typography } from '../theme';

interface ChatMessage {
  id: string;
  from: 'user' | 'a2z';
  text: string;
  /** Set on the assistant message once enough is known to plan. */
  readyToPlan?: boolean;
}

/**
 * Tell A2Z what you need in plain English; it extracts the trip request
 * (asking for anything missing, one question at a time) and then hands
 * off to the planner, which curates the actual door-to-door options.
 */
export function TripChatScreen({ navigation }: TripChatScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [homeCity, setHomeCity] = useState<string>();
  const [fields, setFields] = useState<TripRequestFields>({ ...EMPTY_REQUEST });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getProfile().then((p) => {
      setHomeCity(p.homeCity);
      setMessages([
        {
          id: 'hello',
          from: 'a2z',
          text:
            `Tell me what you need — for example: "I need to get from ${p.homeCity ?? 'New York'} to Boston next Friday morning, cheap, one bag, and I need a hotel."` +
            ' I will ask about anything you leave out.',
        },
      ]);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (text === '' || busy) return;
    setInput('');
    setBusy(true);
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, from: 'user', text }]);
    const { fields: parsed } = await parseTripMessage(text);
    const merged = mergeRequest(fields, parsed);
    setFields(merged);
    const ready = missingFields(merged, homeCity).length === 0;
    setMessages((prev) => [
      ...prev,
      { id: `a-${Date.now()}`, from: 'a2z', text: buildReply(merged, homeCity), readyToPlan: ready },
    ]);
    setBusy(false);
  };

  const curate = () => {
    const origin = fields.originCity ?? homeCity;
    if (!origin || !fields.destinationCity || !fields.dateIso) return;
    navigation.navigate('Planner', {
      origin: { address: origin, label: origin },
      destination: { address: fields.destinationCity, label: fields.destinationCity },
      importedDate: fields.dateIso,
      timeOfDay: fields.timeOfDay ?? undefined,
      travelers: fields.travelers ?? undefined,
      bags: fields.bags ?? undefined,
      preference: fields.preference ?? undefined,
      needHotel: fields.wantsHotel || undefined,
    });
  };

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back} accessibilityLabel="Back" accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Tell A2Z what you need</Text>
          <DataFreshnessBadge
            mode={chatAiConfigured() ? 'live' : 'estimate'}
            provider={chatAiConfigured() ? 'Claude' : 'Simple rules — no AI key configured'}
            lastVerifiedAt={chatAiConfigured() ? new Date().toISOString() : undefined}
          />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.thread}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {messages.map((m) => (
          <View key={m.id} style={[styles.bubbleRow, m.from === 'user' && styles.bubbleRowUser]}>
            <View style={[styles.bubble, m.from === 'user' ? styles.bubbleUser : styles.bubbleA2z]}>
              <Text style={[styles.bubbleText, m.from === 'user' && styles.bubbleTextUser]}>{m.text}</Text>
              {m.readyToPlan && (
                <AppButton label="Curate my options" icon="sparkles" small onPress={curate} style={styles.curateButton} />
              )}
            </View>
          </View>
        ))}
        {busy && <Text style={styles.thinking}>Reading that…</Text>}
      </ScrollView>

      <View style={[styles.inputRow, { paddingBottom: insets.bottom + spacing.md }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="I need to get to Boston on Friday…"
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={send}
          accessibilityLabel="Describe your trip"
        />
        <Pressable
          onPress={send}
          disabled={busy || input.trim() === ''}
          style={[styles.sendButton, (busy || input.trim() === '') && styles.sendDisabled]}
          accessibilityLabel="Send"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-up" size={19} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.heading, color: colors.ink, marginBottom: 3 },
  thread: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '86%',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleA2z: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleUser: { backgroundColor: colors.primary },
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bubbleTextUser: { color: '#FFFFFF' },
  curateButton: { marginTop: spacing.sm },
  thinking: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
