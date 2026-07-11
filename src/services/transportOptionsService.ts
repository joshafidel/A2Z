/**
 * Manual transportation comparison.
 *
 * The user enters the options they're considering (rideshare, train, own
 * car…) with their own duration/price numbers; a transparent local score
 * picks cheapest, fastest, and a recommended option weighted by the
 * traveler's priority. Provider URLs open in a new tab with "Continue
 * with provider" — A2Z never claims a booking happened.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TransportationPriority } from './preferencesService';

export type ManualTransportKind =
  | 'rideshare'
  | 'taxi'
  | 'public-transit'
  | 'drive'
  | 'walk'
  | 'other';

export const TRANSPORT_KIND_LABELS: Record<ManualTransportKind, string> = {
  rideshare: 'Rideshare',
  taxi: 'Taxi',
  'public-transit': 'Transit',
  drive: 'Drive / park',
  walk: 'Walk',
  other: 'Other',
};

export interface ManualTransportOption {
  id: string;
  tripId: string;
  kind: ManualTransportKind;
  providerName: string;
  durationMinutes: number;
  priceUsd?: number;
  url?: string;
  notes?: string;
}

export interface TransportComparison {
  cheapestId?: string;
  fastestId?: string;
  recommendedId?: string;
  /** Plain-English "why" for the recommended option. */
  explanation?: string;
}

// ---------------------------------------------------------------------------
// Scoring — normalized price/duration, weighted by the user's priority.
// ---------------------------------------------------------------------------

const WEIGHTS: Record<TransportationPriority, { price: number; time: number }> = {
  cheapest: { price: 0.8, time: 0.2 },
  fastest: { price: 0.2, time: 0.8 },
  balanced: { price: 0.5, time: 0.5 },
};

export function compareTransportOptions(
  options: ManualTransportOption[],
  priority: TransportationPriority,
): TransportComparison {
  if (options.length === 0) return {};

  const priced = options.filter((o) => o.priceUsd !== undefined);
  const cheapest =
    priced.length > 0
      ? priced.reduce((a, b) => ((a.priceUsd ?? 0) <= (b.priceUsd ?? 0) ? a : b))
      : undefined;
  const fastest = options.reduce((a, b) => (a.durationMinutes <= b.durationMinutes ? a : b));

  // Normalize to 0 (best) … 1 (worst) across the entered options.
  const prices = priced.map((o) => o.priceUsd ?? 0);
  const durations = options.map((o) => o.durationMinutes);
  const span = (v: number, arr: number[]) => {
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    return max === min ? 0 : (v - min) / (max - min);
  };
  const w = WEIGHTS[priority];
  let best: ManualTransportOption | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const o of options) {
    // Unknown price scores mid-pack on price rather than winning by omission.
    const priceScore = o.priceUsd !== undefined && prices.length > 0 ? span(o.priceUsd, prices) : 0.5;
    const timeScore = span(o.durationMinutes, durations);
    const score = priceScore * w.price + timeScore * w.time;
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }

  let explanation: string | undefined;
  if (best && options.length > 1) {
    // Compare against the strongest alternative on the OPPOSITE axis — the
    // option you'd probably pick otherwise ("$42 cheaper than the rideshare
    // and only 14 min slower").
    const others = options.filter((o) => o.id !== best!.id);
    const fastestOther = others.reduce((a, b) => (a.durationMinutes <= b.durationMinutes ? a : b));
    const cheapestOther =
      others.filter((o) => o.priceUsd !== undefined).sort((a, b) => (a.priceUsd ?? 0) - (b.priceUsd ?? 0))[0] ??
      others[0];
    const rival = best.id === fastest.id ? cheapestOther : fastestOther;
    const parts: string[] = [];
    if (best.priceUsd !== undefined && rival.priceUsd !== undefined && best.priceUsd !== rival.priceUsd) {
      const diff = Math.abs(rival.priceUsd - best.priceUsd);
      parts.push(best.priceUsd < rival.priceUsd ? `$${diff} cheaper than ${rival.providerName}` : `$${diff} more than ${rival.providerName}`);
    }
    if (best.durationMinutes !== rival.durationMinutes) {
      const diff = Math.abs(rival.durationMinutes - best.durationMinutes);
      parts.push(
        best.durationMinutes < rival.durationMinutes
          ? `${diff} min faster`
          : `only ${diff} min slower`,
      );
    }
    explanation =
      parts.length > 0
        ? `${best.providerName} is recommended because it is ${parts.join(' and ')} (using your numbers, "${priority}" priority).`
        : `${best.providerName} is recommended for your "${priority}" priority (using your numbers).`;
  }

  return {
    cheapestId: cheapest?.id,
    fastestId: fastest.id,
    recommendedId: best?.id,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Persistence — options live per trip in this browser.
// ---------------------------------------------------------------------------

const KEY = '@a2z/transport-options';

export async function getTransportOptions(tripId: string): Promise<ManualTransportOption[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, ManualTransportOption[]>) : {};
    return Array.isArray(all[tripId]) ? all[tripId] : [];
  } catch {
    return [];
  }
}

export async function addTransportOption(
  option: Omit<ManualTransportOption, 'id'>,
): Promise<ManualTransportOption[]> {
  const list = await getTransportOptions(option.tripId);
  const next = [...list, { ...option, id: `to-${Date.now()}-${list.length}` }];
  await persist(option.tripId, next);
  return next;
}

export async function removeTransportOption(
  tripId: string,
  optionId: string,
): Promise<ManualTransportOption[]> {
  const list = await getTransportOptions(tripId);
  const next = list.filter((o) => o.id !== optionId);
  await persist(tripId, next);
  return next;
}

async function persist(tripId: string, options: ManualTransportOption[]): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, ManualTransportOption[]>) : {};
    all[tripId] = options;
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // best effort
  }
}
