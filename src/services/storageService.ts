/**
 * Saved-trip persistence via AsyncStorage.
 * Swap for a backend (with auth) when accounts are added — the interface
 * is already async so nothing upstream changes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HotelOption, Place, RouteOption, SavedTrip, ServiceResult, TripSearch } from '../types';

const KEY = '@a2z/saved-trips';
const HOME_KEY = '@a2z/home-place';
const RIDESHARE_KEY = '@a2z/connected-rideshare-apps';

// ---------------------------------------------------------------------------
// Connected rideshare apps (Settings → ride options only come from these)
// ---------------------------------------------------------------------------

export const RIDESHARE_APPS = ['Uber', 'Lyft', 'Empower', 'Taxi'] as const;

export async function getConnectedRideshareApps(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RIDESHARE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [...RIDESHARE_APPS];
  } catch {
    return [...RIDESHARE_APPS];
  }
}

export async function setConnectedRideshareApps(apps: string[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(RIDESHARE_KEY, JSON.stringify(apps));
    return true;
  } catch {
    return false;
  }
}

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

/** Insert or replace a whole trip object (manual create/edit/duplicate). */
export async function upsertTrip(trip: SavedTrip): Promise<ServiceResult<SavedTrip>> {
  try {
    const existing = await getSavedTrips();
    const trips = existing.ok ? existing.data : [];
    const idx = trips.findIndex((t) => t.id === trip.id);
    const next = idx >= 0 ? trips.map((t) => (t.id === trip.id ? trip : t)) : [trip, ...trips];
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

// ---------------------------------------------------------------------------
// Export / import / reset — everything A2Z stores lives under "@a2z/" keys
// in this browser only. Export produces a single versioned JSON document;
// import validates it before touching storage; reset removes every key.
// ---------------------------------------------------------------------------

const APP_PREFIX = '@a2z/';

export interface ExportedData {
  app: 'A2Z';
  version: 1;
  exportedAt: string;
  /** Raw stored strings by key — each value is itself JSON. */
  data: Record<string, string>;
}

export async function exportAllData(): Promise<ServiceResult<string>> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(APP_PREFIX));
    const pairs = await AsyncStorage.multiGet(keys);
    const data: Record<string, string> = {};
    for (const [k, v] of pairs) if (typeof v === 'string') data[k] = v;
    const doc: ExportedData = { app: 'A2Z', version: 1, exportedAt: new Date().toISOString(), data };
    return { ok: true, data: JSON.stringify(doc, null, 2) };
  } catch {
    return { ok: false, error: 'Could not read saved data from this browser.', code: 'UNAVAILABLE' };
  }
}

/**
 * Validate an export document without trusting anything in it. Returns the
 * cleaned key→value map, or an error message describing what's wrong.
 */
export function validateImportPayload(
  json: string,
): { ok: true; data: Record<string, string>; tripCount: number } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'That is not valid JSON — paste the exact text from Export data.' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Unrecognized format — expected an A2Z export document.' };
  }
  const doc = parsed as Partial<ExportedData>;
  if (doc.app !== 'A2Z' || doc.version !== 1 || typeof doc.data !== 'object' || doc.data === null) {
    return { ok: false, error: 'This does not look like an A2Z export (missing app/version/data).' };
  }
  const data: Record<string, string> = {};
  let tripCount = 0;
  for (const [key, value] of Object.entries(doc.data)) {
    if (!key.startsWith(APP_PREFIX) || typeof value !== 'string') continue; // ignore foreign keys
    let inner: unknown;
    try {
      inner = JSON.parse(value);
    } catch {
      return { ok: false, error: `The data under "${key}" is corrupted — import cancelled.` };
    }
    if (key === KEY) {
      if (!Array.isArray(inner)) return { ok: false, error: 'The trips list in this file is corrupted.' };
      for (const t of inner as Array<Record<string, unknown>>) {
        if (
          typeof t?.id !== 'string' ||
          typeof t?.search !== 'object' ||
          typeof t?.route !== 'object' ||
          t.search === null ||
          t.route === null
        ) {
          return { ok: false, error: 'A trip in this file is missing required fields — import cancelled.' };
        }
      }
      tripCount = (inner as unknown[]).length;
    }
    data[key] = value;
  }
  if (Object.keys(data).length === 0) {
    return { ok: false, error: 'The export contains no A2Z data.' };
  }
  return { ok: true, data, tripCount };
}

/** Replace this browser's A2Z data with a validated export document. */
export async function importAllData(
  json: string,
): Promise<ServiceResult<{ keys: number; trips: number }>> {
  const validated = validateImportPayload(json);
  if (!validated.ok) return { ok: false, error: validated.error, code: 'NOT_FOUND' };
  try {
    const existing = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(APP_PREFIX));
    if (existing.length > 0) await AsyncStorage.multiRemove(existing);
    await AsyncStorage.multiSet(Object.entries(validated.data));
    return {
      ok: true,
      data: { keys: Object.keys(validated.data).length, trips: validated.tripCount },
    };
  } catch {
    return { ok: false, error: 'Could not write to browser storage.', code: 'UNAVAILABLE' };
  }
}

/** Delete every A2Z key in this browser. Irreversible — confirm first. */
export async function resetAllData(): Promise<ServiceResult<void>> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(APP_PREFIX));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'Could not clear browser storage.', code: 'UNAVAILABLE' };
  }
}
