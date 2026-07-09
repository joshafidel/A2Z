import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../components/AppButton';
import { BookingLinks } from '../components/BookingLinks';
import { CalendarPicker } from '../components/CalendarPicker';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { MapPreview } from '../components/MapPreview';
import { ModeIcon } from '../components/ModeIcon';
import { PlaceInput } from '../components/PlaceInput';
import { PriceBreakdownView } from '../components/PriceBreakdownView';
import { SectionHeader } from '../components/SectionHeader';
import { ErrorState, LoadingState } from '../components/States';
import { TimelineView } from '../components/TimelineView';
import { WarningList } from '../components/WarningList';
import { useTrip } from '../context/TripContext';
import type { PlannerScreenProps } from '../navigation/types';
import {
  accessEndpoints,
  explainAccessChoice,
  getAccessOptions,
  type AccessOption,
  type AccessPathChoice,
} from '../services/accessService';
import {
  buildBusBookingLink,
  buildFlightProviderLinks,
  buildGoogleMapsLink,
  buildTicketPurchaseLink,
} from '../services/deepLinkService';
import { aiConfigured, generateConciergePlan } from '../services/aiService';
import { openBookingLink } from '../components/BookingLinks';
import { CORRIDOR_CITIES, resolveCorridor } from '../data/cities';
import {
  airportsNear,
  busTerminalFor,
  findCityCoords,
  haversineMiles,
  nearestCity,
  trainStationFor,
} from '../data/airports';
import { resolveCityCoords } from '../services/geoService';
import { searchFlights } from '../services/flightService';
import { searchTrains } from '../services/trainService';
import { searchBuses } from '../services/busService';
import { getCurrentLocation } from '../services/locationService';
import { getHotelRecommendations, hotelAreasFor } from '../services/hotelService';
import { detectCityKey } from '../data/cities';
import * as storage from '../services/storageService';
import {
  buildRouteForTicket,
  getTicketsForMode,
  searchRoutes,
  type TicketOption,
  type TripSearchResults,
} from '../services/tripService';
import { colors, radii, shadows, spacing, typography } from '../theme';
import {
  HOTEL_AREA_LABELS,
  TIME_OF_DAY_LABELS,
  TRIP_PURPOSE_LABELS,
  type HotelArea,
  type HotelOption,
  type Place,
  type RouteOption,
  type TimeOfDay,
  type TripPurpose,
  type TripSearch,
} from '../types';
import { formatDuration, formatMoney, formatTime } from '../utils/time';

// ---------------------------------------------------------------------------
// Step machinery
// ---------------------------------------------------------------------------

type StepId =
  | 'places'
  | 'mode'
  | 'stations'
  | 'date'
  | 'tickets'
  | 'hotel'
  | 'firstMile'
  | 'lastMile'
  | 'summary';

/** A departure node (airport / rail station / bus terminal) near the origin. */
interface StationNode {
  id: string;
  kind: 'flight' | 'train' | 'bus';
  name: string;
  code?: string; // IATA for airports
  miles?: number;
  enabled: boolean;
  /** Departure stats from this node: option count, fares, typical time. */
  stats?: {
    count: number;
    minFare?: number;
    maxFare?: number;
    avgFare?: number;
    avgMinutes: number;
  };
}

function statsFromHauls(hauls: Array<{ farePerPersonUsd?: number; durationMinutes: number }>) {
  if (hauls.length === 0) return undefined;
  const fares = hauls.map((h) => h.farePerPersonUsd).filter((f): f is number => f !== undefined);
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return {
    count: hauls.length,
    minFare: fares.length > 0 ? Math.min(...fares) : undefined,
    maxFare: fares.length > 0 ? Math.max(...fares) : undefined,
    avgFare: fares.length > 0 ? avg(fares) : undefined,
    avgMinutes: avg(hauls.map((h) => h.durationMinutes)),
  };
}

type GroupKey = 'flights' | 'trains' | 'buses' | 'cars';

const GROUPS: Array<{
  key: GroupKey;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  lineHaulMode?: 'flight' | 'train' | 'bus';
  match: (r: RouteOption) => boolean;
}> = [
  { key: 'flights', title: 'Fly', icon: 'airplane', lineHaulMode: 'flight', match: (r) => r.primaryMode === 'flight' },
  { key: 'trains', title: 'Train', icon: 'train', lineHaulMode: 'train', match: (r) => r.primaryMode === 'train' },
  { key: 'buses', title: 'Bus', icon: 'bus', lineHaulMode: 'bus', match: (r) => r.primaryMode === 'bus' },
  { key: 'cars', title: 'Rental Car', icon: 'car', match: (r) => r.primaryMode === 'drive' || r.primaryMode === 'rideshare' },
];

/**
 * Which modes make real-world sense for a given trip distance. NY → Florida
 * is a flight; NY → Boston is anything. Unknown distance → everything shows.
 */
function viableModesFor(miles: number | undefined, bothAmtrak: boolean): GroupKey[] {
  if (miles === undefined) return GROUPS.map((g) => g.key);
  const viable: GroupKey[] = [];
  if (miles >= 75) viable.push('flights');
  if (bothAmtrak && miles >= 30 && miles <= 500) viable.push('trains');
  if (miles >= 25 && miles <= 400) viable.push('buses');
  if (miles <= 600) viable.push('cars');
  return viable.length > 0 ? viable : GROUPS.map((g) => g.key);
}

const STEP_TITLES: Record<StepId, string> = {
  places: 'Where are you headed?',
  mode: 'How do you want to get there?',
  stations: 'Your departure points',
  date: 'When are you leaving?',
  tickets: 'Pick your ticket',
  hotel: 'Pick your stay',
  firstMile: 'Getting to your departure point',
  lastMile: 'Finishing the trip',
  summary: 'Your trip plan',
};

const TIME_ICONS: Record<TimeOfDay, keyof typeof Ionicons.glyphMap> = {
  morning: 'sunny-outline',
  midday: 'partly-sunny-outline',
  night: 'moon-outline',
};

const TIME_OF_DAY_HOURS: Record<TimeOfDay, number> = { morning: 8, midday: 13, night: 19 };

