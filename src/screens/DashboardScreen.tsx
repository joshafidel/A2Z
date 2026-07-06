import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { BookingLinks } from '../components/BookingLinks';
import { Card } from '../components/Card';
import { MapPreview } from '../components/MapPreview';
import { ModeIcon } from '../components/ModeIcon';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState } from '../components/States';
import { TimelineView } from '../components/TimelineView';
import { WarningList } from '../components/WarningList';
import { useTrip } from '../context/TripContext';
import {
  cancelTripReminders,
  notificationsSupported,
  requestNotificationPermission,
  scheduleTripReminders,
  type TripReminder,
} from '../services/notificationService';
import { colors, radii, spacing, typography } from '../theme';
import type { SavedTrip, TimelineStep } from '../types';
import { formatCountdown, formatDate, formatDuration, formatMoney, formatTime } from '../utils/time';

/** Trip dashboard: the "during travel" home for the chosen route. */
export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { savedTrips, activeTrip, setActiveTrip, deleteTrip } = useTrip();

  // Re-render every 30s so the countdown stays fresh.
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Trip reminders (walk now / call your Uber / boarding soon).
  const [remindersOn, setRemindersOn] = useState(false);
  const [reminders, setReminders] = useState<TripReminder[]>([]);
  const [reminderError, setReminderError] = useState<string>();

  useEffect(() => {
    // Re-arm when the active trip changes while reminders are on.
    if (remindersOn && activeTrip) {
      setReminders(scheduleTripReminders(activeTrip));
    }
  }, [remindersOn, activeTrip]);

  const toggleReminders = async () => {
    setReminderError(undefined);
    if (remindersOn) {
      if (activeTrip) cancelTripReminders(activeTrip.id);
      setRemindersOn(false);
      setReminders([]);
      return;
    }
    if (!notificationsSupported()) {
      setReminderError('Notifications are not supported in this browser.');
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      setReminderError('Notification permission was denied — enable it in your browser settings.');
      return;
    }
    setRemindersOn(true);
  };

  const nextStep: TimelineStep | undefined = useMemo(() => {
    if (!activeTrip) return undefined;
    return (
      activeTrip.route.timeline.find((s) => new Date(s.time) > now) ??
      activeTrip.route.timeline[activeTrip.route.timeline.length - 1]
    );
  }, [activeTrip, now]);

  if (!activeTrip) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top }]}>
        <EmptyState
          icon="briefcase-outline"
          title="No trips yet"
          message="Plan a trip and save your favorite route — it will live here with a countdown, timeline, and backup plans."
        />
      </View>
    );
  }

  const route = activeTrip.route;
  const leaveCountdown = formatCountdown(route.recommendedLeaveTime, now);
  const highWarnings = route.warnings.filter((w) => w.level !== 'low');

  const onReroute = () => {
    Alert.alert(
      'Emergency reroute',
      route.backupPlans.length > 0
        ? `Fastest fallbacks:\n\n${route.backupPlans
            .map((b) => `• ${b.title} — ${b.description}`)
            .join('\n\n')}`
        : 'No backup plans stored for this route. Run a new search from the Plan tab.',
      [{ text: 'Got it' }],
    );
  };

  const onDelete = (trip: SavedTrip) => {
    Alert.alert('Remove trip?', `${trip.search.origin.label ?? 'Origin'} → ${trip.search.destination.label}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteTrip(trip.id) },
    ]);
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>My Trip</Text>

      {/* Countdown hero */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>LEAVE {leaveCountdown === 'now' ? 'NOW' : leaveCountdown.toUpperCase()}</Text>
        <Text style={styles.heroTitle}>
          {activeTrip.search.origin.label ?? 'Home'} → {activeTrip.search.destination.label}
        </Text>
        <Text style={styles.heroMeta}>
          {formatDate(route.departureTime)} · {route.title} · {formatDuration(route.totalDurationMinutes)} ·{' '}
          {formatMoney(route.totalPriceUsd)}
        </Text>

        {nextStep && (
          <View style={styles.nextStep}>
            <ModeIcon mode={nextStep.mode} size={16} />
            <View style={styles.flex}>
              <Text style={styles.nextStepLabel}>NEXT STEP · {formatTime(nextStep.time)}</Text>
              <Text style={styles.nextStepTitle}>{nextStep.title}</Text>
              {nextStep.subtitle ? (
                <Text style={styles.nextStepSubtitle}>{nextStep.subtitle}</Text>
              ) : null}
            </View>
          </View>
        )}
      </View>

      {highWarnings.length > 0 && <WarningList warnings={highWarnings} />}

      <MapPreview route={route} />

      <Card>
        <SectionHeader title="Timeline" subtitle={`Arrive by ${formatTime(route.arrivalTime)}`} />
        <TimelineView steps={route.timeline} />
      </Card>

      {/* Chosen stay */}
      {activeTrip.hotel && (
        <Card>
          <SectionHeader title="Your stay" subtitle={activeTrip.hotel.distanceLabel} />
          <View style={styles.hotelRow}>
            <View style={styles.flex}>
              <Text style={styles.hotelName}>{activeTrip.hotel.name}</Text>
              <Text style={styles.hotelMeta}>
                {activeTrip.hotel.area} · ★ {activeTrip.hotel.rating.toFixed(1)} · $
                {activeTrip.hotel.pricePerNightUsd}/night
              </Text>
            </View>
            <AppButton
              label="Book"
              icon="bed"
              variant="secondary"
              small
              onPress={() => Linking.openURL(activeTrip.hotel!.bookingUrl)}
            />
          </View>
        </Card>
      )}

      {/* Trip reminders */}
      <Card>
        <View style={styles.reminderHeader}>
          <View style={styles.flex}>
            <Text style={styles.reminderTitle}>Trip reminders</Text>
            <Text style={styles.reminderSubtitle}>
              Alerts for when to start walking, call your ride, and board — each with a stated
              grace period.
            </Text>
          </View>
          <AppButton
            label={remindersOn ? 'On' : 'Turn on'}
            icon={remindersOn ? 'notifications' : 'notifications-outline'}
            variant={remindersOn ? 'primary' : 'secondary'}
            small
            onPress={toggleReminders}
          />
        </View>
        {reminderError ? <Text style={styles.reminderError}>{reminderError}</Text> : null}
        {remindersOn && reminders.length === 0 && (
          <Text style={styles.reminderEmpty}>
            All of this trip's steps are in the past — reminders will arm for your next trip.
          </Text>
        )}
        {remindersOn &&
          reminders.slice(0, 4).map((r) => (
            <View key={r.id} style={styles.reminderRow}>
              <ModeIcon mode={r.mode} size={13} />
              <View style={styles.flex}>
                <Text style={styles.reminderRowTitle}>
                  {formatTime(r.fireAt)} — {r.title}
                </Text>
                <Text style={styles.reminderRowMeta}>
                  step due {formatTime(r.stepTime)} · {r.graceMinutes} min grace period
                </Text>
              </View>
            </View>
          ))}
      </Card>

      <Card>
        <SectionHeader title="Tickets & apps" />
        <BookingLinks links={route.bookingLinks} />
      </Card>

      <Card>
        <SectionHeader title="Backup options" subtitle="Ready if something slips" />
        <View style={styles.backupStack}>
          {route.backupPlans.map((b) => (
            <View key={b.id} style={styles.backupRow}>
              <ModeIcon mode={b.mode} size={14} />
              <View style={styles.flex}>
                <Text style={styles.backupTitle}>{b.title}</Text>
                <Text style={styles.backupDesc}>{b.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <AppButton label="Emergency reroute" icon="alert-circle" variant="danger" onPress={onReroute} />

      {/* Other saved trips */}
      {savedTrips.length > 1 && (
        <View style={styles.savedSection}>
          <SectionHeader title="Saved trips" subtitle="Tap to make active · long-press to remove" />
          {savedTrips.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setActiveTrip(t)}
              onLongPress={() => onDelete(t)}
              style={({ pressed }) => [
                styles.savedRow,
                t.id === activeTrip.id && styles.savedRowActive,
                pressed && styles.pressed,
              ]}
            >
              <ModeIcon mode={t.route.primaryMode} size={15} />
              <View style={styles.flex}>
                <Text style={styles.savedTitle}>
                  {t.search.origin.label ?? 'Origin'} → {t.search.destination.label}
                </Text>
                <Text style={styles.savedMeta}>
                  {formatDate(t.route.departureTime)} · {t.route.title} ·{' '}
                  {formatMoney(t.route.totalPriceUsd)}
                </Text>
              </View>
              {t.id === activeTrip.id && (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              )}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  screenTitle: { ...typography.hero, color: colors.ink },
  heroCard: {
    backgroundColor: colors.navy,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  heroLabel: {
    color: '#8FA4FF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  heroTitle: { ...typography.title, color: colors.textOnDark },
  heroMeta: { fontSize: 13, color: colors.textOnDarkMuted, lineHeight: 18 },
  nextStep: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  nextStepLabel: { fontSize: 10, fontWeight: '800', color: '#8FA4FF', letterSpacing: 0.8 },
  nextStepTitle: { fontSize: 15, fontWeight: '700', color: colors.textOnDark, marginTop: 2 },
  nextStepSubtitle: { fontSize: 12, color: colors.textOnDarkMuted, marginTop: 2 },
  backupStack: { gap: spacing.md },
  backupRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  backupTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  backupDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  hotelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hotelName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  hotelMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  reminderHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reminderTitle: { ...typography.heading, color: colors.ink },
  reminderSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  reminderError: { fontSize: 12, fontWeight: '600', color: colors.danger, marginTop: spacing.sm },
  reminderEmpty: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  reminderRowTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  reminderRowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  savedSection: { gap: spacing.sm },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  savedRowActive: { borderColor: colors.primary, borderWidth: 2 },
  pressed: { opacity: 0.8 },
  savedTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  savedMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
