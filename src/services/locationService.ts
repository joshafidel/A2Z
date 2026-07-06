/**
 * Current-location service.
 *
 * Uses the browser/device geolocation API (works on web and, via the
 * WebView polyfill, in Expo Go). Reverse geocoding is mocked to the
 * nearest supported demo city.
 *
 * REAL API: swap `reverseGeocode` for Google Maps Geocoding
 *   GET https://maps.googleapis.com/maps/api/geocode/json?latlng=..&key=${apiConfig.googleMapsApiKey}
 * or expo-location's `reverseGeocodeAsync` on native.
 */

import type { Place, ServiceResult } from '../types';
import { fetchWithTimeout, isLive, liveDataEnabled } from './config';

interface Coords {
  latitude: number;
  longitude: number;
}

function getCoords(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    const geo = (globalThis as { navigator?: { geolocation?: Geolocation } }).navigator?.geolocation;
    if (!geo) {
      reject(new Error('Geolocation is not available on this device.'));
      return;
    }
    geo.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(new Error(err.message || 'Location permission denied.')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

/** Known demo-city anchors for the mock reverse geocoder. */
const CITY_ANCHORS: Array<{ lat: number; lng: number; address: string }> = [
  { lat: 40.7128, lng: -74.006, address: 'Current location — New York, NY' },
  { lat: 42.3601, lng: -71.0589, address: 'Current location — Boston, MA' },
  { lat: 38.9072, lng: -77.0369, address: 'Current location — Washington, DC' },
];

/** Live reverse geocoding via Nominatim — returns the actual street address. */
async function reverseGeocodeLive(coords: Coords): Promise<string | undefined> {
  if (!liveDataEnabled()) return undefined;
  try {
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&zoom=18`,
      4000,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return undefined;
    const body = (await res.json()) as {
      display_name?: string;
      address?: { house_number?: string; road?: string; city?: string; town?: string; state?: string };
    };
    const a = body.address;
    if (a?.road) {
      const city = a.city ?? a.town ?? '';
      return [
        [a.house_number, a.road].filter(Boolean).join(' '),
        city,
        a.state,
      ]
        .filter(Boolean)
        .join(', ');
    }
    return body.display_name?.split(',').slice(0, 3).join(',');
  } catch {
    return undefined;
  }
}

function reverseGeocodeMock(coords: Coords): string {
  if (isLive('googleMapsApiKey')) {
    // REAL API: call Google Geocoding here for a street-level address.
  }
  // Mock: snap to the nearest demo city so corridors resolve.
  let best = CITY_ANCHORS[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const anchor of CITY_ANCHORS) {
    const d = (anchor.lat - coords.latitude) ** 2 + (anchor.lng - coords.longitude) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = anchor;
    }
  }
  return best.address;
}

/**
 * Resolve the user's current position into a Place usable as a trip origin.
 */
export async function getCurrentLocation(): Promise<ServiceResult<Place>> {
  try {
    const coords = await getCoords();
    // Live path shows your ACTUAL address; mock snaps to the nearest demo city.
    const liveAddress = await reverseGeocodeLive(coords);
    const address = liveAddress ?? reverseGeocodeMock(coords);
    return {
      ok: true,
      data: {
        address,
        // The label is what the UI displays — show the real address, not
        // a generic "Current location" placeholder.
        label: liveAddress ? liveAddress.split(',').slice(0, 2).join(',') : address.split('—')[1]?.trim() ?? address,
        lat: coords.latitude,
        lng: coords.longitude,
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Could not determine your location.',
      code: 'UNAVAILABLE',
    };
  }
}
