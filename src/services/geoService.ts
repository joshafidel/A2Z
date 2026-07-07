/**
 * Live geocoding + road routing from free, keyless, CORS-enabled APIs:
 *
 *  - Geocoding: OSM Nominatim (street addresses) with Open-Meteo's
 *    geocoder (city names) as a second try.
 *  - Driving routes: OSRM public demo server (real road distance + time).
 *
 * Both are called client-side from the visitor's browser. Every call
 * fails fast (6s timeout) and callers fall back to the mock data layer,
 * so the app works offline / when these services are unavailable.
 *
 * REAL API (production-grade): swap Nominatim→Google Geocoding and
 * OSRM→Google Directions using apiConfig.googleMapsApiKey; the shapes
 * below stay identical.
 */

import { findCityCoords, nearestCity } from '../data/airports';
import type { ServiceResult } from '../types';
import { fetchWithTimeout, liveDataEnabled } from './config';

export interface GeoPoint {
  lat: number;
  lng: number;
  displayName: string;
}

export interface RoadRoute {
  distanceMiles: number;
  durationMinutes: number;
  /** True when this came from the live routing API (vs a mock estimate). */
  live: boolean;
}

const geocodeCache = new Map<string, GeoPoint | null>();

/** Geocode a free-text address or city name. */
export async function geocode(query: string): Promise<ServiceResult<GeoPoint>> {
  if (!liveDataEnabled()) {
    return { ok: false, error: 'Live data disabled', code: 'CONFIG' };
  }
  const key = query.trim().toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached !== undefined) {
    return cached
      ? { ok: true, data: cached }
      : { ok: false, error: `Could not find "${query}"`, code: 'NOT_FOUND' };
  }

  // 1) Nominatim: handles full street addresses.
  try {
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      6000,
      { headers: { Accept: 'application/json' } },
    );
    if (res.ok) {
      const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (rows.length > 0) {
        const point = {
          lat: Number(rows[0].lat),
          lng: Number(rows[0].lon),
          displayName: rows[0].display_name,
        };
        geocodeCache.set(key, point);
        return { ok: true, data: point };
      }
    }
  } catch {
    // fall through to the city-level geocoder
  }

  // 2) Open-Meteo geocoder: city-level fallback ("Boston", "Washington DC").
  try {
    const cityish = query.split(',')[0];
    const res = await fetchWithTimeout(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityish)}&count=1`,
    );
    if (res.ok) {
      const body = (await res.json()) as {
        results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string }>;
      };
      const hit = body.results?.[0];
      if (hit) {
        const point = {
          lat: hit.latitude,
          lng: hit.longitude,
          displayName: [hit.name, hit.admin1].filter(Boolean).join(', '),
        };
        geocodeCache.set(key, point);
        return { ok: true, data: point };
      }
    }
  } catch {
    // give up below
  }

  geocodeCache.set(key, null);
  return { ok: false, error: `Could not find "${query}"`, code: 'NOT_FOUND' };
}

/** Real road distance/time between two points via OSRM. */
export async function drivingRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<ServiceResult<RoadRoute>> {
  if (!liveDataEnabled()) {
    return { ok: false, error: 'Live data disabled', code: 'CONFIG' };
  }
  try {
    const res = await fetchWithTimeout(
      `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`,
    );
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const body = (await res.json()) as {
      code: string;
      routes?: Array<{ distance: number; duration: number }>;
    };
    const route = body.routes?.[0];
    if (body.code !== 'Ok' || !route) throw new Error('No route');
    return {
      ok: true,
      data: {
        distanceMiles: Math.round((route.distance / 1609.34) * 10) / 10,
        durationMinutes: Math.round(route.duration / 60),
        live: true,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Routing unavailable',
      code: 'UNAVAILABLE',
    };
  }
}

export interface ResolvedCity {
  lat: number;
  lng: number;
  /** Human city name ("Tucson"). */
  city: string;
  /** Whether useful Amtrak service exists near this point. */
  amtrak: boolean;
}

/**
 * Figure out where ANY address is: known-city keyword match first (instant,
 * offline), then live geocoding for unfamiliar addresses. The nearest known
 * city supplies the rail-service flag so trains/flights can be inferred for
 * places the app has never heard of.
 */
export async function resolveCityCoords(address: string): Promise<ResolvedCity | undefined> {
  const local = findCityCoords(address);
  if (local) return { lat: local.lat, lng: local.lng, city: local.city, amtrak: local.amtrak };

  const geo = await geocode(address);
  if (!geo.ok) return undefined;
  const near = nearestCity({ lat: geo.data.lat, lng: geo.data.lng });
  return {
    lat: geo.data.lat,
    lng: geo.data.lng,
    // Within ~40 mi of a known city → use its name; otherwise the geocoder's.
    city: near.miles <= 40 ? near.entry.city : geo.data.displayName.split(',')[0],
    amtrak: near.miles <= 60 ? near.entry.amtrak : false,
  };
}

type AddressRouteResult = ServiceResult<RoadRoute & { from: GeoPoint; to: GeoPoint }>;
const routeInFlight = new Map<string, Promise<AddressRouteResult>>();

/**
 * Geocode both ends and fetch the real driving route in one call.
 * De-duplicated: concurrent callers for the same pair share one request.
 */
export function drivingRouteByAddress(
  fromAddress: string,
  toAddress: string,
): Promise<AddressRouteResult> {
  const key = `${fromAddress.toLowerCase()}|${toAddress.toLowerCase()}`;
  const existing = routeInFlight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<AddressRouteResult> => {
    const [from, to] = await Promise.all([geocode(fromAddress), geocode(toAddress)]);
    if (!from.ok) return from;
    if (!to.ok) return to;
    const route = await drivingRoute(from.data, to.data);
    if (!route.ok) return route;
    return { ok: true, data: { ...route.data, from: from.data, to: to.data } };
  })();
  routeInFlight.set(key, promise);
  return promise;
}
