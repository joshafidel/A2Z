/**
 * Flight search service.
 *
 * MOCK: realistic schedules/prices for the supported corridors.
 *
 * REAL API: implement with Amadeus Flight Offers Search
 *   POST https://api.amadeus.com/v2/shopping/flight-offers  (OAuth via
 *   apiConfig.amadeusClientId/Secret)
 * or Duffel (`Authorization: Bearer ${apiConfig.duffelApiKey}`), then map
 * offers into LineHaulOption. Keep bag fees from the ancillaries response.
 */

import type { CorridorKey } from '../data/cities';
import type { ServiceResult } from '../types';
import { isLive, mockDelay } from './config';
import type { LineHaulOption } from './legTypes';

const FLIGHTS: Partial<Record<CorridorKey, LineHaulOption[]>> = {
  'nyc-boston': [
    {
      id: 'fl-dl2368',
      mode: 'flight',
      provider: 'Delta',
      serviceName: 'DL 2368',
      fromStation: 'LaGuardia (LGA), Terminal C',
      toStation: 'Boston Logan (BOS), Terminal A',
      departOffsetMinutes: 150, // needs airport lead time; offset from requested departure
      durationMinutes: 74,
      farePerPersonUsd: 148,
      bagFeeUsd: 35,
      seatFeeUsd: 29,
      reliabilityScore: 74,
      comfortScore: 62,
      baseDelayRisk: 0.28,
      bookingUrl: 'https://www.delta.com/flight-search/book-a-flight',
      notes: ['Hourly Delta Shuttle service on this corridor'],
    },
  ],
  'nyc-dc': [
    {
      id: 'fl-dl5624',
      mode: 'flight',
      provider: 'Delta',
      serviceName: 'DL 5624',
      fromStation: 'LaGuardia (LGA), Terminal C',
      toStation: 'Reagan National (DCA), Terminal 2',
      departOffsetMinutes: 165,
      durationMinutes: 88,
      farePerPersonUsd: 174,
      bagFeeUsd: 35,
      seatFeeUsd: 32,
      reliabilityScore: 71,
      comfortScore: 60,
      baseDelayRisk: 0.3,
      bookingUrl: 'https://www.delta.com/flight-search/book-a-flight',
    },
  ],
};

export async function searchFlights(
  corridor: CorridorKey,
): Promise<ServiceResult<LineHaulOption[]>> {
  if (isLive('duffelApiKey') || isLive('amadeusClientId')) {
    // REAL API: query Duffel/Amadeus here.
  }

  await mockDelay();

  const options = FLIGHTS[corridor];
  if (!options) {
    // Not an error — some corridors (e.g. Manhattan → JFK) simply have no flights.
    return { ok: true, data: [] };
  }
  return { ok: true, data: options };
}
