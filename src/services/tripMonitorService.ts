/**
 * Client-side trip monitoring (the Phase 12 engine, scoped to what a
 * serverless static app can honestly do: it runs while the app is open).
 *
 * Each poll of live data produces a snapshot; meaningful differences from
 * the previous snapshot become plain-English change events ("Flight
 * departure moved from 6:05 PM to 6:42 PM", "Gate changed from B12 to
 * C4"), persisted per trip so the "What changed" card survives reloads.
 * Small wobbles below the thresholds are ignored — no notification spam.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TripSnapshot {
  flightStatus?: string;
  flightEstimatedIso?: string | null;
  gate?: string | null;
  tsaWaitMinutes?: number;
}

export interface TripChange {
  at: string; // ISO
  message: string;
}

interface StoredMonitor {
  snapshot: TripSnapshot;
  changes: TripChange[];
}

const KEY = '@a2z/trip-monitor';
const DELAY_THRESHOLD_MIN = 10;
const TSA_THRESHOLD_MIN = 10;
const MAX_LOG = 6;

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Compare two snapshots → the plain-English changes worth telling the user. */
export function diffSnapshots(prev: TripSnapshot, next: TripSnapshot): string[] {
  const messages: string[] = [];

  if (prev.flightStatus && next.flightStatus && prev.flightStatus !== next.flightStatus) {
    messages.push(`Flight status changed from ${prev.flightStatus} to ${next.flightStatus}.`);
  }

  if (prev.flightEstimatedIso && next.flightEstimatedIso) {
    const delta = Math.round(
      (new Date(next.flightEstimatedIso).getTime() - new Date(prev.flightEstimatedIso).getTime()) /
        60_000,
    );
    if (Math.abs(delta) >= DELAY_THRESHOLD_MIN) {
      messages.push(
        `Flight departure moved from ${fmt(prev.flightEstimatedIso)} to ${fmt(next.flightEstimatedIso)}.`,
      );
    }
  }

  if (prev.gate && next.gate && prev.gate !== next.gate) {
    messages.push(`Gate changed from ${prev.gate} to ${next.gate}.`);
  }

  if (
    prev.tsaWaitMinutes !== undefined &&
    next.tsaWaitMinutes !== undefined &&
    Math.abs(next.tsaWaitMinutes - prev.tsaWaitMinutes) >= TSA_THRESHOLD_MIN
  ) {
    const dir = next.tsaWaitMinutes > prev.tsaWaitMinutes ? 'grew' : 'shrank';
    messages.push(
      `The security line ${dir} from ~${prev.tsaWaitMinutes} to ~${next.tsaWaitMinutes} minutes — ` +
        (dir === 'grew' ? 'leave earlier.' : 'you have more slack.'),
    );
  }

  return messages;
}

/**
 * Append a user-driven change ("Departure changed from 6:05 PM to 6:42 PM…")
 * to a trip's What-changed log. Used when the user edits trip inputs; the
 * snapshot diff path below handles live-data changes.
 */
export async function recordManualChange(tripId: string, message: string): Promise<TripChange[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, StoredMonitor>) : {};
    const prev = all[tripId] ?? { snapshot: {}, changes: [] };
    const changes = [{ at: new Date().toISOString(), message }, ...prev.changes].slice(0, MAX_LOG);
    all[tripId] = { ...prev, changes };
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
    return changes;
  } catch {
    return [];
  }
}

/** Read a trip's What-changed log without recording anything. */
export async function getChangeLog(tripId: string): Promise<TripChange[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, StoredMonitor>) : {};
    return all[tripId]?.changes ?? [];
  } catch {
    return [];
  }
}

/**
 * Record the latest snapshot for a trip and return the running change log
 * (newest first). Idempotent for unchanged data: no new entries, no spam.
 */
export async function recordSnapshot(tripId: string, next: TripSnapshot): Promise<TripChange[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, StoredMonitor>) : {};
    const prev = all[tripId];
    const newMessages = prev ? diffSnapshots(prev.snapshot, next) : [];
    const at = new Date().toISOString();
    const changes = [
      ...newMessages.map((message) => ({ at, message })),
      ...(prev?.changes ?? []),
    ].slice(0, MAX_LOG);
    all[tripId] = {
      // Merge so a poll that lacks one field doesn't erase its history.
      snapshot: { ...prev?.snapshot, ...next },
      changes,
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
    return changes;
  } catch {
    return [];
  }
}
