/**
 * Saved-trip persistence via AsyncStorage.
 * Swap for a backend (with auth) when accounts are added — the interface
 * is already async so nothing upstream changes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RouteOption, SavedTrip, ServiceResult, TripSearch } from '../types';

const KEY = '@a2z/saved-trips';

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
): Promise<ServiceResult<SavedTrip>> {
  try {
    const existing = await getSavedTrips();
    const trips = existing.ok ? existing.data : [];
    const trip: SavedTrip = {
      id: `trip-${Date.now()}`,
      savedAt: new Date().toISOString(),
      search,
      route,
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
