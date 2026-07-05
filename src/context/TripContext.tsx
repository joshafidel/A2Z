/**
 * App-wide trip state: the active search, its results, the chosen route,
 * saved trips, and user preferences.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as storage from '../services/storageService';
import type { TripSearchResults } from '../services/tripService';
import type { RouteOption, SavedTrip, TravelPreference, TripSearch } from '../types';

interface TripContextValue {
  search?: TripSearch;
  results?: TripSearchResults;
  setSearchResults: (search: TripSearch, results: TripSearchResults) => void;

  savedTrips: SavedTrip[];
  activeTrip?: SavedTrip;
  saveTrip: (route: RouteOption) => Promise<boolean>;
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

  const saveTrip = useCallback(
    async (route: RouteOption) => {
      if (!search) return false;
      const result = await storage.saveTrip(search, route);
      if (!result.ok) return false;
      setSavedTrips((prev) => [result.data, ...prev.filter((t) => t.route.id !== route.id)]);
      setActiveTrip(result.data);
      return true;
    },
    [search],
  );

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
      savedTrips,
      activeTrip,
      saveTrip,
      deleteTrip,
      setActiveTrip,
      defaultPreference,
      setDefaultPreference,
    }),
    [search, results, setSearchResults, savedTrips, activeTrip, saveTrip, deleteTrip, defaultPreference],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within TripProvider');
  return ctx;
}
