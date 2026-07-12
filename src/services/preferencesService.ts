/**
 * Traveler profile — browser-only preferences that shape every calculation
 * (departure engine, packing rules, transport comparison). Stored under a
 * single versioned key; corrupted or missing data falls back to defaults
 * field-by-field so a bad blob can never crash the app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type TransportationPriority = 'fastest' | 'cheapest' | 'balanced' | 'comfort';

/** How often the traveler checks a bag — shapes defaults and reminders. */
export type BagHabit = 'never' | 'sometimes' | 'usually' | 'always';

export const BAG_HABIT_LABELS: Record<BagHabit, string> = {
  never: 'Never — carry-on only',
  sometimes: 'Sometimes — depends on the trip',
  usually: 'Usually — most trips',
  always: 'Always — I check a bag',
};

export interface TravelerProfile {
  version: 1;
  /** Set once the first-run questions were answered (or skipped). */
  onboardingDone: boolean;
  /** Where the traveler usually starts from. */
  homeCity?: string;
  /** Preferred departing airport (IATA code, e.g. "JFK"). */
  homeAirportCode?: string;
  /** Departing airports in preference order (1st = favorite). */
  airportRanking?: string[];
  /** Bag-check habit; usuallyChecksBag stays in sync for older code. */
  bagHabit?: BagHabit;
  temperatureUnit: 'fahrenheit' | 'celsius';
  currency: string; // ISO code, display only
  hasTsaPrecheck: boolean;
  hasClear: boolean;
  usuallyChecksBag: boolean;
  /** Default airport lead time for domestic flights (minutes). */
  domesticBufferMinutes: number;
  /** Default airport lead time for international flights (minutes). */
  internationalBufferMinutes: number;
  /** Extra slack added on top of travel time (minutes). */
  trafficUncertaintyMinutes: number;
  transportationPriority: TransportationPriority;
}

export const DEFAULT_PROFILE: TravelerProfile = {
  version: 1,
  onboardingDone: false,
  temperatureUnit: 'fahrenheit',
  currency: 'USD',
  hasTsaPrecheck: false,
  hasClear: false,
  usuallyChecksBag: false,
  domesticBufferMinutes: 120,
  internationalBufferMinutes: 180,
  trafficUncertaintyMinutes: 15,
  transportationPriority: 'balanced',
};

const KEY = '@a2z/traveler-profile';

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Coerce an unknown stored blob into a valid profile — never throws. */
export function sanitizeProfile(raw: unknown): TravelerProfile {
  const d = DEFAULT_PROFILE;
  if (typeof raw !== 'object' || raw === null) return { ...d };
  const r = raw as Record<string, unknown>;
  return {
    version: 1,
    onboardingDone: bool(r.onboardingDone, d.onboardingDone),
    homeCity:
      typeof r.homeCity === 'string' && r.homeCity.trim() !== '' ? r.homeCity.trim() : undefined,
    homeAirportCode:
      typeof r.homeAirportCode === 'string' && /^[A-Za-z]{3}$/.test(r.homeAirportCode.trim())
        ? r.homeAirportCode.trim().toUpperCase()
        : undefined,
    airportRanking: Array.isArray(r.airportRanking)
      ? (r.airportRanking as unknown[])
          .filter((c): c is string => typeof c === 'string' && /^[A-Za-z]{3}$/.test(c))
          .map((c) => c.toUpperCase())
          .slice(0, 6)
      : undefined,
    bagHabit:
      r.bagHabit === 'never' || r.bagHabit === 'sometimes' || r.bagHabit === 'usually' || r.bagHabit === 'always'
        ? r.bagHabit
        : undefined,
    temperatureUnit: r.temperatureUnit === 'celsius' ? 'celsius' : 'fahrenheit',
    currency: typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency) ? r.currency : d.currency,
    hasTsaPrecheck: bool(r.hasTsaPrecheck, d.hasTsaPrecheck),
    hasClear: bool(r.hasClear, d.hasClear),
    usuallyChecksBag: bool(r.usuallyChecksBag, d.usuallyChecksBag),
    domesticBufferMinutes: num(r.domesticBufferMinutes, d.domesticBufferMinutes, 75, 360),
    internationalBufferMinutes: num(r.internationalBufferMinutes, d.internationalBufferMinutes, 120, 420),
    trafficUncertaintyMinutes: num(r.trafficUncertaintyMinutes, d.trafficUncertaintyMinutes, 0, 90),
    transportationPriority:
      r.transportationPriority === 'fastest' ||
      r.transportationPriority === 'cheapest' ||
      r.transportationPriority === 'comfort'
        ? r.transportationPriority
        : 'balanced',
  };
}

export async function getProfile(): Promise<TravelerProfile> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? sanitizeProfile(JSON.parse(raw)) : { ...DEFAULT_PROFILE };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveProfile(profile: TravelerProfile): Promise<boolean> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(sanitizeProfile(profile)));
    return true;
  } catch {
    return false;
  }
}
