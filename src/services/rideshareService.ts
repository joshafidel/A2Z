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
import { isLive, mockDelay } from './config';

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
  note?: string;
}

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
  opts: { airport?: boolean } = {},
): Promise<ServiceResult<RideEstimate[]>> {
  if (isLive('uberServerToken')) {
    // REAL API: fetch live Uber/Lyft estimates here.
  }

  await mockDelay(250);

  if (distanceMiles <= 0 || rideMinutes <= 0) {
    return { ok: false, error: 'Invalid distance for ride estimate', code: 'NOT_FOUND' };
  }

  // UberX-style base fare model: base + per-mile + per-minute (+ airport surcharge).
  const base = 3.5;
  const perMile = 2.4;
  const perMin = 0.55;
  const airportFee = opts.airport ? 5 : 0;
  const mid = base + perMile * distanceMiles + perMin * rideMinutes + airportFee;

  const estimates = PROVIDERS.filter((p) => !p.airportOnly || opts.airport)
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
