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

import type { CorridorKey } from '../data/cities';
import type { ServiceResult } from '../types';
import { isLive, mockDelay } from './config';
import type { LineHaulOption } from './legTypes';

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
): Promise<ServiceResult<LineHaulOption[]>> {
  if (isLive('rome2RioApiKey')) {
    // REAL API: query Rome2Rio / rail content provider here.
  }

  await mockDelay();
  return { ok: true, data: TRAINS[corridor] ?? [] };
}