/** Light line colors (MTA yellow, etc.) need dark badge text to stay readable. */
function isLightColor(hex?: string): boolean {
  if (!hex || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

// ---------------------------------------------------------------------------

export function PlannerScreen({ navigation, route }: PlannerScreenProps) {
  const insets = useSafeAreaInsets();
  const { defaultPreference, setSearchResults, saveTrip } = useTrip();

  // Interview answers (from/to may arrive pre-filled from the home page) ----
  const [origin, setOrigin] = useState<Place | undefined>(route.params?.origin);
  const [destination, setDestination] = useState<Place | undefined>(route.params?.destination);
  const [needHotel, setNeedHotel] = useState(false);
  const [homePlace, setHomePlace] = useState<Place>();
  const [locating, setLocating] = useState(false);
  const [stepError, setStepError] = useState<string>();
  const [date, setDate] = useState<Date>();
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>();
  const [travelers, setTravelers] = useState(1);
  const [bags, setBags] = useState(1);

  // Search + selections ------------------------------------------------------
  const [search, setSearch] = useState<TripSearch>();
  const [results, setResults] = useState<TripSearchResults>();
  const [searching, setSearching] = useState(false);
  const [groups, setGroups] = useState<GroupKey[]>([]); // multi-select travel modes
  const [modeViability, setModeViability] = useState<{ miles?: number; bothAmtrak: boolean }>();
  const [showOtherModes, setShowOtherModes] = useState(false);
  const [stations, setStations] = useState<StationNode[]>(); // toggleable departure nodes
  const [hiddenModes, setHiddenModes] = useState<Array<'flight' | 'train' | 'bus'>>([]); // ticket-board filter
  const [ticketBoards, setTicketBoards] = useState<Partial<Record<GroupKey, TicketOption[]>>>({});
  const [ticket, setTicket] = useState<TicketOption>();
  const [ticketSort, setTicketSort] = useState<'recommended' | 'price' | 'time'>('recommended');
  const [pendingTicket, setPendingTicket] = useState<TicketOption>(); // showing purchase choices
  const [purchaseIntent, setPurchaseIntent] = useState<'now' | 'end' | 'later'>();
  const [hotelTiming, setHotelTiming] = useState<'first' | 'later'>('first');
  const [directRoute, setDirectRoute] = useState<RouteOption>();
  const [purpose, setPurpose] = useState<TripPurpose>();
  const [hotelArea, setHotelArea] = useState<HotelArea>();
  const [customArea, setCustomArea] = useState('');
  const [hotelPriceSort, setHotelPriceSort] = useState(false);
  const [hotelLuxury, setHotelLuxury] = useState(false);
  const [hotels, setHotels] = useState<HotelOption[]>();
  const [hotel, setHotel] = useState<HotelOption>();
  const [hotelDecided, setHotelDecided] = useState(false);
  const [customFinal, setCustomFinal] = useState<Place>();
  const [showCustomFinal, setShowCustomFinal] = useState(false);
  const [aiPlan, setAiPlan] = useState<string>();
  const [aiSource, setAiSource] = useState<'claude' | 'local'>();
  const [aiLoading, setAiLoading] = useState(false);
  const [firstOptions, setFirstOptions] = useState<AccessOption[]>();
  const [lastOptions, setLastOptions] = useState<AccessOption[]>();
  const [firstMile, setFirstMile] = useState<AccessOption>();
  const [lastMile, setLastMile] = useState<AccessOption>();
  const [connectedApps, setConnectedApps] = useState<string[]>(); // Settings → rideshare apps
  const [expandedPaths, setExpandedPaths] = useState<string>(); // access option with open route list
  const [finalRoute, setFinalRoute] = useState<RouteOption>();
  const [building, setBuilding] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    storage.getHomePlace().then(setHomePlace);
  }, []);

  // Re-read connected rideshare apps whenever this screen regains focus,
  // so changes made in Settings apply immediately.
  useFocusEffect(
    useCallback(() => {
      storage.getConnectedRideshareApps().then(setConnectedApps);
    }, []),
  );

  // Step ordering (dynamic: stations/hotel/access steps are conditional) ----
  const selectedGroupDefs = GROUPS.filter((g) => groups.includes(g.key));
  const selectedHaulModes = selectedGroupDefs
    .map((g) => g.lineHaulMode)
    .filter((m): m is 'flight' | 'train' | 'bus' => Boolean(m));
  /** The line-haul mode driving access steps: the chosen ticket's, else the first selected. */
  const activeHaulMode: 'flight' | 'train' | 'bus' | undefined = ticket
    ? (ticket.haul.mode as 'flight' | 'train' | 'bus')
    : directRoute
      ? undefined
      : selectedHaulModes[0];
  const isLineHaul = ticket ? true : directRoute ? false : selectedHaulModes.length > 0;
  const hasStationsStep = selectedHaulModes.length > 0;
  const steps: StepId[] = useMemo(() => {
    const list: StepId[] = ['places', 'mode'];
    if (hasStationsStep) list.push('stations');
    list.push('date', 'tickets');
    if (needHotel) list.push('hotel');
    if (isLineHaul) list.push('firstMile', 'lastMile');
    list.push('summary');
    return list;
  }, [needHotel, isLineHaul, hasStationsStep]);

  // With both places handed in from the home page, start at the mode step.
  const [stepIndex, setStepIndex] = useState(
    route.params?.origin && route.params?.destination ? 1 : 0,
  );
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  const goNext = useCallback(() => {
    setStepError(undefined);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [steps.length]);

  const goBack = useCallback(() => {
    setStepError(undefined);
    if (stepIndex === 0) {
      navigation.goBack();
      return;
    }
    setStepIndex((i) => i - 1);
  }, [stepIndex, navigation]);

  // Invalidate downstream choices when upstream answers change --------------
  const resetFromMode = () => {
    setTicket(undefined);
    setPendingTicket(undefined);
    setPurchaseIntent(undefined);
    setTicketSort('recommended');
    setHiddenModes([]);
    setDirectRoute(undefined);
    setFirstOptions(undefined);
    setLastOptions(undefined);
    setFirstMile(undefined);
    setLastMile(undefined);
    setFinalRoute(undefined);
    setSaved(false);
  };
  const resetFromSearch = () => {
    setResults(undefined);
    setTicketBoards({});
    setHotels(undefined);
    setHotel(undefined);
    setHotelDecided(false);
    resetFromMode();
  };

  // --- Run the search when the date step completes --------------------------
  const runSearch = async (s: TripSearch) => {
    setSearching(true);
    setStepError(undefined);
    const result = await searchRoutes(s);
    setSearching(false);
    if (!result.ok) {
      setStepError(result.error);
      return false;
    }
    setResults(result.data);
    setSearchResults(s, result.data);
    return true;
  };

  const completeDateStep = async () => {
    if (!origin || !destination || !date) return;
    const d = new Date(date);
    d.setHours(timeOfDay ? TIME_OF_DAY_HOURS[timeOfDay] : 9, 0, 0, 0);
    const s: TripSearch = {
      origin,
      destination,
      departureTime: d.toISOString(),
      timeOfDay,
      travelers,
      bags,
      preference: defaultPreference,
    };
    setSearch(s);
    resetFromSearch();
    const ok = await runSearch(s);
    if (ok) goNext();
  };

  // --- Mode stats (cheapest / priciest / average, price + speed) ------------
  const grouped = useMemo(() => {
    if (!results) return [];
    return GROUPS.map((g) => ({ ...g, routes: results.routes.filter(g.match) })).filter(
      (g) => g.routes.length > 0,
    );
  }, [results]);

  // --- Mode viability: which ways of traveling make sense for THIS trip ----
  // The likely origin (chosen origin > saved home > current location) and the
  // destination give a real distance; absurd modes get tucked behind a toggle.
  useEffect(() => {
    if (step !== 'mode' || !destination || modeViability) return;
    let cancelled = false;
    (async () => {
      let o = origin ?? homePlace;
      if (!o) {
        const r = await getCurrentLocation();
        if (r.ok) o = r.data;
      }
      const [from, to] = await Promise.all([
        o ? resolveCityCoords(o.address) : Promise.resolve(undefined),
        resolveCityCoords(destination.address),
      ]);
      if (cancelled) return;
      setModeViability({
        miles: from && to ? haversineMiles(from, to) : undefined,
        bothAmtrak: Boolean(from?.amtrak && to?.amtrak),
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, destination, modeViability]);

  // --- Auto-locate: the places step pre-fills your current address ---------
  useEffect(() => {
    if (step !== 'places' || origin || locating) return;
    let cancelled = false;
    setLocating(true);
    getCurrentLocation().then((r) => {
      if (cancelled) return;
      setLocating(false);
      if (r.ok) {
        // The exact address lands in the search bar — edit it or continue.
        setOrigin({ ...r.data, label: r.data.address });
        setSearch(undefined);
        setStations(undefined);
        resetFromSearch();
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // --- Departure nodes: every airport/station/terminal near the origin -----
  useEffect(() => {
    if (step !== 'stations' || !origin || stations) return;
    let cancelled = false;
    (async () => {
      const resolved = await resolveCityCoords(origin.address);
      const coords =
        origin.lat !== undefined && origin.lng !== undefined
          ? { lat: origin.lat, lng: origin.lng }
          : resolved;
      if (cancelled) return;
      if (!coords) {
        setStepError(`Couldn't locate "${origin.label ?? origin.address}" — try a nearby city name.`);
        return;
      }
      const nodes: StationNode[] = [];
      if (groups.includes('flights')) {
        for (const { airport, miles } of airportsNear(coords, 80, 4)) {
          nodes.push({
            id: `air-${airport.code}`,
            kind: 'flight',
            name: `${airport.name} (${airport.code})`,
            code: airport.code,
            miles,
            enabled: true,
          });
        }
      }
      const city = resolved?.city ?? nearestCity(coords).entry.city;
      if (groups.includes('trains') && (resolved?.amtrak ?? true)) {
        nodes.push({ id: 'rail-main', kind: 'train', name: trainStationFor(city), enabled: true });
      }
      if (groups.includes('buses')) {
        nodes.push({ id: 'bus-main', kind: 'bus', name: busTerminalFor(city), enabled: true });
      }
      // Pull the departures behind each node so the cards show how many
      // options exist, the fare range, and the typical travel time.
      if (destination) {
        const corridor = resolveCorridor(
          detectCityKey(origin.address),
          detectCityKey(destination.address),
        );
        const addresses = { originAddress: origin.address, destAddress: destination.address };
        const [flights, trains, buses] = await Promise.all([
          groups.includes('flights') ? searchFlights(corridor, addresses) : undefined,
          groups.includes('trains') ? searchTrains(corridor, addresses) : undefined,
          groups.includes('buses') ? searchBuses(corridor, addresses) : undefined,
        ]);
        if (cancelled) return;
        for (const n of nodes) {
          if (n.kind === 'flight' && flights?.ok) {
            n.stats = statsFromHauls(
              flights.data.filter((f) => f.fromStation.match(/\(([A-Z]{3})\)/)?.[1] === n.code),
            );
          } else if (n.kind === 'train' && trains?.ok) {
            n.stats = statsFromHauls(trains.data);
          } else if (n.kind === 'bus' && buses?.ok) {
            n.stats = statsFromHauls(buses.data);
          }
        }
      }
      setStations(nodes);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, origin, groups, stations]);

  // --- Ticket boards for EVERY selected mode, in parallel -------------------
  useEffect(() => {
    if (step !== 'tickets' || !results || !search) return;
    let cancelled = false;
    (async () => {
      await Promise.all(
        selectedGroupDefs
          .filter((g) => g.lineHaulMode)
          .map(async (g) => {
            if (ticketBoards[g.key]) return;
            const board = await getTicketsForMode(results.corridor, g.lineHaulMode!, search);
            if (cancelled) return;
            // An empty board (no service) still marks the mode as loaded.
            setTicketBoards((prev) => ({ ...prev, [g.key]: board.ok ? board.data : [] }));
          }),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, results, search, groups]);

  // --- Hotels (prefetched while the user is still picking a ticket) --------
  useEffect(() => {
    if (!needHotel || !search) return;
    if (step !== 'hotel' && step !== 'tickets') return;
    let cancelled = false;
    (async () => {
      const cityKey = detectCityKey(search.destination.address);
      const result = await getHotelRecommendations(cityKey, {
        arrivingByAir: ticket?.haul.mode === 'flight' || groups.includes('flights'),
        destinationQuery: search.destination.address,
        purpose,
        area: hotelArea,
        customArea,
        sortByPrice: hotelPriceSort,
        luxury: hotelLuxury,
        checkinIso: search.departureTime,
        nights: 1,
      });
      if (!cancelled && result.ok) setHotels(result.data);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, search, purpose, ticket, hotelArea, customArea, hotelPriceSort, hotelLuxury, needHotel]);

  // --- Access options (prefetched in parallel from the ticket step on) ------
  useEffect(() => {
    if (!results || !search || !activeHaulMode) return;
    if (!['tickets', 'hotel', 'firstMile', 'lastMile'].includes(step)) return;
    const facets: Record<string, [string, string]> = {
      flight: ['to-airport', 'from-airport'],
      train: ['to-train', 'from-train'],
      bus: ['to-bus', 'from-bus'],
    };
    const [accessFacet, egressFacet] = facets[activeHaulMode];
    let cancelled = false;
    (async () => {
      const [first, last] = await Promise.all([
        firstOptions
          ? undefined
          : getAccessOptions(results.corridor, accessFacet, search, results.originWeather, ticket?.haul.fromStation),
        lastOptions
          ? undefined
          : getAccessOptions(results.corridor, egressFacet, search, results.destinationWeather, ticket?.haul.toStation),
      ]);
      if (cancelled) return;
      if (first) {
        if (first.ok) setFirstOptions(first.data);
        else if (step === 'firstMile') setStepError(first.error);
      }
      if (last) {
        if (last.ok) setLastOptions(last.data);
        else if (step === 'lastMile') setStepError(last.error);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, results, search, activeHaulMode, firstOptions, lastOptions]);

  // --- Final plan -------------------------------------------------------------
  useEffect(() => {
    if (step !== 'summary' || !search || !results) return;
    if (finalRoute) return;
    let cancelled = false;
    (async () => {
      setBuilding(true);
      if (isLineHaul && ticket) {
        const built = await buildRouteForTicket(search, results.corridor, ticket, firstMile, lastMile);
        if (!cancelled) {
          if (built.ok) setFinalRoute(built.data);
          else setStepError(built.error);
        }
      } else if (directRoute) {
        setFinalRoute(directRoute);
      }
      if (!cancelled) setBuilding(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, search, results, ticket, directRoute, firstMile, lastMile, isLineHaul, finalRoute]);

  const onSave = async () => {
    if (!finalRoute) return;
    const ok = await saveTrip(finalRoute, hotel);
    if (ok) setSaved(true);
  };

  /** Real purchase handoff for a ticket: Expedia / Amtrak / FlixBus. */
  const purchaseLinkFor = (t: TicketOption) => {
    if (!search || !results) return undefined;
    const originCode = t.haul.fromStation.match(/\(([A-Z]{3})\)/)?.[1];
    const destCode = t.haul.toStation.match(/\(([A-Z]{3})\)/)?.[1];
    const cities = CORRIDOR_CITIES[results.corridor as keyof typeof CORRIDOR_CITIES];
    return buildTicketPurchaseLink(t.haul.mode, {
      originCode,
      destCode,
      originCity: cities?.origin ?? findCityCoords(search.origin.address)?.city,
      destCity: cities?.dest ?? findCityCoords(search.destination.address)?.city,
      departureIso: t.departureTime,
      travelers: search.travelers,
    });
  };

  /**
   * "Book now" target: the page with THIS exact flight/train selected.
   * Flights → Google Flights resolved to the flight number; trains →
   * amtrak.com; buses → the carrier's own site.
   */
  const exactBookingLinkFor = (t: TicketOption) => {
    if (t.haul.mode === 'flight') {
      const links = flightProviderLinksFor(t);
      return links.find((l) => l.provider === 'Google Flights') ?? purchaseLinkFor(t);
    }
    if (t.haul.mode === 'bus') {
      // Straight to the carrier that runs this exact departure.
      return buildBusBookingLink(t.haul.provider, t.haul.bookingUrl);
    }
    return purchaseLinkFor(t);
  };

  const chooseTicket = (t: TicketOption, intent: 'now' | 'end' | 'later', openDefault = true) => {
    setTicket(t);
    setDirectRoute(undefined);
    setPurchaseIntent(intent);
    setPendingTicket(undefined);
    setFinalRoute(undefined);
    setAiPlan(undefined);
    // Re-fetch access legs for the exact stations on this ticket.
    setFirstOptions(undefined);
    setLastOptions(undefined);
    setFirstMile(undefined);
    setLastMile(undefined);
    if (intent === 'now' && openDefault) {
      // Automatically open the booking page with this exact flight/train.
      const link = exactBookingLinkFor(t);
      if (link) openBookingLink(link);
    }
    setTimeout(goNext, 100);
  };

  /** All flight sites for this ticket, pre-filled with the real route + date. */
  const flightProviderLinksFor = (t: TicketOption) => {
    const originCode = t.haul.fromStation.match(/\(([A-Z]{3})\)/)?.[1];
    const destCode = t.haul.toStation.match(/\(([A-Z]{3})\)/)?.[1];
    if (!originCode || !destCode) return [];
    return buildFlightProviderLinks(
      originCode,
      destCode,
      t.departureTime,
      search?.travelers ?? 1,
      t.haul.serviceName,
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const progress = (stepIndex + 1) / steps.length;

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      {/* Header: back, progress, step question */}
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.backButton} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        {stepIndex < steps.length - 1 && stepHasAnswer(step) ? (
          <Pressable onPress={goNext} style={styles.forwardButton} accessibilityLabel="Forward">
            <Ionicons name="arrow-forward" size={20} color={colors.primary} />
          </Pressable>
        ) : (
          <View style={styles.forwardButton} />
        )}
      </View>
      <Text style={styles.question}>{questionFor(step)}</Text>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {stepError ? <ErrorState message={stepError} onRetry={() => setStepError(undefined)} /> : null}

        {step === 'places' && renderPlacesStep()}
        {step === 'mode' && renderModeStep()}
        {step === 'stations' && renderStationsStep()}
        {step === 'date' && renderDateStep()}
        {step === 'tickets' && renderTicketStep()}
        {step === 'hotel' && renderHotelStep()}
        {step === 'firstMile' && renderAccessStep('first')}
        {step === 'lastMile' && renderAccessStep('last')}
        {step === 'summary' && renderSummaryStep()}
      </ScrollView>
    </View>
  );

  // ---- step helpers ---------------------------------------------------------

  /** The final destination: custom entry > hotel-as-first-stop > searched place. */
  function finalTargetLabel(): string {
    if (customFinal) return customFinal.label ?? customFinal.address.split(',')[0];
    if (hotel && hotelTiming === 'first') return hotel.name;
    return search?.destination.label ?? 'your destination';
  }

  /** Step headers name real places: the closest airport, the landing airport. */
  function questionFor(s: StepId): string {
    if (s === 'firstMile') {
      return `Getting to ${ticket?.haul.fromStation ?? 'your departure point'}`;
    }
    if (s === 'lastMile') {
      const landing = ticket?.haul.toStation ?? 'arrival';
      return `${landing} → ${finalTargetLabel()}`;
    }
    if (s === 'stations') {
      const from = origin?.label?.split(',')[0] ?? origin?.address.split(',')[0];
      return from ? `Departure points near ${from}` : STEP_TITLES[s];
    }
    return STEP_TITLES[s];
  }

  function stepHasAnswer(s: StepId): boolean {
    switch (s) {
      case 'places':
        return Boolean(origin && destination);
      case 'stations':
        return Boolean(stations?.some((n) => n.enabled));
      case 'date':
        return Boolean(results);
      case 'mode':
        return groups.length > 0;
      case 'tickets':
        return Boolean(ticket || directRoute);
      case 'hotel':
        return hotelDecided; // picking a hotel or explicitly skipping both count
      case 'firstMile':
        return Boolean(firstMile);
      case 'lastMile':
        return Boolean(lastMile);
      default:
        return false;
    }
  }

  function renderPlacesStep() {
    const setFromPlace = (p: Place) => {
      setOrigin(p);
      setStations(undefined);
      setSearch(undefined);
      resetFromSearch();
    };
    const setToPlace = (p: Place) => {
      setDestination(p);
      setModeViability(undefined); // distance changed — re-check viable modes
      setShowOtherModes(false);
      setStations(undefined);
      setSearch(undefined);
      resetFromSearch();
    };
    return (
      <View style={styles.stepBody}>
        <Text style={styles.fieldLabel}>FROM</Text>
        <PlaceInput
          placeholder={locating ? 'Finding your location…' : 'Address, station, or airport'}
          value={origin?.label}
          onSelect={(p) => setFromPlace({ address: p.address, label: p.label })}
        />

        {/* The direction of travel, made obvious */}
        <View style={styles.arrowRow}>
          <View style={styles.arrowLine} />
          <View style={styles.arrowCircle}>
            <Ionicons name="arrow-down" size={16} color="#FFFFFF" />
          </View>
          <View style={styles.arrowLine} />
        </View>

        <Text style={styles.fieldLabel}>TO</Text>
        <PlaceInput
          placeholder="City, address, or hotel"
          value={destination?.label}
          autoFocus={!destination}
          onSelect={(p) => setToPlace({ address: p.address, label: p.label })}
        />

        <View style={styles.quickRow}>
          {homePlace && (
            <Chip
              label={`From home · ${homePlace.label ?? homePlace.address.split(',')[0]}`}
              icon="home"
              selected={origin?.address === homePlace.address}
              onPress={() => setFromPlace({ ...homePlace, label: 'Home' })}
            />
          )}
          <Chip
            label={locating ? 'Locating…' : 'From current location'}
            icon="locate"
            onPress={async () => {
              setLocating(true);
              const r = await getCurrentLocation();
              setLocating(false);
              if (r.ok) setFromPlace({ ...r.data, label: r.data.address });
              else setStepError(r.error);
            }}
          />
        </View>

        {origin && destination && (
          <AppButton
            label={`Plan ${origin.label?.split(',')[0] ?? 'here'} → ${destination.label?.split(',')[0] ?? 'there'}`}
            icon="arrow-forward"
            onPress={goNext}
          />
        )}

        {origin && origin.label !== 'Home' && (
          <Pressable
            style={styles.saveHomeRow}
            onPress={async () => {
              await storage.setHomePlace(origin);
              setHomePlace(origin);
            }}
          >
            <Ionicons
              name={homePlace?.address === origin.address ? 'star' : 'star-outline'}
              size={16}
              color={colors.warning}
            />
            <Text style={styles.saveHomeText}>
              {homePlace?.address === origin.address
                ? 'Saved as your home'
                : `Save "${origin.label}" as home`}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  function renderDateStep() {
    if (searching) return <LoadingState message="Curating every way to get there…" />;
    return (
      <View style={[styles.stepBody, styles.dateStepBody]}>
        <CalendarPicker selected={date} onSelect={setDate} />

        <Text style={styles.subLabel}>DEPARTURE WINDOW (OPTIONAL)</Text>
        <View style={styles.quickRow}>
          {(Object.keys(TIME_OF_DAY_LABELS) as TimeOfDay[]).map((t) => (
            <Chip
              key={t}
              label={TIME_OF_DAY_LABELS[t]}
              icon={TIME_ICONS[t]}
              selected={timeOfDay === t}
              onPress={() => setTimeOfDay((prev) => (prev === t ? undefined : t))}
            />
          ))}
        </View>

        <View style={styles.countRow}>
          <Counter label="Travelers" icon="people" value={travelers} min={1} onChange={setTravelers} />
          <Counter label="Bags" icon="briefcase" value={bags} min={0} onChange={setBags} />
        </View>

        <Card style={styles.hotelAsk}>
          <Pressable
            onPress={() => setNeedHotel((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: needHotel }}
            style={styles.hotelAskRow}
          >
            <View style={[styles.checkbox, needHotel && styles.checkboxChecked]}>
              {needHotel && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
            </View>
            <Ionicons name="bed" size={18} color={colors.primary} />
            <Text style={styles.hotelAskText}>I need a hotel there</Text>
          </Pressable>
          {needHotel && (
            <View style={styles.timingBlock}>
              <Text style={styles.timingLabel}>WHEN DO YOU GET THERE?</Text>
              {(
                [
                  { value: 'first', label: 'The hotel is my first stop' },
                  { value: 'later', label: "I'm going somewhere else first" },
                ] as const
              ).map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setHotelTiming(opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: hotelTiming === opt.value }}
                  style={styles.timingRow}
                >
                  <Ionicons
                    name={hotelTiming === opt.value ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={hotelTiming === opt.value ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.timingText,
                      hotelTiming === opt.value && styles.timingTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </Card>

        <AppButton
          label={date ? `Continue — ${date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}` : 'Pick a date to continue'}
          icon="arrow-forward"
          onPress={completeDateStep}
          disabled={!date}
        />
      </View>
    );
  }

  function renderModeStep() {
    if (!modeViability) {
      return <LoadingState message="Checking which ways make sense for this trip…" />;
    }
    const viableKeys = viableModesFor(modeViability.miles, modeViability.bothAmtrak);
    const viable = GROUPS.filter((g) => viableKeys.includes(g.key));
    const others = GROUPS.filter((g) => !viableKeys.includes(g.key));

    const toggleGroup = (key: GroupKey) => {
      setGroups((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
      setStations(undefined);
      setTicketBoards({});
      resetFromMode();
    };
    const renderModeCard = (g: (typeof GROUPS)[number]) => {
      const checked = groups.includes(g.key);
      return (
        <Pressable
          key={g.key}
          onPress={() => toggleGroup(g.key)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          style={({ pressed }) => [
            styles.modeCard,
            checked && styles.modeCardSelected,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.modeHeader}>
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
            </View>
            <View style={styles.modeIconCircle}>
              <Ionicons name={g.icon} size={20} color={colors.primary} />
            </View>
            <Text style={styles.modeTitle}>{g.title}</Text>
          </View>
        </Pressable>
      );
    };
    return (
      <View style={styles.stepBody}>
        <Text style={styles.stepHint}>
          {modeViability.miles !== undefined
            ? `About ${modeViability.miles} miles away — these are the ways that make sense. Check every one you'd consider.`
            : "Check every way you'd consider — we'll pull real departures for all of them."}
        </Text>
        {viable.map(renderModeCard)}

        {others.length > 0 && (
          <>
            <Pressable
              onPress={() => setShowOtherModes((v) => !v)}
              style={({ pressed }) => [styles.otherModesToggle, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ expanded: showOtherModes }}
            >
              <Ionicons
                name={showOtherModes ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.otherModesText}>
                {others.length} more way{others.length === 1 ? '' : 's'} to travel (
                {others.map((g) => g.title).join(', ')}) — not ideal for this distance
              </Text>
            </Pressable>
            {showOtherModes && others.map(renderModeCard)}
          </>
        )}

        <AppButton
          label={groups.length > 0 ? 'Continue' : 'Pick at least one'}
          icon="arrow-forward"
          disabled={groups.length === 0}
          onPress={goNext}
        />
      </View>
    );
  }

  function renderStationsStep() {
    if (!stations) return <LoadingState message="Finding airports & stations near you…" />;
    if (stations.length === 0) {
      return (
        <View style={styles.stepBody}>
          <Text style={styles.stepHint}>
            No airports or stations found near your departure point for the modes you picked —
            go back and adjust your travel modes.
          </Text>
        </View>
      );
    }
    const toggle = (id: string) =>
      setStations((prev) => prev?.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n)));
    const KIND_ICONS: Record<StationNode['kind'], keyof typeof Ionicons.glyphMap> = {
      flight: 'airplane',
      train: 'train',
      bus: 'bus',
    };
    return (
      <View style={styles.stepBody}>
        <Text style={styles.stepHint}>
          These are your departure points. Turn one off and we won't show tickets leaving from it.
        </Text>
        {stations.map((n) => (
          <Pressable
            key={n.id}
            onPress={() => toggle(n.id)}
            accessibilityRole="switch"
            accessibilityState={{ checked: n.enabled }}
            style={({ pressed }) => [
              styles.ticketCard,
              n.enabled && styles.modeCardSelected,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.ticketRow}>
              <View style={styles.modeIconCircle}>
                <Ionicons
                  name={KIND_ICONS[n.kind]}
                  size={18}
                  color={n.enabled ? colors.primary : colors.textMuted}
                />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.ticketTimes}>{n.name}</Text>
                {n.stats && (
                  <Text style={styles.ticketMeta}>
                    {n.stats.count} option{n.stats.count === 1 ? '' : 's'}
                    {n.stats.minFare !== undefined && n.stats.maxFare !== undefined
                      ? ` · ${formatMoney(n.stats.minFare)}–${formatMoney(n.stats.maxFare)}${
                          n.stats.avgFare !== undefined ? ` (avg ${formatMoney(n.stats.avgFare)})` : ''
                        }`
                      : ''}
                    {` · ~${formatDuration(n.stats.avgMinutes)}`}
                  </Text>
                )}
                {!n.stats && (
                  <Text style={styles.ticketMeta}>No direct departures found from here</Text>
                )}
                <Text style={styles.ticketMeta}>
                  {n.miles !== undefined ? `${n.miles} mi away · ` : ''}
                  {n.enabled ? 'Included in your ticket search' : 'Turned off — no tickets from here'}
                </Text>
              </View>
              <Ionicons
                name={n.enabled ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={n.enabled ? colors.success : colors.textMuted}
              />
            </View>
          </Pressable>
        ))}
        <AppButton
          label={stations.some((n) => n.enabled) ? 'Continue' : 'Turn on at least one'}
          icon="arrow-forward"
          disabled={!stations.some((n) => n.enabled)}
          onPress={goNext}
        />
      </View>
    );
  }

  function renderTicketStep() {
    const haulGroups = selectedGroupDefs.filter((g) => g.lineHaulMode);
    const directGroups = selectedGroupDefs.filter((g) => !g.lineHaulMode);

    // Station gating: tickets only from departure points left turned ON.
    const airportNodes = stations?.filter((n) => n.kind === 'flight') ?? [];
    const enabledCodes = new Set(
      airportNodes.filter((n) => n.enabled).map((n) => n.code).filter(Boolean),
    );
    const kindEnabled = (kind: StationNode['kind']) => {
      const nodes = stations?.filter((n) => n.kind === kind) ?? [];
      return nodes.length === 0 || nodes.some((n) => n.enabled);
    };
    const stationAllows = (t: TicketOption) => {
      if (t.haul.mode === 'flight') {
        if (airportNodes.length === 0) return true;
        const code = t.haul.fromStation.match(/\(([A-Z]{3})\)/)?.[1];
        return code ? enabledCodes.has(code) : true;
      }
      if (t.haul.mode === 'train') return kindEnabled('train');
      if (t.haul.mode === 'bus') return kindEnabled('bus');
      return true;
    };

    if (haulGroups.length > 0 && haulGroups.some((g) => !ticketBoards[g.key])) {
      return <LoadingState message="Pulling departures from every mode you picked…" />;
    }

    const allTickets = haulGroups.flatMap((g) => (ticketBoards[g.key] ?? []).filter(stationAllows));
    const presentModes = (['flight', 'train', 'bus'] as const).filter((m) =>
      allTickets.some((t) => t.haul.mode === m),
    );
    const merged = allTickets.filter(
      (t) => !hiddenModes.includes(t.haul.mode as 'flight' | 'train' | 'bus'),
    );
    const sorted = [...merged].sort((a, b) => {
      if (ticketSort === 'price') {
        return (a.farePerPersonUsd ?? Infinity) - (b.farePerPersonUsd ?? Infinity);
      }
      if (ticketSort === 'time') {
        return new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime();
      }
      // recommended first, then by departure
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      return new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime();
    });

    const directOptions = directGroups.flatMap((g) => grouped.find((x) => x.key === g.key)?.routes ?? []);

    if (allTickets.length === 0 && directOptions.length === 0) {
      return (
        <View style={styles.stepBody}>
          <Text style={styles.stepHint}>
            No departures from your enabled stations for the modes you picked. Turn a departure
            point back on, or go back and add another travel mode.
          </Text>
        </View>
      );
    }

    const MODE_FILTER_META: Record<'flight' | 'train' | 'bus', { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
      flight: { label: 'Flights', icon: 'airplane' },
      train: { label: 'Trains', icon: 'train' },
      bus: { label: 'Buses', icon: 'bus' },
    };
    const filterRow = presentModes.length > 1 && (
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>SHOW</Text>
        {presentModes.map((m) => (
          <Chip
            key={m}
            label={MODE_FILTER_META[m].label}
            icon={MODE_FILTER_META[m].icon}
            selected={!hiddenModes.includes(m)}
            onPress={() =>
              setHiddenModes((prev) =>
                prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
              )
            }
          />
        ))}
      </View>
    );

    const ticketList = (
        <>
          {filterRow}
          {sorted.length === 0 && allTickets.length > 0 && (
            <Text style={styles.stepHint}>
              Every mode is hidden — tap a filter above to bring tickets back.
            </Text>
          )}
          {sorted.length > 0 && (
          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>SORT BY</Text>
            <Chip label="Recommended" selected={ticketSort === 'recommended'} onPress={() => setTicketSort('recommended')} />
            <Chip label="Price" selected={ticketSort === 'price'} onPress={() => setTicketSort('price')} />
            <Chip label="Time of day" selected={ticketSort === 'time'} onPress={() => setTicketSort('time')} />
          </View>
          )}
          {sorted.map((t) => {
            const isPending = pendingTicket?.haul.id === t.haul.id;
            const bookLink = exactBookingLinkFor(t);
            return (
              <Pressable
                key={t.haul.id}
                onPress={() => setPendingTicket(isPending ? undefined : t)}
                style={({ pressed }) => [
                  styles.ticketCard,
                  (isPending || ticket?.haul.id === t.haul.id) && styles.modeCardSelected,
                  t.recommended && styles.ticketRecommended,
                  pressed && styles.pressed,
                ]}
              >
                {t.recommended && (
                  <View style={styles.recommendBanner}>
                    <Ionicons name="star" size={11} color="#FFFFFF" />
                    <Text style={styles.recommendBannerText}>RECOMMENDED</Text>
                  </View>
                )}
                <View style={styles.ticketRow}>
                  <ModeIcon mode={t.haul.mode} size={15} />
                  <View style={styles.flex1}>
                    <Text style={styles.ticketTimes}>
                      {formatTime(t.departureTime)} → {formatTime(t.arrivalTime)}
                    </Text>
                    <Text style={styles.ticketMeta}>
                      {t.haul.provider} {t.haul.serviceName} · {formatDuration(t.haul.durationMinutes)}
                    </Text>
                    <Text style={styles.ticketMeta} numberOfLines={1}>
                      {t.haul.fromStation} → {t.haul.toStation}
                    </Text>
                    {t.note ? <Text style={styles.ticketNote}>{t.note}</Text> : null}
                  </View>
                  <View style={styles.ticketPriceWrap}>
                    <Text style={styles.ticketPrice}>
                      {t.farePerPersonUsd !== undefined ? formatMoney(t.farePerPersonUsd) : '—'}
                    </Text>
                    <Text style={styles.ticketPriceUnit}>per person</Text>
                  </View>
                </View>

                {/* Purchase choices appear when the ticket is tapped */}
                {isPending && (
                  <View style={styles.purchasePanel}>
                    <AppButton
                      label="Book now"
                      icon="cart"
                      small
                      onPress={() => chooseTicket(t, 'now')}
                    />
                    <Text style={styles.purchaseHint}>
                      Opens {bookLink?.provider ?? 'the booking site'} with this exact{' '}
                      {t.haul.mode === 'flight' ? 'flight' : t.haul.mode} at the cheapest fare.
                    </Text>
                    <View style={styles.purchaseRow}>
                      <AppButton
                        label="Buy at the end"
                        variant="secondary"
                        small
                        style={styles.flex1}
                        onPress={() => chooseTicket(t, 'end')}
                      />
                      <AppButton
                        label="Book later"
                        variant="ghost"
                        small
                        style={styles.flex1}
                        onPress={() => chooseTicket(t, 'later')}
                      />
                    </View>
                  </View>
                )}
              </Pressable>
            );
          })}
        </>
    );

    if (directOptions.length === 0) {
      return <View style={styles.stepBody}>{ticketList}</View>;
    }

    const options = directOptions;
    const bestId = options.reduce(
      (best, r) => ((r.score?.overall ?? 0) > (options.find((o) => o.id === best)?.score?.overall ?? -1) ? r.id : best),
      options[0]?.id,
    );
    return (
      <View style={styles.stepBody}>
        {ticketList}
        <Text style={styles.stepHint}>
          {sorted.length > 0 ? 'Or go without a ticket:' : 'Pick your exact option — recommended first.'}
        </Text>
        {[...options]
          .sort((a, b) => (a.id === bestId ? -1 : b.id === bestId ? 1 : 0))
          .map((r) => (
            <Pressable
              key={r.id}
              onPress={() => {
                setDirectRoute(r);
                setTicket(undefined);
                setFinalRoute(undefined);
                setTimeout(goNext, 100);
              }}
              style={({ pressed }) => [
                styles.ticketCard,
                directRoute?.id === r.id && styles.modeCardSelected,
                r.id === bestId && styles.ticketRecommended,
                pressed && styles.pressed,
              ]}
            >
              {r.id === bestId && (
                <View style={styles.recommendBanner}>
                  <Ionicons name="star" size={11} color="#FFFFFF" />
                  <Text style={styles.recommendBannerText}>RECOMMENDED</Text>
                </View>
              )}
              <View style={styles.ticketRow}>
                <ModeIcon mode={r.primaryMode} size={16} />
                <View style={styles.flex1}>
                  <Text style={styles.ticketTimes}>{r.title}</Text>
                  <Text style={styles.ticketMeta}>
                    {r.summary} · {formatDuration(r.totalDurationMinutes)}
                  </Text>
                </View>
                <Text style={styles.ticketPrice}>{formatMoney(r.totalPriceUsd)}</Text>
              </View>
            </Pressable>
          ))}
      </View>
    );
  }

  function renderHotelStep() {
    // Area choices adapt to the destination — no beach option in Kansas City.
    const areas = search
      ? hotelAreasFor(detectCityKey(search.destination.address), search.destination.address)
      : (Object.keys(HOTEL_AREA_LABELS) as HotelArea[]);
    const areaSelector = (
      <>
        <Text style={styles.subLabel}>WHERE DO YOU WANT TO BE?</Text>
        <View style={styles.quickRow}>
          {areas.map((a) => (
            <Chip
              key={a}
              label={HOTEL_AREA_LABELS[a]}
              selected={hotelArea === a}
              onPress={() => {
                setHotelArea((prev) => (prev === a ? undefined : a));
                setHotels(undefined);
              }}
            />
          ))}
          <Chip
            label="Luxury"
            icon="diamond"
            selected={hotelLuxury}
            onPress={() => {
              setHotelLuxury((v) => !v);
              setHotels(undefined);
            }}
          />
          <Chip
            label="Sort by price instead"
            icon="pricetag"
            selected={hotelPriceSort}
            onPress={() => {
              setHotelPriceSort((v) => !v);
              setHotels(undefined);
            }}
          />
        </View>
        {hotelArea === 'custom' && (
          <PlaceInput
            placeholder='Where exactly? e.g. "near the convention center"'
            value={customArea || undefined}
            onSelect={(p) => {
              setCustomArea(p.label);
              setHotels(undefined);
            }}
          />
        )}
      </>
    );

    if (!hotels) {
      return (
        <View style={styles.stepBody}>
          {areaSelector}
          <LoadingState message="Finding stays that match…" />
        </View>
      );
    }
    return (
      <View style={styles.stepBody}>
        {areaSelector}

        <Text style={styles.subLabel}>WHAT'S THE OCCASION?</Text>
        <View style={styles.quickRow}>
          {(Object.keys(TRIP_PURPOSE_LABELS) as TripPurpose[]).map((p) => (
            <Chip
              key={p}
              label={TRIP_PURPOSE_LABELS[p]}
              selected={purpose === p}
              onPress={() => {
                setPurpose((prev) => (prev === p ? undefined : p));
                setHotels(undefined); // reload with the new purpose
              }}
            />
          ))}
        </View>

        {hotels.map((h) => (
          <Pressable
            key={h.id}
            onPress={() => {
              setHotel(h);
              setHotelDecided(true);
              setTimeout(goNext, 100);
            }}
            style={({ pressed }) => [
              styles.ticketCard,
              hotel?.id === h.id && styles.modeCardSelected,
              pressed && styles.pressed,
            ]}
          >
            {h.whyRecommended ? (
              <View style={styles.whyRow}>
                <Ionicons name="sparkles" size={12} color={colors.primary} />
                <Text style={styles.whyText}>{h.whyRecommended}</Text>
              </View>
            ) : null}
            <View style={styles.ticketRow}>
              <View style={styles.flex1}>
                <Text style={styles.ticketTimes}>{h.name}</Text>
                <Text style={styles.ticketMeta}>
                  {h.area} · ★ {h.rating.toFixed(1)} · {h.distanceLabel}
                </Text>
              </View>
              <View style={styles.ticketPriceWrap}>
                <Text style={styles.ticketPrice}>${h.pricePerNightUsd}</Text>
                <Text style={styles.ticketPriceUnit}>per night</Text>
              </View>
            </View>
          </Pressable>
        ))}

        <AppButton
          label="Skip — no hotel needed"
          variant="ghost"
          onPress={() => {
            setHotel(undefined);
            setHotelDecided(true);
            goNext();
          }}
        />
      </View>
    );
  }

  function renderAccessStep(which: 'first' | 'last') {
    const options = which === 'first' ? firstOptions : lastOptions;
    const selected = which === 'first' ? firstMile : lastMile;
    const setSelected = which === 'first' ? setFirstMile : setLastMile;
    const wx = which === 'first' ? results?.originWeather : results?.destinationWeather;
    const target = which === 'first' ? ticket?.haul.fromStation ?? 'your departure point' : finalTargetLabel();

    // Live Google Maps directions for this exact stretch — real subway/bus
    // lines, real times, straight from Maps.
    const facetsByMode: Record<string, [string, string]> = {
      flight: ['to-airport', 'from-airport'],
      train: ['to-train', 'from-train'],
      bus: ['to-bus', 'from-bus'],
    };
    const station = which === 'first' ? ticket?.haul.fromStation : ticket?.haul.toStation;
    const endpoints =
      results && search && activeHaulMode
        ? accessEndpoints(
            results.corridor,
            facetsByMode[activeHaulMode][which === 'first' ? 0 : 1],
            search,
            station,
          )
        : undefined;
    const mapsTo =
      which === 'last'
        ? customFinal?.address ??
          (hotel && hotelTiming === 'first'
            ? `${hotel.name}, ${search?.destination.address ?? ''}`
            : endpoints?.to)
        : endpoints?.to;
    const mapsLink = endpoints && mapsTo ? buildGoogleMapsLink(endpoints.from, mapsTo, 'transit') : undefined;

    if (!options) return <LoadingState message="Pricing every way to connect…" />;

    // Only rides from apps the traveler has connected in Settings.
    const visible = options.filter((o) => {
      if (!o.provider) return true;
      const app = o.provider === 'Uber Shuttle' ? 'Uber' : o.provider;
      return !connectedApps || connectedApps.includes(app);
    });

    const choosePath = (o: AccessOption, p: AccessPathChoice) => {
      setSelected({
        ...o,
        legs: p.legs,
        durationMinutes: p.durationMinutes,
        costUsd: p.costUsd,
        costLabel: p.costUsd === 0 ? 'Free' : `$${p.costUsd.toFixed(2).replace(/\.00$/, '')}`,
        description: p.legs.map((l) => l.title).join(' → '),
      });
      setFinalRoute(undefined);
      setTimeout(goNext, 100);
    };

    return (
      <View style={styles.stepBody}>
        <Text style={styles.stepHint}>
          {which === 'first' ? `To ${target}` : `From ${ticket?.haul.toStation ?? 'arrival'} to ${target}`} —{' '}
          {explainAccessChoice(visible, wx, search?.bags ?? 0)}
        </Text>

        {/* Custom final destination — someone's house, an office, anywhere */}
        {which === 'last' && (
          <View>
            <Pressable
              onPress={() => setShowCustomFinal((v) => !v)}
              style={({ pressed }) => [styles.customFinalToggle, pressed && styles.pressed]}
            >
              <Ionicons
                name={customFinal ? 'location' : 'add-circle-outline'}
                size={16}
                color={colors.primary}
              />
              <Text style={styles.customFinalText}>
                {customFinal
                  ? `Final destination: ${finalTargetLabel()} (tap to change)`
                  : 'Add a custom final destination'}
              </Text>
            </Pressable>
            {showCustomFinal && (
              <PlaceInput
                placeholder="Exact address, someone's house, an office…"
                value={customFinal?.label}
                autoFocus
                onSelect={(p) => {
                  setCustomFinal({ address: p.address, label: p.label });
                  setShowCustomFinal(false);
                  setFinalRoute(undefined);
                }}
              />
            )}
          </View>
        )}
        {visible.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => {
              setSelected(o);
              setFinalRoute(undefined);
              setTimeout(goNext, 100);
            }}
            style={({ pressed }) => [
              styles.ticketCard,
              selected?.id === o.id && styles.modeCardSelected,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.ticketRow}>
              <ModeIcon mode={o.modes[0] ?? 'walk'} size={15} />
              <View style={styles.flex1}>
                <View style={styles.badgeRow}>
                  <Text style={styles.ticketTimes}>{o.title}</Text>
                  {o.badges.map((b) => (
                    <View key={b} style={[styles.tag, TAG_STYLES[b]]}>
                      <Text style={styles.tagText}>{TAG_LABELS[b]}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.ticketMeta} numberOfLines={2}>
                  {o.description}
                </Text>
              </View>
              <View style={styles.ticketPriceWrap}>
                <Text style={styles.ticketPrice}>{o.costLabel}</Text>
                <Text style={styles.ticketPriceUnit}>{formatDuration(o.durationMinutes)}</Text>
              </View>
            </View>

            {/* Apple Maps-style route choices: pick your exact lines */}
            {o.pathChoices && o.pathChoices.length > 1 && (
              <>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    setExpandedPaths((prev) => (prev === o.id ? undefined : o.id));
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: expandedPaths === o.id }}
                  style={styles.pathToggle}
                >
                  <Ionicons
                    name={expandedPaths === o.id ? 'chevron-down' : 'chevron-forward'}
                    size={14}
                    color={colors.primary}
                  />
                  <Text style={styles.pathToggleText}>
                    {o.pathChoices.length} routes — pick your subway & bus lines
                  </Text>
                </Pressable>
                {expandedPaths === o.id &&
                  o.pathChoices.map((p) => {
                    const walkMin = p.legs
                      .filter((l) => l.mode === 'walk')
                      .reduce((a, l) => a + l.durationMinutes, 0);
                    const headway = p.legs.find((l) => l.headwayMinutes)?.headwayMinutes;
                    const metaParts = [
                      p.departIso && p.arriveIso
                        ? `${formatTime(p.departIso)} – ${formatTime(p.arriveIso)}`
                        : undefined,
                      p.costUsd > 0 ? `$${p.costUsd.toFixed(2).replace(/\.00$/, '')}` : undefined,
                      walkMin > 0 ? `${walkMin} min walking` : undefined,
                      headway ? `every ${headway} min` : undefined,
                    ].filter(Boolean);
                    return (
                      <Pressable
                        key={p.id}
                        onPress={(e) => {
                          e.stopPropagation();
                          choosePath(o, p);
                        }}
                        style={({ pressed }) => [styles.pathRow, pressed && styles.pressed]}
                      >
                        <View style={styles.flex1}>
                          {/* Line badges, Google/Apple Maps-style */}
                          <View style={styles.badgeRow}>
                            {p.legs.map((l, i) => (
                              <React.Fragment key={`${p.id}-${i}`}>
                                {i > 0 && (
                                  <Ionicons
                                    name="chevron-forward"
                                    size={10}
                                    color={colors.textMuted}
                                  />
                                )}
                                {l.mode === 'walk' ? (
                                  <Ionicons name="walk" size={14} color={colors.textSecondary} />
                                ) : l.lineName ? (
                                  <View
                                    style={[
                                      styles.lineBadge,
                                      { backgroundColor: l.lineColor ?? colors.primary },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.lineBadgeText,
                                        isLightColor(l.lineColor) && styles.lineBadgeTextDark,
                                      ]}
                                    >
                                      {l.lineName}
                                    </Text>
                                  </View>
                                ) : (
                                  <Ionicons name="bus" size={14} color={colors.textSecondary} />
                                )}
                              </React.Fragment>
                            ))}
                          </View>
                          <Text style={styles.pathMeta} numberOfLines={2}>
                            {metaParts.length > 0
                              ? metaParts.join(' · ')
                              : p.legs.map((l) => l.title).join(' → ')}
                          </Text>
                        </View>
                        <View style={styles.ticketPriceWrap}>
                          <Text style={styles.pathTime}>{formatDuration(p.durationMinutes)}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
              </>
            )}
          </Pressable>
        ))}

        {mapsLink && (
          <Pressable
            onPress={() => Linking.openURL(mapsLink.webUrl)}
            style={({ pressed }) => [styles.customFinalToggle, pressed && styles.pressed]}
          >
            <Ionicons name="map" size={16} color={colors.primary} />
            <Text style={styles.customFinalText}>
              Live directions in Google Maps — exact subway, bus & times
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  function renderSummaryStep() {
    if (building || !finalRoute) {
      return <LoadingState message="Assembling your door-to-door plan…" />;
    }
    return (
      <View style={styles.stepBody}>
        <Card style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>{finalRoute.title}</Text>
          <Text style={styles.summaryMeta}>
            {formatTime(finalRoute.departureTime)} → {formatTime(finalRoute.arrivalTime)} ·{' '}
            {formatDuration(finalRoute.totalDurationMinutes)} · {formatMoney(finalRoute.totalPriceUsd)}
          </Text>
          {hotel && (
            <View style={styles.summaryHotel}>
              <Ionicons name="bed" size={15} color={colors.primary} />
              <Text style={styles.summaryHotelText}>
                {hotel.name} — ${hotel.pricePerNightUsd}/night ·{' '}
                {hotelTiming === 'first' ? 'your first stop' : 'checking in later'}
              </Text>
            </View>
          )}
        </Card>

        {/* Ticket queued for purchase at the end of planning */}
        {purchaseIntent === 'end' && ticket && (
          <Card style={styles.buyNowCard}>
            <View style={styles.flex1}>
              <Text style={styles.buyNowTitle}>Finish your booking</Text>
              <Text style={styles.buyNowText}>
                You queued {ticket.haul.provider} {ticket.haul.serviceName} (
                {formatTime(ticket.departureTime)}) to buy at the end — this is the end!
              </Text>
            </View>
            <AppButton
              label="Buy ticket"
              icon="cart"
              small
              onPress={() => {
                const link = exactBookingLinkFor(ticket);
                if (link) openBookingLink(link);
              }}
            />
          </Card>
        )}

        {/* AI Concierge — a curated, human plan for these exact points */}
        <Card style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={styles.aiTitle}>A2Z Concierge</Text>
            {aiSource === 'claude' && <Text style={styles.aiBadge}>Powered by Claude</Text>}
          </View>
          {aiPlan ? (
            <Text style={styles.aiText}>{aiPlan}</Text>
          ) : (
            <>
              <Text style={styles.aiHint}>
                Get a curated briefing for this exact trip — what your day looks like, the moments
                that matter, and what to do if something slips.
                {!aiConfigured() && ' (Add EXPO_PUBLIC_ANTHROPIC_API_KEY for live Claude curation.)'}
              </Text>
              <AppButton
                label="Curate my travel plan"
                icon="sparkles"
                variant="secondary"
                small
                loading={aiLoading}
                onPress={async () => {
                  if (!search || !finalRoute) return;
                  setAiLoading(true);
                  const result = await generateConciergePlan({
                    search: customFinal
                      ? { ...search, destination: customFinal }
                      : search,
                    route: finalRoute,
                    hotel,
                    originWeather: results?.originWeather,
                    destinationWeather: results?.destinationWeather,
                  });
                  setAiLoading(false);
                  if (result.ok) {
                    setAiPlan(result.data.text);
                    setAiSource(result.data.source);
                  }
                }}
              />
            </>
          )}
        </Card>

        <WarningList warnings={finalRoute.warnings} />
        <MapPreview route={finalRoute} />

        <Card>
          <SectionHeader
            title="Door-to-door timeline"
            subtitle={`Leave by ${formatTime(finalRoute.recommendedLeaveTime)}`}
          />
          <TimelineView steps={finalRoute.timeline} />
        </Card>

        <Card>
          <SectionHeader title="Price breakdown" />
          <PriceBreakdownView breakdown={finalRoute.priceBreakdown} />
        </Card>

        <Card>
          <SectionHeader title="Book & navigate" />
          <BookingLinks links={finalRoute.bookingLinks} />
          {hotel && (
            <AppButton
              label={`Book ${hotel.name}`}
              icon="bed"
              variant="secondary"
              small
              style={styles.hotelBookButton}
              onPress={() => Linking.openURL(hotel.bookingUrl)}
            />
          )}
        </Card>

        {saved ? (
          <Card style={styles.savedCard}>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <Text style={styles.savedText}>
              Trip saved! Find it in the My Trip tab — turn on reminders there to get walk/ride
              alerts with grace periods.
            </Text>
          </Card>
        ) : (
          <AppButton label="Save this trip" icon="bookmark" onPress={onSave} />
        )}
        <AppButton
          label="Plan another trip"
          variant="ghost"
          onPress={() => navigation.popToTop()}
        />
      </View>
    );
  }
}

// ---------------------------------------------------------------------------

function Counter({
  label,
  icon,
  value,
  min,
  onChange,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  min: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.counter}>
      <Ionicons name={icon} size={15} color={colors.textSecondary} />
      <Text style={styles.counterLabel}>{label}</Text>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} style={styles.counterButton}>
        <Ionicons name="remove" size={16} color={colors.primary} />
      </Pressable>
      <Text style={styles.counterValue}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(8, value + 1))} style={styles.counterButton}>
        <Ionicons name="add" size={16} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const TAG_LABELS: Record<'recommended' | 'cheapest' | 'fastest', string> = {
  recommended: 'Recommended',
  cheapest: 'Cheapest',
  fastest: 'Fastest',
};

const TAG_STYLES = StyleSheet.create({
  recommended: { backgroundColor: colors.primary },
  cheapest: { backgroundColor: colors.badgeCheap },
  fastest: { backgroundColor: colors.badgeFast },
});

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  forwardButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: colors.primary },
  question: {
    ...typography.title,
    color: colors.ink,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  content: { padding: spacing.lg, paddingBottom: 120 },
  stepBody: { gap: spacing.md },
  dateStepBody: { width: '100%', maxWidth: 380, alignSelf: 'center' },
  stepHint: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: spacing.md,
    fontWeight: '500',
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  saveHomeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  saveHomeText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  hotelAsk: { gap: spacing.xs },
  hotelAskRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  hotelAskText: { ...typography.bodyMedium, color: colors.text },
  timingBlock: { gap: spacing.xs, marginTop: spacing.sm },
  timingLabel: { ...typography.micro, color: colors.textMuted, marginBottom: 2 },
  timingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 34 },
  timingText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  timingTextSelected: { color: colors.ink, fontWeight: '700' },
  otherModesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  otherModesText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, flex: 1 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  sortLabel: { ...typography.micro, color: colors.textMuted },
  purchasePanel: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  purchaseRow: { flexDirection: 'row', gap: spacing.sm },
  purchaseHint: { ...typography.micro, color: colors.textMuted },
  providerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  providerButton: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  providerButtonText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  customFinalToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  customFinalText: { fontSize: 13, fontWeight: '700', color: colors.primary, flex: 1 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  arrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 2 },
  arrowLine: { flex: 1, height: 1, backgroundColor: colors.border },
  arrowCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pathToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pathToggleText: { fontSize: 12.5, fontWeight: '700', color: colors.primary, flex: 1 },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pathTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  pathMeta: { fontSize: 11.5, color: colors.textSecondary, marginTop: 3, lineHeight: 15 },
  pathTime: { fontSize: 13, fontWeight: '800', color: colors.ink },
  lineBadge: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineBadgeText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },
  lineBadgeTextDark: { color: '#1A1A2E' },
  aiCard: { gap: spacing.sm, borderColor: colors.primary, borderWidth: 1.5 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aiTitle: { ...typography.heading, color: colors.ink, flex: 1 },
  aiBadge: { fontSize: 11, fontWeight: '700', color: colors.primary },
  aiHint: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  aiText: { fontSize: 14, color: colors.text, lineHeight: 21 },
  buyNowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.warningSoft, borderColor: colors.warning },
  buyNowTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  buyNowText: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  hotelAskHint: { fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  subLabel: { ...typography.micro, color: colors.textMuted },
  countRow: { flexDirection: 'row', gap: spacing.md },
  counter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  counterLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  counterButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: { fontSize: 16, fontWeight: '800', color: colors.ink, minWidth: 20, textAlign: 'center' },
  modeCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  modeCardSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.85 },
  modeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  modeIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTitle: { flex: 1, ...typography.heading, color: colors.ink },
  statBlock: { gap: spacing.sm },
  statTriple: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statCol: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  statAvg: { color: colors.primary },
  statLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase' },
  modeCount: { fontSize: 12, color: colors.textMuted },
  ticketCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  ticketRecommended: { borderColor: colors.primary },
  recommendBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recommendBannerText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  ticketRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ticketTimes: { fontSize: 15, fontWeight: '700', color: colors.ink },
  ticketMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  ticketNote: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 2 },
  ticketPriceWrap: { alignItems: 'flex-end' },
  ticketPrice: { fontSize: 16, fontWeight: '800', color: colors.ink },
  ticketPriceUnit: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  tag: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  whyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  whyText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.primary },
  summaryHeader: { gap: spacing.sm },
  summaryTitle: { ...typography.title, color: colors.ink },
  summaryMeta: { fontSize: 14, color: colors.textSecondary },
  summaryHotel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summaryHotelText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  hotelBookButton: { marginTop: spacing.sm },
  savedCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  savedText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18, fontWeight: '500' },
});
