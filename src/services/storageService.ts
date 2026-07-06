/**
 * Saved-trip persistence via AsyncStorage.
 * Swap for a backend (with auth) when accounts are added — the interface
 * is already async so nothing upstream changes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HotelOption, Place, RouteOption, SavedTrip, ServiceResult, TripSearch } from '../types';

const KEY = '@a2z/saved-trips';
const HOME_KEY = '@a2z/home-place';

// ---------------------------------------------------------------------------
// Saved home address
// ---------------------------------------------------------------------------

export async function getHomePlace(): Promise<Place | undefined> {
  try {
    const raw = await AsyncStorage.getItem(HOME_KEY);
    return raw ? (JSON.parse(raw) as Place) : undefined;
  } catch {
    return undefined;
  }
}

export async function setHomePlace(place: Place): Promise<boolean> {
  try {
    await AsyncStorage.setItem(HOME_KEY, JSON.stringify(place));
    return true;
  } catch {
    return false;
  }
}

export async function getSavedTrips(): Promise<ServiceResult<SavedTrip[]>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return { ok: true, data: raw ? (JSON.parse(raw) as SavedTrip[]) : [] };
  } catch {
    return { ok: false, error: 'Could not load saved trips.', code: 'UNAVAILABLE' };
  }
}

export async function saveTrip(
  search: TripSearch,
  route: RouteOption,
  hotel?: HotelOption,
): Promise<ServiceResult<SavedTrip>> {
  try {
    const existing = await getSavedTrips();
    const trips = existing.ok ? existing.data : [];
    const trip: SavedTrip = {
      id: `trip-${Date.now()}`,
      savedAt: new Date().toISOString(),
      search,
      route,
      hotel,
    };
    // Newest first; replace any previous save of the same route.
    const next = [trip, ...trips.filter((t) => t.route.id !== route.id)];
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return { ok: true, data: trip };
  } catch {
    return { ok: false, error: 'Could not save this trip.', code: 'UNAVAILABLE' };
  }
}

export async function deleteTrip(tripId: string): Promise<ServiceResult<void>> {
  try {
    const existing = await getSavedTrips();
    const trips = existing.ok ? existing.data : [];
    await AsyncStorage.setItem(KEY, JSON.stringify(trips.filter((t) => t.id !== tripId)));
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'Could not delete this trip.', code: 'UNAVAILABLE' };
  }
}
