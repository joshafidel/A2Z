/**
 * Intercity bus search service.
 *
 * MOCK: FlixBus / Peter Pan style schedules.
 *
 * REAL API: options include the FlixBus affiliate API, Wanderu/Busbud
 * partner APIs, or GTFS feeds published by carriers. Map into LineHaulOption.
 */

import { haversineMiles } from '../data/airports';
import type { CorridorKey } from '../data/cities';
import type { ServiceResult } from '../types';
import { isLive, mockDelay } from './config';
import { resolveCityCoords } from './geoService';
import type { LineHaulOption } from './legTypes';

/** Rough regional boxes for carriers that only serve certain states. */
function inTexas(p: { lat: number; lng: number }): boolean {
  return p.lat >= 25.8 && p.lat <= 36.5 && p.lng >= -106.7 && p.lng <= -93.5;
}
function inFlorida(p: { lat: number; lng: number }): boolean {
  return p.lat >= 24.5 && p.lat <= 31.0 && p.lng >= -87.7 && p.lng <= -80.0;
}
function inNortheast(p: { lat: number; lng: number }): boolean {
  return p.lat >= 38.5 && p.lat <= 45.5 && p.lng >= -80.0 && p.lng <= -66.9;
}

/**
 * Intercity buses for pairs under ~400 road miles, across ALL the major
 * carriers that actually serve the region: Greyhound and FlixBus run
 * nationwide, Megabus on major corridors, Peter Pan in the Northeast, and
 * RedCoach within Texas and Florida.
 */
export async function generateBuses(
  originAddress: string,
  destAddress: string,
): Promise<LineHaulOption[]> {
  const from = await resolveCityCoords(originAddress);
  const to = await resolveCityCoords(destAddress);
  if (!from || !to) return [];
  const miles = haversineMiles(from, to);
  if (miles < 25 || miles > 400) return [];

  const roadMiles = miles * 1.2;
  const baseDuration = Math.round((roadMiles / 50) * 60 + 25);
  const baseFare = 15 + roadMiles * 0.07;

  const carriers: Array<{
    provider: string;
    bookingUrl: string;
    fareMult: number;
    comfort: number;
    reliability: number;
    offsetMinutes: number;
    note?: string;
  }> = [
    {
      provider: 'Greyhound',
      bookingUrl: 'https://www.greyhound.com',
      fareMult: 1,
      comfort: 55,
      reliability: 66,
      offsetMinutes: 60,
      note: 'Nationwide network',
    },
    {
      provider: 'FlixBus',
      bookingUrl: 'https://www.flixbus.com',
      fareMult: 0.9,
      comfort: 57,
      reliability: 68,
      offsetMinutes: 105,
      note: 'Wi-Fi + outlets',
    },
    {
      provider: 'Megabus',
      bookingUrl: 'https://us.megabus.com',
      fareMult: 0.8,
      comfort: 52,
      reliability: 64,
      offsetMinutes: 150,
      note: 'Book early for the lowest fares',
    },
  ];
  if (inNortheast(from) && inNortheast(to)) {
    carriers.push({
      provider: 'Peter Pan',
      bookingUrl: 'https://peterpanbus.com',
      fareMult: 0.95,
      comfort: 58,
      reliability: 70,
      offsetMinutes: 90,
      note: 'Northeast regional carrier',
    });
  }
  if ((inTexas(from) && inTexas(to)) || (inFlorida(from) && inFlorida(to))) {
    carriers.push({
      provider: 'RedCoach',
      bookingUrl: 'https://www.redcoachusa.com',
      fareMult: 1.4,
      comfort: 82,
      reliability: 74,
      offsetMinutes: 75,
      note: 'First-class seats · Texas & Florida routes',
    });
  }

  return carriers.map((c, i) => ({
    id: `bus-gen-${c.provider}-${from.city}-${to.city}`.replace(/\s+/g, ''),
    mode: 'bus' as const,
    provider: c.provider,
    serviceName: `${c.provider} ${2000 + i * 113 + (miles % 800)}`,
    fromStation: `${from.city} bus terminal`,
    toStation: `${to.city} bus terminal`,
    departOffsetMinutes: c.offsetMinutes,
    durationMinutes: Math.round(baseDuration * (c.provider === 'RedCoach' ? 0.95 : 1)),
    farePerPersonUsd: Math.round(baseFare * c.fareMult),
    bagFeeUsd: 0,
    reliabilityScore: c.reliability,
    comfortScore: c.comfort,
    baseDelayRisk: 0.34,
    bookingUrl: c.bookingUrl,
    notes: [`~${Math.round(roadMiles)} road miles`, ...(c.note ? [c.note] : [])],
  }));
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
    {
      id: 'bus-greyhound-bos',
      mode: 'bus',
      provider: 'Greyhound',
      serviceName: 'Greyhound 1170',
      fromStation: 'Port Authority Bus Terminal',
      toStation: 'Boston South Station Bus Terminal',
      departOffsetMinutes: 90,
      durationMinutes: 265,
      farePerPersonUsd: 29,
      bagFeeUsd: 0,
      reliabilityScore: 66,
      comfortScore: 54,
      baseDelayRisk: 0.34,
      bookingUrl: 'https://www.greyhound.com',
      notes: ['Nationwide network'],
    },
    {
      id: 'bus-peterpan-bos',
      mode: 'bus',
      provider: 'Peter Pan',
      serviceName: 'Peter Pan 4012',
      fromStation: 'Port Authority Bus Terminal',
      toStation: 'Boston South Station Bus Terminal',
      departOffsetMinutes: 120,
      durationMinutes: 260,
      farePerPersonUsd: 33,
      bagFeeUsd: 0,
      reliabilityScore: 70,
      comfortScore: 58,
      baseDelayRisk: 0.3,
      bookingUrl: 'https://peterpanbus.com',
      notes: ['Northeast regional carrier'],
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
    {
      id: 'bus-greyhound-dc',
      mode: 'bus',
      provider: 'Greyhound',
      serviceName: 'Greyhound 2231',
      fromStation: 'Port Authority Bus Terminal',
      toStation: 'Union Station Bus Terminal',
      departOffsetMinutes: 95,
      durationMinutes: 275,
      farePerPersonUsd: 35,
      bagFeeUsd: 0,
      reliabilityScore: 66,
      comfortScore: 54,
      baseDelayRisk: 0.34,
      bookingUrl: 'https://www.greyhound.com',
      notes: ['Nationwide network'],
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
    return { ok: true, data: await generateBuses(opts.originAddress, opts.destAddress) };
  }
  return { ok: true, data: [] };
}
