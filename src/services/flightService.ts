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

import { airportsNear, haversineMiles, nearestAirport } from '../data/airports';
import { resolveCityCoords } from './geoService';
import type { CorridorKey } from '../data/cities';
import type { ServiceResult } from '../types';
import { apiConfig, fetchWithTimeout, mockDelay } from './config';
import type { LineHaulOption } from './legTypes';

/**
 * Generate realistic flights between ANY two cities using real geography:
 * EVERY airport near the origin (NYC → JFK, LGA, EWR) with haversine-scaled
 * durations and fares. The UI lets travelers toggle departure airports on
 * and off; each airport contributes its own set of flights.
 */
export async function generateFlights(
  originAddress: string,
  destAddress: string,
): Promise<LineHaulOption[]> {
  // Unfamiliar addresses are geocoded live, then snapped to real geography —
  // so "figure out where the address is and infer the best ways to get there".
  const from = (await resolveCityCoords(originAddress)) ?? { city: 'New York', lat: 40.7128, lng: -74.006 };
  const to = await resolveCityCoords(destAddress);
  if (!to) return []; // truly unresolvable destination
  if (haversineMiles(from, to) < 75) return []; // nobody flies across town

  const origins = airportsNear(from, 80, 3);
  const dest = nearestAirport(to);
  const carriers = [
    { provider: 'Delta', prefix: 'DL' },
    { provider: 'American', prefix: 'AA' },
    { provider: 'JetBlue', prefix: 'B6' },
  ];

  return origins.flatMap(({ airport: origin }, a) => {
    if (origin.code === dest.code) return []; // same airport → not a flight trip
    const miles = haversineMiles(origin, dest);
    // Real-world approximation: taxi+climb overhead + ~500 mph cruise.
    const durationMinutes = Math.round(40 + miles / 8.3);
    const baseFare = Math.round(59 + miles * 0.11);
    return carriers.map((carrier, i) => ({
      id: `fl-gen-${origin.code}-${dest.code}-${i}`,
      mode: 'flight' as const,
      provider: carrier.provider,
      serviceName: `${carrier.prefix} ${1200 + i * 341 + a * 57 + (miles % 97)}`,
      fromStation: `${origin.name} (${origin.code})`,
      toStation: `${dest.name} (${dest.code})`,
      departOffsetMinutes: 150 + i * 45 + a * 20,
      durationMinutes,
      farePerPersonUsd: Math.round(baseFare * (1 + i * 0.12) * (1 + a * 0.04)),
      bagFeeUsd: 35,
      seatFeeUsd: 29,
      reliabilityScore: 74 - i * 2,
      comfortScore: 62,
      baseDelayRisk: 0.28,
      bookingUrl: 'https://www.google.com/travel/flights',
      notes: [`${miles} mi nonstop`, 'Fare is an estimate — tap “Compare live fares” for today’s price'],
    }));
  });
}

/** IATA codes per corridor for live fare lookups + Google Flights links. */
export const CORRIDOR_AIRPORTS: Partial<Record<CorridorKey, { origin: string; dest: string }>> = {
  'nyc-boston': { origin: 'LGA', dest: 'BOS' },
  'nyc-dc': { origin: 'LGA', dest: 'DCA' },
};

// ---------------------------------------------------------------------------
// LIVE: Amadeus Self-Service API (free tier — create keys at
// developers.amadeus.com and set EXPO_PUBLIC_AMADEUS_CLIENT_ID/SECRET).
// Airlines do not publish fares without an API agreement, so live pricing
// requires these keys; without them the calibrated estimates below are
// shown and the booking buttons open the airline / Google Flights with the
// real route + date pre-filled.
// ---------------------------------------------------------------------------

let amadeusToken: { token: string; expiresAt: number } | undefined;

