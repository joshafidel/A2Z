/**
 * Living timeline (Step 1 of the client-side travel-OS brief).
 *
 * Derives the full day-of-travel timeline from a saved trip — packing,
 * check-in, leave home, airport cutoffs, boarding, the journey itself,
 * hotel check-in — as a PURE function of the trip + clock, with stable
 * IDs so re-deriving never duplicates items. A small AsyncStorage map
 * remembers each item's last time so genuine moves (≥5 min) surface as
 * status "changed" with the previous time attached.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SavedTrip, TransportMode } from '../types';

export type LivingStatus = 'completed' | 'now' | 'next' | 'upcoming' | 'changed';

export interface LivingTimelineItem {
  id: string; // stable: `${tripId}:<key>` — derivation is idempotent
  time: string; // ISO
  title: string;
  explanation: string;
  status: LivingStatus;
  source: string; // 'Your ticket', 'Departure engine', 'Flight status'…
  actionRequired: boolean;
  mode: TransportMode;
  /** Set when this item's time moved since the last derivation. */
  previousTime?: string;
}

const minutes = (iso: string, delta: number) =>
  new Date(new Date(iso).getTime() + delta * 60_000).toISOString();

/**
 * Derive every timeline item for a trip. Pure: same trip (+ flight
 * estimate) always yields the same items with the same IDs.
 */
