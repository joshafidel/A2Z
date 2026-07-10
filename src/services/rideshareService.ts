/**
 * Rideshare estimate service — compares providers side by side:
 * Uber (UberX), Uber Shuttle (shared, airport routes), Lyft, Empower,
 * and metered taxi.
 *
 * MOCK: distance-based fare model calibrated to NYC/Boston/DC pricing,
 * with per-provider multipliers.
 *
 * REAL API: Uber's price-estimates endpoint requires a server token
 * (apiConfig.uberServerToken) and Lyft's cost endpoint an OAuth client
 * (apiConfig.lyftClientId); Empower exposes fares in-app only, so keep a
 * calibrated model or partner feed. All live calls should be proxied
 * through your backend — never ship server tokens in the app bundle.
 */

import type { ServiceResult } from '../types';
import { aiUberFareBand } from './aiService';
import { isLive, mockDelay } from './config';

/**
 * City price index vs the New York baseline — calibrated from published
 * per-mile/per-minute rate cards. Unknown cities ride at 0.8 (typical
 * mid-size US market).
 */
const CITY_COST_INDEX: Record<string, number> = {
  'New York': 1.0,
  'San Francisco': 0.98,
  Boston: 0.92,
  Seattle: 0.92,
  'Los Angeles': 0.88,
  Washington: 0.86,
  Chicago: 0.85,
  Philadelphia: 0.82,
  Miami: 0.8,
  Denver: 0.8,
  Atlanta: 0.78,
  'Las Vegas': 0.78,
  Austin: 0.78,
  Dallas: 0.76,
  Houston: 0.76,
  Phoenix: 0.75,
};

export interface RideEstimate {
  provider: string; // "Uber", "Uber Shuttle", "Lyft", "Empower", "Taxi"
  product: string; // "UberX", "Shared shuttle", "Lyft Standard"
  lowUsd: number;
  highUsd: number;
  etaMinutes: number; // pickup wait
  rideMinutes: number;
  surgeActive: boolean;
  note?: string; // "Shared van · fixed departures every 30 min"
}

interface ProviderModel {
  provider: string;
  product: string;
  fareMultiplier: number; // vs the UberX midpoint
  spread: [number, number]; // low/high band around the midpoint
  etaMinutes: number;
  timeMultiplier: number; // ride time vs direct drive
  airportOnly?: boolean; // Uber Shuttle only runs on airport corridors
  /** Only offered in these cities (checked against the trip's city). */
  cities?: string[];
  note?: string;
}

/**
 * Real provider coverage (no public coverage API exists — these lists track
 * the providers' own service announcements):
 *  - Uber Shuttle: launched late 2024 at JFK/LGA (New York), expanding to
 *    Chicago, Charlotte, and Pittsburgh.
 *  - Empower: operates in Washington, DC and is launching in Miami.
 */
const UBER_SHUTTLE_CITIES = ['New York', 'Chicago', 'Charlotte', 'Pittsburgh'];
const EMPOWER_CITIES = ['Washington', 'Miami'];

const PROVIDERS: ProviderModel[] = [
  {
    provider: 'Uber',
    product: 'UberX',
    fareMultiplier: 1,
    spread: [0.9, 1.25],
    etaMinutes: 4,
    timeMultiplier: 1,
  },
  {
    provider: 'Uber Shuttle',
    product: 'Shared shuttle',
    fareMultiplier: 0.4,
    spread: [0.95, 1.05],
    etaMinutes: 12,
    timeMultiplier: 1.45,
    airportOnly: true,
    cities: UBER_SHUTTLE_CITIES,
    note: 'Shared van · fixed departures every ~30 min',
  },
  {
    provider: 'Lyft',
    product: 'Lyft Standard',
    fareMultiplier: 0.96,
    spread: [0.85, 1.2],
    etaMinutes: 5,
    timeMultiplier: 1,
  },
  {
    provider: 'Empower',
    product: 'Empower ride',
    fareMultiplier: 0.8,
    spread: [0.92, 1.08],
    etaMinutes: 7,
    timeMultiplier: 1,
    cities: EMPOWER_CITIES,
    note: 'Driver-set prices · popular in DC',
  },
  {
    provider: 'Taxi',
    product: 'Metered taxi',
    fareMultiplier: 1.15,
    spread: [0.95, 1.15],
    etaMinutes: 6,
    timeMultiplier: 1,
    note: 'Curb pickup · no surge',
  },
];

/**
 * Estimate a ride across all providers for a segment, cheapest first.
 * `distanceMiles`/`rideMinutes` typically come from mapsService for the
 * same origin/destination pair.
 */
export async function estimateRide(
  distanceMiles: number,
  rideMinutes: number,
  opts: { airport?: boolean; city?: string } = {},
): Promise<ServiceResult<RideEstimate[]>> {
  if (isLive('uberServerToken')) {
    // REAL API: fetch live Uber/Lyft estimates here.
  }

  await mockDelay(250);

  if (distanceMiles <= 0 || rideMinutes <= 0) {
    return { ok: false, error: 'Invalid distance for ride estimate', code: 'NOT_FOUND' };
  }

  // UberX-style base fare model calibrated to NYC rates, scaled by the
  // city's real price level: base + per-mile + per-minute (+ airport fee).
  const base = 3.5;
  const perMile = 2.4;
  const perMin = 0.55;
  const airportFee = opts.airport ? 5 : 0;
  const cityIndex = (opts.city && CITY_COST_INDEX[opts.city]) || 0.8;
  let mid = (base + perMile * distanceMiles + perMin * rideMinutes) * cityIndex + airportFee;

  // AI refinement: when an Anthropic key is configured, Claude estimates
  // today's real UberX band for this city+distance and recalibrates the
  // whole comparison around it (cached per city/distance bucket).
  if (opts.city) {
    const band = await aiUberFareBand(opts.city, distanceMiles, rideMinutes);
    if (band) mid = (band.low + band.high) / 2;
  }

  const estimates = PROVIDERS.filter(
    (p) =>
      (!p.airportOnly || opts.airport) &&
      // City-limited providers only appear where they actually operate.
      (!p.cities || (opts.city !== undefined && p.cities.includes(opts.city))),
  )
    .map<RideEstimate>((p) => ({
      provider: p.provider,
      product: p.product,
      lowUsd: Math.max(3, Math.round(mid * p.fareMultiplier * p.spread[0])),
      highUsd: Math.max(4, Math.round(mid * p.fareMultiplier * p.spread[1])),
      etaMinutes: p.etaMinutes,
      rideMinutes: Math.round(rideMinutes * p.timeMultiplier),
      surgeActive: false,
      note: p.note,
    }))
    .sort((a, b) => a.lowUsd - b.lowUsd);

  return { ok: true, data: estimates };
}

/** The single best "default" ride (fast pickup, reliable) — UberX. */
export async function estimatePrimaryRide(
  distanceMiles: number,
  rideMinutes: number,
  opts: { airport?: boolean } = {},
): Promise<ServiceResult<RideEstimate>> {
  const all = await estimateRide(distanceMiles, rideMinutes, opts);
  if (!all.ok) return all;
  const uber = all.data.find((e) => e.provider === 'Uber') ?? all.data[0];
  return { ok: true, data: uber };
}
