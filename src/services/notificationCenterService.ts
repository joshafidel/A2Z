/**
 * In-app notification center (Step 4).
 *
 * Notifications are UPSERTED BY TOPIC — five successive delay tweaks
 * become one updated notification, not five rows. Read/unread state and
 * severity persist in AsyncStorage. Browser push stays where it already
 * lives (flightStatusService.notifyFlightUpdate) — this is the in-app
 * record.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface AppNotification {
  /** Topic key doubles as the id: "flight-delay:trip-123". */
  id: string;
  tripId?: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  updatedAt: string;
  read: boolean;
  /** How many raw events were coalesced into this row. */
  updates: number;
  demo?: boolean;
}

const KEY = '@a2z/notifications';
const MAX = 30;

async function readAll(): Promise<AppNotification[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AppNotification[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: AppNotification[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify(
        [...list]
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, MAX),
      ),
    );
  } catch {
    // best effort
  }
}

/** Pure coalescing: same topic → one row, updated in place, marked unread. */
export function upsertNotification(
  list: AppNotification[],
  incoming: Omit<AppNotification, 'updatedAt' | 'read' | 'updates'>,
): AppNotification[] {
  const existing = list.find((n) => n.id === incoming.id);
  const updatedAt = new Date().toISOString();
  if (!existing) {
    return [{ ...incoming, updatedAt, read: false, updates: 1 }, ...list];
  }
  // Identical body → nothing new happened; leave read-state alone.
  if (existing.body === incoming.body && existing.severity === incoming.severity) return list;
  return list.map((n) =>
    n.id === incoming.id
      ? { ...n, ...incoming, updatedAt, read: false, updates: n.updates + 1 }
      : n,
  );
}

export async function pushNotification(
  incoming: Omit<AppNotification, 'updatedAt' | 'read' | 'updates'>,
): Promise<AppNotification[]> {
  const next = upsertNotification(await readAll(), incoming);
  await writeAll(next);
  return next;
}

export async function listNotifications(): Promise<AppNotification[]> {
  return readAll();
}

export async function markRead(id: string): Promise<AppNotification[]> {
  const next = (await readAll()).map((n) => (n.id === id ? { ...n, read: true } : n));
  await writeAll(next);
  return next;
}

export async function markAllRead(): Promise<AppNotification[]> {
  const next = (await readAll()).map((n) => ({ ...n, read: true }));
  await writeAll(next);
  return next;
}

export function unreadCount(list: AppNotification[]): number {
  return list.filter((n) => !n.read).length;
}

export async function clearDemoNotifications(): Promise<void> {
  const next = (await readAll()).filter((n) => !n.demo);
  await writeAll(next);
}
