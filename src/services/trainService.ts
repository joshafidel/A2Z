/**
 * Train search service.
 *
 * MOCK: Amtrak Northeast Corridor schedules.
 *
 * REAL API: Amtrak has no public fare API; realistic options are
 *  - Rome2Rio multimodal search (apiConfig.rome2RioApiKey)
 *  - a licensed rail-content provider (e.g. SilverRail)
 *  - GTFS feeds for schedules + published fare tables.
 * Map results into LineHaulOption here; nothing else changes.
 */

import { findCityCoords, haversineMiles } from '../data/airports';
import type { CorridorKey } from '../data/cities';
import type { ServiceResult } from '../types';
import { isLive, mockDelay } from './config';
import type { LineHaulOption } from './legTypes';

/**
 * Generate Amtrak-style options for any city pair that rail actually
 * serves (both cities flagged `amtrak` in the geography data). Long-haul
 * routes get honest long durations, so trains populate when they're an
 * option and rank realistically.
 */
export function generateTrains(originAddress: string, destAddress: string): LineHaulOption[] {
  const from = findCityCoords(originAddress);
  const to = findCityCoords(destAddress);
  if (!from || !to || !from.amtrak || !to.amtrak) return [];

  const miles = haversineMiles(from, to);
  if (miles < 30 || miles > 1600) return []; // too short / no sane one-seat ride

  const railMiles = miles * 1.2; // track routing is never a straight line
  const durationMinutes = Math.round((railMiles / 55) * 60 + 20);
  const fare = Math.round(45 + railMiles * 0.12);

  return [0, 1].map((i) => ({
    id: `tr-gen-${from.city}-${to.city}-${i}`.replace(/\s+/g, ''),
    mode: 'train' as const,
    provider: 'Amtrak',
    serviceName: `Amtrak ${90 + i * 8}`,
    fromStation: `${from.city} station`,
    toStation: `${to.city} station`,
    departOffsetMinutes: 60 + i * 180,
    durationMinutes,
    farePerPersonUsd: Math.round(fare * (1 + i * 0.1)),
    bagFeeUsd: 0,
    reliabilityScore: 80,
    comfortScore: 78,
    baseDelayRisk: 0.18,
    bookingUrl: 'https://www.amtrak.com/tickets/departure.html',
    notes: [`~${Math.round(railMiles)} rail miles`, '2 free bags per traveler'],
  }));
}

const TRAINS: Partial<Record<CorridorKey, LineHaulOption[]>> = {
  'nyc-boston': [
    {
      id: 'tr-acela',
      mode: 'train',
      provider: 'Amtrak',
      serviceName: 'Acela 2154',
      fromStation: 'Moynihan Train Hall (NYP)',
      toStation: 'Boston South Station (BOS)',
      departOffsetMinutes: 55,
      durationMinutes: 222, // 3h 42m
      farePerPersonUsd: 132,
      bagFeeUsd: 0,
      reliabilityScore: 88,
      comfortScore: 90,
      baseDelayRisk: 0.12,
      bookingUrl: 'https://www.amtrak.com/tickets/departure.html',
      notes: ['Business class, Wi-Fi, café car', '2 free bags per traveler'],
    },
    {
      id: 'tr-regional',
      mode: 'train',
      provider: 'Amtrak',
      serviceName: 'Northeast Regional 172',
      fromStation: 'Moynihan Train Hall (NYP)',
      toStation: 'Boston South Station (BOS)',
      departOffsetMinutes: 75,
      durationMinutes: 255, // 4h 15m
      farePerPersonUsd: 59,
      bagFeeUsd: 0,
      reliabilityScore: 82,
      comfortScore: 78,
      baseDelayRisk: 0.16,
      bookingUrl: 'https://www.amtrak.com/tickets/departure.html',
      notes: ['Coach seating, Wi-Fi', '2 free bags per traveler'],
    },
  ],
  'nyc-dc': [
    {
      id: 'tr-acela-dc',
      mode: 'train',
      provider: 'Amtrak',
      serviceName: 'Acela 2109',
      fromStation: 'Moynihan Train Hall (NYP)',
      toStation: 'Washington Union Station (WAS)',
      departOffsetMinutes: 50,
      durationMinutes: 172, // 2h 52m
      farePerPersonUsd: 156,
      bagFeeUsd: 0,
      reliabilityScore: 89,
      comfortScore: 90,
      baseDelayRisk: 0.1,
      bookingUrl: 'https://www.amtrak.com/tickets/departure.html',
      notes: ['Arrives downtown — no airport transfer needed'],
    },
    {
      id: 'tr-regional-dc',
      mode: 'train',
      provider: 'Amtrak',
      serviceName: 'Northeast Regional 85',
      fromStation: 'Moynihan Train Hall (NYP)',
      toStation: 'Washington Union Station (WAS)',
      departOffsetMinutes: 70,
      durationMinutes: 215, // 3h 35m
      farePerPersonUsd: 79,
      bagFeeUsd: 0,
      reliabilityScore: 83,
      comfortScore: 78,
      baseDelayRisk: 0.14,
      bookingUrl: 'https://www.amtrak.com/tickets/departure.html',
    },
  ],
};

export async function searchTrains(
  corridor: CorridorKey,
  opts: { originAddress?: string; destAddress?: string } = {},
): Promise<ServiceResult<LineHaulOption[]>> {
  if (isLive('rome2RioApiKey')) {
    // REAL API: query Rome2Rio / rail content provider here.
  }

  await mockDelay(120);
  const curated = TRAINS[corridor];
  if (curated) return { ok: true, data: curated };
  if (opts.originAddress && opts.destAddress) {
    return { ok: true, data: generateTrains(opts.originAddress, opts.destAddress) };
  }
  return { ok: true, data: [] };
}
