/**
 * Rideshare estimate service (Uber / Lyft).
 *
 * MOCK: distance-based fare model calibrated to NYC/Boston pricing.
 *
 * REAL API: Uber's price-estimates endpoint requires a server token
 * (apiConfig.uberServerToken) and Lyft's cost endpoint an OAuth client
 * (apiConfig.lyftClientId). Both should be proxied through your backend —
 * do not ship server tokens in the app bundle.
 */

import type { ServiceResult } from '../types';
import { isLive, mockDelay } from './config';

export interface RideEstimate {
  provider: 'Uber' | 'Lyft';
  product: string; // "UberX", "Lyft Standard"
  lowUsd: number;
  highUsd: number;
  etaMinutes: number; // pickup wait
  rideMinutes: number;
  surgeActive: boolean;
}

/**
 * Estimate a ride for a segment. `distanceMiles`/`rideMinutes` typically come
 * from mapsService for the same origin/destination pair.
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

  // NYC-ish fare model: base + per-mile + per-minute (+ airport surcharge).
  const base = 3.5;
  const perMile = 2.4;
  const perMin = 0.55;
  const airportFee = opts.airport ? 5 : 0;
  const mid = base + perMile * distanceMiles + perMin * rideMinutes + airportFee;

  const uber: RideEstimate = {
    provider: 'Uber',
    product: 'UberX',
    lowUsd: Math.round(mid * 0.9),
    highUsd: Math.round(mid * 1.25),
    etaMinutes: 4,
    rideMinutes,
    surgeActive: false,
  };
  const lyft: RideEstimate = {
    provider: 'Lyft',
    product: 'Lyft Standard',
    lowUsd: Math.round(mid * 0.85),
    highUsd: Math.round(mid * 1.2),
    etaMinutes: 5,
    rideMinutes,
    surgeActive: false,
  };
  return { ok: true, data: [uber, lyft] };
}
