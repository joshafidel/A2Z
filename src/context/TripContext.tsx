/**
 * App-wide trip state: the active search, its results, the chosen route,
 * saved trips, and user preferences.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as storage from '../services/storageService';
import type { TripSearchResults } from '../services/tripService';
import type { HotelOption, RouteOption, SavedTrip, TravelPreference, TripSearch } from '../types';

interface TripContextValue {
  search?: TripSearch;
  results?: TripSearchResults;
  setSearchResults: (search: TripSearch, results: TripSearchResults) => void;
  /** Swap a route in the current results (after a trip-builder rebuild). */
  replaceRoute: (route: RouteOption) => void;

  savedTrips: SavedTrip[];
  activeTrip?: SavedTrip;
  saveTrip: (route: RouteOption, hotel?: HotelOption) => Promise<boolean>;
  /** Re-read saved trips from storage (after out-of-band writes, e.g. demo seed). */
  refreshTrips: () => Promise<void>;
  deleteTrip: (tripId: string) => Promise<void>;
  setActiveTrip: (trip?: SavedTrip) => void;

  defaultPreference: TravelPreference;
  setDefaultPreference: (p: TravelPreference) => void;
}

const TripContext = createContext<TripContextValue | undefined>(undefined);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState<TripSearch>();
  const [results, setResults] = useState<TripSearchResults>();
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [activeTrip, setActiveTrip] = useState<SavedTrip>();
  const [defaultPreference, setDefaultPreference] = useState<TravelPreference>('easiest');

  useEffect(() => {
    storage.getSavedTrips().then((r) => {
      if (r.ok) {
        setSavedTrips(r.data);
        if (r.data.length > 0) setActiveTrip(r.data[0]);
      }
    });
  }, []);

  const setSearchResults = useCallback((s: TripSearch, r: TripSearchResults) => {
    setSearch(s);
    setResults(r);
  }, []);

  const replaceRoute = useCallback((route: RouteOption) => {
    setResults((prev) =>
      prev
        ? { ...prev, routes: prev.routes.map((r) => (r.id === route.id ? route : r)) }
        : prev,
    );
  }, []);

  const saveTrip = useCallback(
    async (route: RouteOption, hotel?: HotelOption) => {
      if (!search) return false;
      const result = await storage.saveTrip(search, route, hotel);
      if (!result.ok) return false;
      setSavedTrips((prev) => [result.data, ...prev.filter((t) => t.route.id !== route.id)]);
      setActiveTrip(result.data);
      return true;
    },
    [search],
  );

  const refreshTrips = useCallback(async () => {
    const r = await storage.getSavedTrips();
    if (r.ok) {
      setSavedTrips(r.data);
      setActiveTrip((current) => r.data.find((t) => t.id === current?.id) ?? r.data[0]);
    }
  }, []);

  const deleteTrip = useCallback(async (tripId: string) => {
    await storage.deleteTrip(tripId);
    setSavedTrips((prev) => {
      const next = prev.filter((t) => t.id !== tripId);
      setActiveTrip((current) => (current?.id === tripId ? next[0] : current));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      search,
      results,
      setSearchResults,
      replaceRoute,
      savedTrips,
      activeTrip,
      saveTrip,
      refreshTrips,
      deleteTrip,
      setActiveTrip,
      defaultPreference,
      setDefaultPreference,
    }),
    [search, results, setSearchResults, replaceRoute, savedTrips, activeTrip, saveTrip, refreshTrips, deleteTrip, defaultPreference],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within TripProvider');
  return ctx;
}