export function deriveLivingTimeline(
  trip: SavedTrip,
  opts: { flightEstimatedIso?: string } = {},
): Omit<LivingTimelineItem, 'status'>[] {
  const { route, search, hotel } = trip;
  const id = (key: string) => `${trip.id}:${key}`;
  const items: Omit<LivingTimelineItem, 'status'>[] = [];

  // Packing: the evening before (16h out) — pairs with the packing list.
  items.push({
    id: id('packing'),
    time: minutes(route.departureTime, -16 * 60),
    title: 'Finish packing',
    explanation: 'Work through the packing list below and check items off.',
    source: 'Packing list',
    actionRequired: true,
    mode: 'walk',
  });

  const flightSeg = route.segments.find((s) => s.mode === 'flight');
  if (flightSeg) {
    const scheduledDep = flightSeg.departureTime;
    const estimate = opts.flightEstimatedIso;
    const useEstimate =
      estimate !== undefined &&
      Math.abs(new Date(estimate).getTime() - new Date(scheduledDep).getTime()) >= 10 * 60_000;
    // Boarding/departure follow a verified estimate; check-in and bag-drop
    // cutoffs stay anchored to the SCHEDULED time — airlines enforce them
    // against the schedule, and delays get clawed back.
    const effectiveDep = useEstimate ? estimate : scheduledDep;

    items.push({
      id: id('checkin'),
      time: minutes(scheduledDep, -24 * 60),
      title: `Check in for ${flightSeg.provider ?? 'your flight'} ${flightSeg.vehicleId ?? ''}`.trim(),
      explanation: 'Online check-in opens 24 hours before departure.',
      source: 'Your ticket',
      actionRequired: true,
      mode: 'flight',
    });
    if (search.bags > 0) {
      items.push({
        id: id('bagdrop'),
        time: minutes(scheduledDep, -45),
        title: 'Bag-drop cutoff',
        explanation: `Checked bags must be dropped 45 min before the scheduled departure — ${search.bags} bag${search.bags === 1 ? '' : 's'} on this trip.`,
        source: 'Your ticket',
        actionRequired: true,
        mode: 'flight',
      });
    }
    items.push({
      id: id('boarding'),
      time: minutes(effectiveDep, -35),
      title: 'Boarding begins',
      explanation: useEstimate
        ? 'Based on the live estimated departure.'
        : 'Typically 35 minutes before departure.',
      source: useEstimate ? 'Flight status' : 'Your ticket',
      actionRequired: false,
      mode: 'flight',
    });
  }

  // The door-to-door journey steps computed by the trip builder — these
  // carry stable ids already (part of the saved route).
  for (const step of route.timeline) {
    items.push({
      id: id(`route:${step.id}`),
      time: step.time,
      title: step.title,
      explanation: step.subtitle ?? '',
      source: step.title.toLowerCase().includes('leave') ? 'Departure engine' : 'Trip plan',
      actionRequired: step.emphasis === 'critical',
      mode: step.mode,
    });
  }

  if (hotel) {
    items.push({
      id: id('hotel-checkin'),
      time: minutes(route.arrivalTime, 45),
      title: `Check in at ${hotel.name}`,
      explanation: hotel.distanceLabel,
      source: 'Hotel',
      actionRequired: false,
      mode: 'walk',
    });
  }

  // Stable order + de-dup by id (idempotent regardless of caller behavior).
  const seen = new Map<string, Omit<LivingTimelineItem, 'status'>>();
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

/** Assign completed / now / next / upcoming given the current clock. */
export function assignStatuses(
  items: Array<Omit<LivingTimelineItem, 'status'> & { previousTime?: string }>,
  now: Date = new Date(),
): LivingTimelineItem[] {
  const nowMs = now.getTime();
  const firstFutureIdx = items.findIndex((i) => new Date(i.time).getTime() > nowMs);
  return items.map((item, idx) => {
    let status: LivingStatus;
    if (firstFutureIdx === -1) {
      // Everything is in the past; the last item is "now", rest completed.
      status = idx === items.length - 1 ? 'now' : 'completed';
    } else if (idx < firstFutureIdx - 1) {
      status = 'completed';
    } else if (idx === firstFutureIdx - 1) {
      status = 'now';
    } else if (idx === firstFutureIdx) {
      status = 'next';
    } else {
      status = 'upcoming';
    }
    // A moved time outranks upcoming/next so changes are visible — but a
    // finished step stays finished.
    if (item.previousTime && status !== 'completed' && status !== 'now') {
      status = 'changed';
    }
    return { ...item, status };
  });
}

// ---------------------------------------------------------------------------
// Change tracking: remember each item's last time; ≥5-min moves surface.
// ---------------------------------------------------------------------------

const TIMES_KEY = '@a2z/timeline-times';
const CHANGE_THRESHOLD_MS = 5 * 60_000;
const MOVE_VISIBLE_MS = 48 * 60 * 60_000; // a move stays visible for 48h

interface TrackedTrip {
  /** Last seen time per item id. */
  times: Record<string, string>;
  /** Recorded moves: original time + when the move was first noticed. */
  moves: Record<string, { from: string; at: string }>;
}

export async function withChangeTracking(
  tripId: string,
  items: Omit<LivingTimelineItem, 'status'>[],
): Promise<Array<Omit<LivingTimelineItem, 'status'> & { previousTime?: string }>> {
  try {
    const raw = await AsyncStorage.getItem(TIMES_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, TrackedTrip>) : {};
    const track: TrackedTrip = all[tripId] ?? { times: {}, moves: {} };
    const nowIso = new Date().toISOString();

    const result = items.map((item) => {
      const prev = track.times[item.id];
      if (
        prev !== undefined &&
        Math.abs(new Date(prev).getTime() - new Date(item.time).getTime()) >= CHANGE_THRESHOLD_MS &&
        !track.moves[item.id] // keep the ORIGINAL time if it moves again
      ) {
        track.moves[item.id] = { from: prev, at: nowIso };
      }
      track.times[item.id] = item.time;

      const move = track.moves[item.id];
      const moveStillRelevant =
        move !== undefined &&
        Date.now() - new Date(move.at).getTime() < MOVE_VISIBLE_MS &&
        Math.abs(new Date(move.from).getTime() - new Date(item.time).getTime()) >=
          CHANGE_THRESHOLD_MS;
      if (move && !moveStillRelevant) delete track.moves[item.id]; // settled back / aged out
      return moveStillRelevant ? { ...item, previousTime: move.from } : item;
    });

    all[tripId] = track;
    await AsyncStorage.setItem(TIMES_KEY, JSON.stringify(all));
    return result;
  } catch {
    return items;
  }
}

/** Clear stored times (used when a trip is deleted). */
export async function clearTimelineTracking(tripId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(TIMES_KEY);
    if (!raw) return;
    const all = JSON.parse(raw) as Record<string, Record<string, string>>;
    delete all[tripId];
    await AsyncStorage.setItem(TIMES_KEY, JSON.stringify(all));
  } catch {
    // best effort
  }
}

/** The single most urgent thing + the most recent change, for the header. */
export function headlineFor(items: LivingTimelineItem[]): {
  current?: LivingTimelineItem;
  changed?: LivingTimelineItem;
} {
  const current = items.find((i) => i.status === 'now') ?? items.find((i) => i.status === 'next');
  const changed = items.find((i) => i.status === 'changed');
  return { current, changed };
}
