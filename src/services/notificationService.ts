/**
 * Trip reminder notifications.
 *
 * Builds a reminder schedule from the saved trip's timeline: when to start
 * walking, when to call your Uber, when boarding starts — each fired ahead
 * of time with a grace period that is both built in and stated in the
 * message, so travelers know how much slack they actually have.
 *
 * WEB: uses the browser Notification API with in-session timers (fires
 * while the site is open; a production build would move this to a service
 * worker + Push API).
 * NATIVE (REAL API): swap `deliver`/`scheduleTimer` for expo-notifications'
 * `scheduleNotificationAsync` with a date trigger — the schedule builder
 * below is platform-independent and already returns exact fire times.
 */

import type { SavedTrip, TimelineStep, TransportMode } from '../types';
import { formatTime } from '../utils/time';

export interface TripReminder {
  id: string;
  fireAt: string; // ISO — when the notification fires
  stepTime: string; // ISO — when the step actually happens
  graceMinutes: number; // slack between reminder and hard deadline
  title: string;
  body: string;
  mode: TransportMode;
}

/** Lead time (minutes before the step) per mode of action. */
function leadMinutesFor(step: TimelineStep): number {
  switch (step.mode) {
    case 'walk':
      return 10; // "start walking soon"
    case 'rideshare':
    case 'drive':
      return 12; // request the car before you need to leave
    case 'flight':
      return 30; // boarding prep
    case 'train':
    case 'bus':
      return 15;
    case 'wait':
      return 10;
    default:
      return 10;
  }
}

function actionText(step: TimelineStep): { title: string; action: string } {
  switch (step.mode) {
    case 'walk':
      return { title: 'Time to start walking', action: `Head out for: ${step.title}` };
    case 'rideshare':
      return { title: 'Call your ride now', action: `Request your car for: ${step.title}` };
    case 'drive':
      return { title: 'Get ready to drive', action: step.title };
    case 'flight':
      return { title: 'Boarding soon', action: step.title };
    case 'train':
    case 'bus':
      return { title: 'Departure coming up', action: step.title };
    case 'wait':
      return { title: 'Checkpoint ahead', action: step.title };
    default:
      return { title: 'Next step', action: step.title };
  }
}

/**
 * Pure schedule builder (unit-tested): one reminder per critical timeline
 * step that is still in the future, with grace periods stated in the copy.
 */
export function buildReminderSchedule(trip: SavedTrip, now: Date = new Date()): TripReminder[] {
  const reminders: TripReminder[] = [];

  for (const step of trip.route.timeline) {
    if (step.emphasis !== 'critical' && step.mode !== 'walk' && step.mode !== 'rideshare') continue;

    const lead = leadMinutesFor(step);
    const stepAt = new Date(step.time);
    const fireAt = new Date(stepAt.getTime() - lead * 60_000);
    if (fireAt.getTime() <= now.getTime()) continue; // already passed

    const { title, action } = actionText(step);
    reminders.push({
      id: `rem-${trip.id}-${step.id}`,
      fireAt: fireAt.toISOString(),
      stepTime: step.time,
      graceMinutes: lead,
      title,
      body: `${action} — due ${formatTime(step.time)}. You have a ${lead}-min grace period from this alert.${step.warning ? ` ⚠ ${step.warning}` : ''}`,
      mode: step.mode,
    });
  }

  reminders.sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime());
  return reminders;
}

// ---------------------------------------------------------------------------
// Delivery (web)
// ---------------------------------------------------------------------------

type NotificationCtor = typeof globalThis extends { Notification: infer N } ? N : never;

function webNotification(): (NotificationCtor & { permission: string; requestPermission(): Promise<string> }) | undefined {
  const n = (globalThis as Record<string, unknown>).Notification;
  return typeof n === 'function'
    ? (n as NotificationCtor & { permission: string; requestPermission(): Promise<string> })
    : undefined;
}

export function notificationsSupported(): boolean {
  return Boolean(webNotification());
}

export async function requestNotificationPermission(): Promise<boolean> {
  const N = webNotification();
  if (!N) return false;
  if (N.permission === 'granted') return true;
  if (N.permission === 'denied') return false;
  const result = await N.requestPermission();
  return result === 'granted';
}

const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function deliver(reminder: TripReminder): void {
  const N = webNotification();
  if (N && N.permission === 'granted') {
    // eslint-disable-next-line no-new -- side-effectful constructor is the Notification API
    new (N as unknown as new (title: string, options?: { body?: string; tag?: string }) => unknown)(
      reminder.title,
      { body: reminder.body, tag: reminder.id },
    );
  }
}

/**
 * Arm timers for every upcoming reminder. Returns the schedule so the UI
 * can display it. Re-arming for the same trip clears previous timers.
 *
 * REAL API (native): replace the setTimeout loop with
 * Notifications.scheduleNotificationAsync({ trigger: { date: fireAt } }).
 */
export function scheduleTripReminders(trip: SavedTrip): TripReminder[] {
  cancelTripReminders(trip.id);
  const schedule = buildReminderSchedule(trip);
  for (const reminder of schedule) {
    const delay = new Date(reminder.fireAt).getTime() - Date.now();
    // Browser timers cap around 24.8 days; anything longer re-arms on next visit.
    if (delay > 0 && delay < 2_147_000_000) {
      activeTimers.set(
        reminder.id,
        setTimeout(() => {
          deliver(reminder);
          activeTimers.delete(reminder.id);
        }, delay),
      );
    }
  }
  return schedule;
}

export function cancelTripReminders(tripId: string): void {
  for (const [id, timer] of activeTimers) {
    if (id.startsWith(`rem-${tripId}-`)) {
      clearTimeout(timer);
      activeTimers.delete(id);
    }
  }
}