async function getAmadeusToken(): Promise<string | undefined> {
  if (amadeusToken && amadeusToken.expiresAt > Date.now() + 30_000) return amadeusToken.token;
  try {
    const res = await fetchWithTimeout('https://test.api.amadeus.com/v1/security/oauth2/token', 8000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(apiConfig.amadeusClientId)}&client_secret=${encodeURIComponent(apiConfig.amadeusClientSecret)}`,
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { access_token: string; expires_in: number };
    amadeusToken = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return amadeusToken.token;
  } catch {
    return undefined;
  }
}

async function fetchLiveFlights(
  corridor: CorridorKey,
  departureIso: string,
  travelers: number,
): Promise<LineHaulOption[] | undefined> {
  const airports = CORRIDOR_AIRPORTS[corridor];
  if (!airports) return undefined;
  const token = await getAmadeusToken();
  if (!token) return undefined;

  try {
    const day = departureIso.slice(0, 10);
    const res = await fetchWithTimeout(
      `https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=${airports.origin}&destinationLocationCode=${airports.dest}&departureDate=${day}&adults=${travelers}&nonStop=true&max=3&currencyCode=USD`,
      8000,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return undefined;
    const body = (await res.json()) as {
      data?: Array<{
        id: string;
        price: { grandTotal: string };
        itineraries: Array<{
          duration: string;
          segments: Array<{
            departure: { iataCode: string; at: string };
            arrival: { iataCode: string; at: string };
            carrierCode: string;
            number: string;
          }>;
        }>;
      }>;
    };
    if (!body.data || body.data.length === 0) return undefined;

    return body.data.slice(0, 2).map((offer, i) => {
      const seg = offer.itineraries[0].segments[0];
      const durationMinutes = Math.round(
        (new Date(seg.arrival.at).getTime() - new Date(seg.departure.at).getTime()) / 60_000,
      );
      return {
        id: `fl-live-${offer.id ?? i}`,
        mode: 'flight' as const,
        provider: seg.carrierCode,
        serviceName: `${seg.carrierCode} ${seg.number}`,
        fromStation: `${seg.departure.iataCode} (${seg.departure.iataCode})`,
        toStation: `${seg.arrival.iataCode} (${seg.arrival.iataCode})`,
        departOffsetMinutes: Math.max(
          60,
          Math.round((new Date(seg.departure.at).getTime() - new Date(departureIso).getTime()) / 60_000),
        ),
        durationMinutes,
        farePerPersonUsd: Math.round(Number(offer.price.grandTotal) / travelers),
        bagFeeUsd: 35,
        reliabilityScore: 74,
        comfortScore: 62,
        baseDelayRisk: 0.28,
        bookingUrl: 'https://www.google.com/travel/flights',
        notes: ['Live fare via Amadeus'],
      };
    });
  } catch {
    return undefined;
  }
}

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
  opts: { departureIso?: string; travelers?: number; originAddress?: string; destAddress?: string } = {},
): Promise<ServiceResult<LineHaulOption[]>> {
  // Live Amadeus fares when keys are configured (free tier).
  if (apiConfig.amadeusClientId && apiConfig.amadeusClientSecret && opts.departureIso) {
    const live = await fetchLiveFlights(corridor, opts.departureIso, opts.travelers ?? 1);
    if (live && live.length > 0) return { ok: true, data: live };
  }

  await mockDelay(120);

  const options = FLIGHTS[corridor];
  if (!options) {
    // No curated corridor — generate flights from real geography so they
    // always populate (every nearby origin airport + great-circle distance).
    if (opts.originAddress && opts.destAddress) {
      return { ok: true, data: await generateFlights(opts.originAddress, opts.destAddress) };
    }
    return { ok: true, data: [] };
  }
  // Curated corridor: keep the calibrated flights and add generated ones
  // from the OTHER nearby airports (NYC's curated shuttle is LGA — JFK and
  // EWR departures come from geography), so every airport is toggleable.
  const curated = options.map((o) => ({
    ...o,
    notes: [...(o.notes ?? []), 'Fare is an estimate — tap “Compare live fares” for today’s price'],
  }));
  if (opts.originAddress && opts.destAddress) {
    const curatedCodes = new Set(
      curated.map((o) => o.fromStation.match(/\(([A-Z]{3})\)/)?.[1]).filter(Boolean),
    );
    const generated = (await generateFlights(opts.originAddress, opts.destAddress)).filter(
      (o) => !curatedCodes.has(o.fromStation.match(/\(([A-Z]{3})\)/)?.[1]),
    );
    return { ok: true, data: [...curated, ...generated] };
  }
  return { ok: true, data: curated };
}
