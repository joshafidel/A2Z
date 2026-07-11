/**
 * Trip advice — deterministic, rule-based recommendations with stable IDs.
 *
 * No AI, no network: every rule reads the trip (and optional weather) and
 * produces a title / recommendation / reason. The user accepts or
 * dismisses each one; decisions persist and dismissed advice can be
 * restored. Accepting may carry a small local effect (add a packing item
 * or a timeline reminder) that the caller applies.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SavedTrip, WeatherCondition } from '../types';

export type AdviceEffect =
  | { type: 'packing'; name: string; reason: string }
  | { type: 'timeline'; title: string; timeIso: string; explanation: string }
  | { type: 'none' };

export interface TripAdvice {
  id: string; // stable: `${tripId}:advice:<key>` — regeneration never duplicates
  kind: 'departure-time' | 'weather' | 'packing' | 'transportation' | 'general';
  title: string;
  recommendation: string;
  reason: string;
  /** What accepting does locally (shown on the button). */
  effect: AdviceEffect;
  acceptLabel: string;
}

export type AdviceDecision = 'accepted' | 'dismissed';

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function generateAdvice(
  trip: SavedTrip,
  opts: { weather?: WeatherCondition; transportOptionCount?: number } = {},
): TripAdvice[] {
  const id = (key: string) => `${trip.id}:advice:${key}`;
  const advice: TripAdvice[] = [];
  const m = trip.manual;
  const wx = opts.weather;
  const dep = trip.route.departureTime;

  if (wx && wx.precipChance >= 40) {
    advice.push({
      id: id('rain'),
      kind: 'weather',
      title: 'Rain is likely at your destination',
      recommendation: 'Pack an umbrella or rain shell.',
      reason: `The forecast shows a ${Math.round(wx.precipChance)}% chance of rain (${wx.summary}).`,
      effect: { type: 'packing', name: 'Compact umbrella or rain shell', reason: 'Rain in the forecast' },
      acceptLabel: 'Add to packing list',
    });
  }

  if (m?.isInternational) {
    advice.push({
      id: id('intl-docs'),
      kind: 'general',
      title: 'International trip — check your passport',
      recommendation: 'Confirm your passport is valid (many countries require 6 months past your return) and check entry requirements.',
      reason: 'You marked this trip international.',
      effect: { type: 'packing', name: 'Passport', reason: 'International trip' },
      acceptLabel: 'Add passport to packing list',
    });
  }

  if (m && !m.endsAt) {
    advice.push({
      id: id('missing-return'),
      kind: 'general',
      title: 'No return date on this trip',
      recommendation: 'Add an end date so packing quantities and the hotel timeline are right.',
      reason: 'Trip length drives the packing list and checkout reminders.',
      effect: { type: 'none' },
      acceptLabel: 'Got it',
    });
  }

  if (m && (opts.transportOptionCount ?? 0) === 0) {
    advice.push({
      id: id('no-transport'),
      kind: 'transportation',
      title: 'No plan for getting from the destination airport',
      recommendation: 'Add a transportation option or two below and compare them.',
      reason: 'Arriving without a plan usually means the most expensive option.',
      effect: { type: 'none' },
      acceptLabel: 'Got it',
    });
  }

  if (m?.checkedBag) {
    advice.push({
      id: id('bag-cutoff'),
      kind: 'departure-time',
      title: 'Checked bag: mind the cutoff',
      recommendation: 'Most airlines close bag drop 45 minutes before departure (60+ international). The leave-time estimate already includes bag time.',
      reason: 'You are checking a bag on this trip.',
      effect: { type: 'none' },
      acceptLabel: 'Got it',
    });
  }

  const bufferMin = m?.departure.airportBufferMinutes;
  if (bufferMin !== undefined && bufferMin < (m?.isInternational ? 150 : 90)) {
    advice.push({
      id: id('short-buffer'),
      kind: 'departure-time',
      title: 'Your airport buffer is tight',
      recommendation: `You set a ${bufferMin}-minute airport buffer. ${m?.isInternational ? 'International check-in and documents often need 150+.' : 'Security lines alone can eat 45 of those minutes.'}`,
      reason: 'A short buffer leaves no room for one slow line.',
      effect: { type: 'none' },
      acceptLabel: 'Got it',
    });
  }

  if (m && m.departure.estimatedTravelMinutes >= 90) {
    advice.push({
      id: id('long-travel'),
      kind: 'departure-time',
      title: 'Long ride to the airport',
      recommendation: `Your airport trip is ${m.departure.estimatedTravelMinutes} minutes — set a reminder 30 minutes before your leave time to wrap up.`,
      reason: 'Long airport runs are where surprise traffic hurts most.',
      effect: {
        type: 'timeline',
        title: 'Get ready to leave',
        timeIso: new Date(
          new Date(trip.route.recommendedLeaveTime).getTime() - 30 * 60_000,
        ).toISOString(),
        explanation: '30 minutes before your recommended leave time',
      },
      acceptLabel: 'Add reminder to timeline',
    });
  }

  const checkIn = m?.lodging?.checkInAt;
  if (checkIn && trip.route.arrivalTime) {
    const gapH = (new Date(checkIn).getTime() - new Date(trip.route.arrivalTime).getTime()) / 3_600_000;
    if (gapH >= 4) {
      advice.push({
        id: id('hotel-gap'),
        kind: 'general',
        title: `${Math.round(gapH)}-hour gap before hotel check-in`,
        recommendation: 'You land well before check-in. Plan for luggage: most hotels hold bags for free before check-in.',
        reason: `You arrive ${fmt(trip.route.arrivalTime)} but check-in is ${fmt(checkIn)}.`,
        effect: {
          type: 'timeline',
          title: 'Drop bags at the hotel',
          timeIso: new Date(new Date(trip.route.arrivalTime).getTime() + 60 * 60_000).toISOString(),
          explanation: 'Hotels usually hold luggage before check-in',
        },
        acceptLabel: 'Add to timeline',
      });
    }
  }

  if (dep && !m?.flight?.flightNumber && m) {
    advice.push({
      id: id('missing-flight'),
      kind: 'general',
      title: 'No flight number on this trip',
      recommendation: 'Add the airline and flight number (Edit trip) so check-in and boarding reminders name the right flight.',
      reason: 'Reminders are generic without it.',
      effect: { type: 'none' },
      acceptLabel: 'Got it',
    });
  }

  return advice;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Decisions — persisted per advice id; dismissed advice is restorable.
// ---------------------------------------------------------------------------

const KEY = '@a2z/advice-decisions';

export async function getAdviceDecisions(): Promise<Record<string, AdviceDecision>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out: Record<string, AdviceDecision> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === 'accepted' || v === 'dismissed') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export async function decideAdvice(
  adviceId: string,
  decision: AdviceDecision,
): Promise<Record<string, AdviceDecision>> {
  const all = await getAdviceDecisions();
  all[adviceId] = decision;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // best effort
  }
  return all;
}

/** Put a dismissed (or accepted) recommendation back in the active list. */
export async function restoreAdvice(adviceId: string): Promise<Record<string, AdviceDecision>> {
  const all = await getAdviceDecisions();
  delete all[adviceId];
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // best effort
  }
  return all;
}
