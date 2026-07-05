/**
 * Intercity bus search service.
 *
 * MOCK: FlixBus / Peter Pan style schedules.
 *
 * REAL API: options include the FlixBus affiliate API, Wanderu/Busbud
 * partner APIs, or GTFS feeds published by carriers. Map into LineHaulOption.
 */

import type { CorridorKey } from '../data/cities';
import type { ServiceResult } from '../types';
import { isLive, mockDelay } from './config';
import type { LineHaulOption } from './legTypes';

const BUSES: Partial<Record<CorridorKey, LineHaulOption[]>> = {
  'nyc-boston': [
    {
      id: 'bus-flix',
      mode: 'bus',
      provider: 'FlixBus',
      serviceName: 'FlixBus 2711',
      fromStation: 'Midtown (31st St & 8th Ave)',
      toStation: 'Boston South Station Bus Terminal',
      departOffsetMinutes: 65,
      durationMinutes: 275, // 4h 35m
      farePerPersonUsd: 25,
      bagFeeUsd: 0,
      reliabilityScore: 68,
      comfortScore: 55,
      baseDelayRisk: 0.34,
      bookingUrl: 'https://www.flixbus.com',
      notes: ['1 free checked bag + 1 carry-on', 'Traffic-dependent arrival time'],
    },
  ],
  'nyc-dc': [
    {
      id: 'bus-flix-dc',
      mode: 'bus',
      provider: 'FlixBus',
      serviceName: 'FlixBus 2405',
      fromStation: 'Midtown (31st St & 8th Ave)',
      toStation: 'Union Station Bus Terminal',
      departOffsetMinutes: 60,
      durationMinutes: 285, // 4h 45m
      farePerPersonUsd: 32,
      bagFeeUsd: 0,
      reliabilityScore: 66,
      comfortScore: 55,
      baseDelayRisk: 0.36,
      bookingUrl: 'https://www.flixbus.com',
      notes: ['I-95 traffic can add 30–60 min'],
    },
  ],
};

export async function searchBuses(
  corridor: CorridorKey,
): Promise<ServiceResult<LineHaulOption[]>> {
  if (isLive('rome2RioApiKey')) {
    // REAL API: query bus aggregator here.
  }

  await mockDelay();
  return { ok: true, data: BUSES[corridor] ?? [] };
}
