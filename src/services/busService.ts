/**
 * Intercity bus search service.
 *
 * MOCK: FlixBus / Peter Pan style schedules.
 *
 * REAL API: options include the FlixBus affiliate API, Wanderu/Busbud
 * partner APIs, or GTFS feeds published by carriers. Map into LineHaulOption.
 */

import { findCityCoords, haversineMiles } from '../data/airports';
import type { CorridorKey } from '../data/cities';
import type { ServiceResult } from '../types';
import { isLive, mockDelay } from './config';
import type { LineHaulOption } from './legTypes';

/** Intercity buses populate for pairs under ~400 road miles. */
export function generateBuses(originAddress: string, destAddress: string): LineHaulOption[] {
  const from = findCityCoords(originAddress);
  const to = findCityCoords(destAddress);
  if (!from || !to) return [];
  const miles = haversineMiles(from, to);
  if (miles < 25 || miles > 400) return [];

  const roadMiles = miles * 1.2;
  const durationMinutes = Math.round((roadMiles / 50) * 60 + 25);
  return [
    {
      id: `bus-gen-${from.city}-${to.city}`.replace(/\s+/g, ''),
      mode: 'bus' as const,
      provider: 'FlixBus',
      serviceName: `FlixBus ${2000 + (miles % 800)}`,
      fromStation: `${from.city} bus stop`,
      toStation: `${to.city} bus terminal`,
      departOffsetMinutes: 60,
      durationMinutes,
      farePerPersonUsd: Math.round(15 + roadMiles * 0.07),
      bagFeeUsd: 0,
      reliabilityScore: 67,
      comfortScore: 55,
      baseDelayRisk: 0.34,
      bookingUrl: 'https://www.flixbus.com',
      notes: [`~${Math.round(roadMiles)} road miles`, 'Traffic-dependent arrival time'],
    },
  ];
}

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
  opts: { originAddress?: string; destAddress?: string } = {},
): Promise<ServiceResult<LineHaulOption[]>> {
  if (isLive('rome2RioApiKey')) {
    // REAL API: query bus aggregator here.
  }

  await mockDelay(120);
  const curated = BUSES[corridor];
  if (curated) return { ok: true, data: curated };
  if (opts.originAddress && opts.destAddress) {
    return { ok: true, data: generateBuses(opts.originAddress, opts.destAddress) };
  }
  return { ok: true, data: [] };
}
