import { Ionicons } from '@expo/vector-icons';
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
import { explainAccessChoice, getAccessOptions, type AccessOption } from '../services/accessService';
import { buildFlightProviderLinks, buildTicketPurchaseLink } from '../services/deepLinkService';
import { aiConfigured, generateConciergePlan } from '../services/aiService';
import { openBookingLink } from '../components/BookingLinks';
import { CORRIDOR_CITIES } from '../data/cities';
import { findCityCoords } from '../data/airports';
import { getCurrentLocation } from '../services/locationService';
import { getHotelRecommendations } from '../services/hotelService';
import { detectCityKey } from '../data/cities';
import * as storage from '../services/storageService';
import {
  buildRouteForTicket,
  getTicketsForMode,
  searchRoutes,
  statsFromRoutes,
  statsFromTickets,
  type ModeStats,
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
  | 'origin'
  | 'destination'
  | 'date'
  | 'mode'
  | 'tickets'
  | 'hotel'
  | 'firstMile'
  | 'lastMile'
  | 'summary';

type GroupKey = 'flights' | 'trains' | 'buses' | 'cars' | 'transit';

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
  { key: 'cars', title: 'Car / rental', icon: 'car', match: (r) => r.primaryMode === 'drive' || r.primaryMode === 'rideshare' },
  {
    key: 'transit',
    title: 'Public transit',
    icon: 'subway',
    match: (r) => !['flight', 'train', 'bus', 'drive', 'rideshare'].includes(r.primaryMode),
  },
];

const STEP_TITLES: Record<StepId, string> = {
  origin: 'Where are you coming from?',
  destination: 'Where are you going?',
  date: 'When are you leaving?',
  mode: 'How do you want to get there?',
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

// ---------------------------------------------------------------------------

export function PlannerScreen({ navigation }: PlannerScreenProps) {
  const insets = useSafeAreaInsets();
  const { defaultPreference, setSearchResults, saveTrip } = useTrip();

  // Interview answers ------------------------------------------------------
  const [origin, setOrigin] = useState<Place>();
  const [destination, setDestination] = useState<Place>();
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
  const [group, setGroup] = useState<GroupKey>();
  const [ticketBoards, setTicketBoards] = useState<Partial<Record<GroupKey, TicketOption[]>>>({});
  const [modeStats, setModeStats] = useState<Partial<Record<GroupKey, ModeStats>>>({});
  const [ticket, setTicket] = useState<TicketOption>();
  const [ticketSort, setTicketSort] = useState<'recommended' | 'price' | 'time'>('recommended');
  const [pendingTicket, setPendingTicket] = useState<TicketOption>(); // showing purchase choices
  const [purchaseIntent, setPurchaseIntent] = useState<'now' | 'end' | 'later'>();
  const [showOtherModes, setShowOtherModes] = useState(false);
  const [hotelTiming, setHotelTiming] = useState<'first' | 'later'>('first');
  const [directRoute, setDirectRoute] = useState<RouteOption>();
  const [purpose, setPurpose] = useState<TripPurpose>();
  const [hotelArea, setHotelArea] = useState<HotelArea>();
  const [customArea, setCustomArea] = useState('');
  const [hotelPriceSort, setHotelPriceSort] = useState(false);
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
  const [finalRoute, setFinalRoute] = useState<RouteOption>();
  const [building, setBuilding] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    storage.getHomePlace().then(setHomePlace);
  }, []);

  // Step ordering (dynamic: hotel + access steps are conditional) -----------
  const chosenGroupDef = GROUPS.find((g) => g.key === group);
  const isLineHaul = Boolean(chosenGroupDef?.lineHaulMode);
  const steps: StepId[] = useMemo(() => {
    const list: StepId[] = ['origin', 'destination', 'date', 'mode', 'tickets'];
    if (needHotel) list.push('hotel');
    if (isLineHaul) list.push('firstMile', 'lastMile');
    list.push('summary');
    return list;
  }, [needHotel, isLineHaul]);

  const [stepIndex, setStepIndex] = useState(0);
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
    setGroup(undefined);
    setTicketBoards({});
    setModeStats({});
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

  useEffect(() => {
    if (step !== 'mode' || !results || !search) return;
    let cancelled = false;
    (async () => {
      // All groups load in parallel so the stats appear together, fast.
      const entries = await Promise.all(
        grouped.map(async (g) => {
          if (g.lineHaulMode) {
            const board = await getTicketsForMode(results.corridor, g.lineHaulMode, search);
            if (board.ok) {
              // Door-to-door overhead = representative route minus its haul leg.
              const rep = g.routes[0];
              const haulSeg = rep.segments.find((s2) => s2.mode === g.lineHaulMode);
              const overhead = rep.totalDurationMinutes - (haulSeg?.durationMinutes ?? 0);
              return { key: g.key, board: board.data, stats: statsFromTickets(board.data, overhead) };
            }
          }
          return { key: g.key, board: undefined, stats: statsFromRoutes(g.routes) };
        }),
      );
      if (cancelled) return;
      const stats: Partial<Record<GroupKey, ModeStats>> = {};
      const boards: Partial<Record<GroupKey, TicketOption[]>> = {};
      for (const e of entries) {
        stats[e.key] = e.stats;
        if (e.board) boards[e.key] = e.board;
      }
      setTicketBoards(boards);
      setModeStats(stats);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, results, search, grouped]);

  // Fast path: if the user picks a mode before the stats pass finished,
  // fetch that mode's board directly so the ticket screen never stalls.
  useEffect(() => {
    if (step !== 'tickets' || !results || !search || !chosenGroupDef?.lineHaulMode) return;
    if (ticketBoards[chosenGroupDef.key]) return;
    let cancelled = false;
    (async () => {
      const board = await getTicketsForMode(results.corridor, chosenGroupDef.lineHaulMode!, search);
      if (!cancelled && board.ok) {
        setTicketBoards((prev) => ({ ...prev, [chosenGroupDef.key]: board.data }));
      }
      if (!cancelled && !board.ok) setStepError(board.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, results, search, chosenGroupDef, ticketBoards]);

  // --- Hotels (prefetched while the user is still picking a ticket) --------
  useEffect(() => {
    if (!needHotel || !search) return;
    if (step !== 'hotel' && step !== 'tickets') return;
    let cancelled = false;
    (async () => {
      const cityKey = detectCityKey(search.destination.address);
      const result = await getHotelRecommendations(cityKey, {
        arrivingByAir: group === 'flights',
        destinationQuery: search.destination.address,
        purpose,
        area: hotelArea,
        customArea,
        sortByPrice: hotelPriceSort,
        checkinIso: search.departureTime,
        nights: 1,
      });
      if (!cancelled && result.ok) setHotels(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, search, purpose, group, hotelArea, customArea, hotelPriceSort, needHotel]);

  // --- Access options (prefetched in parallel from the ticket step on) ------
  useEffect(() => {
    if (!results || !search || !chosenGroupDef?.lineHaulMode) return;
    if (!['tickets', 'hotel', 'firstMile', 'lastMile'].includes(step)) return;
    const facets: Record<string, [string, string]> = {
      flight: ['to-airport', 'from-airport'],
      train: ['to-train', 'from-train'],
      bus: ['to-bus', 'from-bus'],
    };
    const [accessFacet, egressFacet] = facets[chosenGroupDef.lineHaulMode];
    let cancelled = false;
    (async () => {
      const [first, last] = await Promise.all([
        firstOptions
          ? undefined
          : getAccessOptions(results.corridor, accessFacet, search, results.originWeather),
        lastOptions
          ? undefined
          : getAccessOptions(results.corridor, egressFacet, search, results.destinationWeather),
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
  }, [step, results, search, chosenGroupDef, firstOptions, lastOptions]);

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

  const chooseTicket = (t: TicketOption, intent: 'now' | 'end' | 'later', openDefault = true) => {
    setTicket(t);
    setPurchaseIntent(intent);
    setPendingTicket(undefined);
    setFinalRoute(undefined);
    setAiPlan(undefined);
    if (intent === 'now' && openDefault) {
      // Automatically open the provider's site/app for purchase.
      const link = purchaseLinkFor(t);
      if (link) openBookingLink(link);
    }
    setTimeout(goNext, 100);
  };

  /** All flight sites for this ticket, pre-filled with the real route + date. */
  const flightProviderLinksFor = (t: TicketOption) => {
    const originCode = t.haul.fromStation.match(/\(([A-Z]{3})\)/)?.[1];
    const destCode = t.haul.toStation.match(/\(([A-Z]{3})\)/)?.[1];
    if (!originCode || !destCode) return [];
    return buildFlightProviderLinks(originCode, destCode, t.departureTime, search?.travelers ?? 1);
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

        {step === 'origin' && renderPlaceStep('origin')}
        {step === 'destination' && renderPlaceStep('destination')}
        {step === 'date' && renderDateStep()}
        {step === 'mode' && renderModeStep()}
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
    return STEP_TITLES[s];
  }

  function stepHasAnswer(s: StepId): boolean {
    switch (s) {
      case 'origin':
        return Boolean(origin);
      case 'destination':
        return Boolean(destination);
      case 'date':
        return Boolean(results);
      case 'mode':
        return Boolean(group);
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

  function renderPlaceStep(which: 'origin' | 'destination') {
    const current = which === 'origin' ? origin : destination;
    const setPlace = (p: Place) => {
      if (which === 'origin') setOrigin(p);
      else setDestination(p);
      setSearch(undefined);
      resetFromSearch();
    };
    return (
      <View style={styles.stepBody}>
        <PlaceInput
          placeholder={
            which === 'origin' ? 'Address, station, or airport' : 'Address, hotel, or city'
          }
          value={current?.label}
          autoFocus={!current}
          onSelect={(p) => {
            setPlace({ address: p.address, label: p.label });
            // Auto-advance once a real place is chosen.
            setTimeout(goNext, 150);
          }}
        />

        <View style={styles.quickRow}>
          {homePlace && (
            <Chip
              label={`Home · ${homePlace.label ?? homePlace.address.split(',')[0]}`}
              icon="home"
              selected={current?.address === homePlace.address}
              onPress={() => {
                setPlace({ ...homePlace, label: 'Home' });
                setTimeout(goNext, 150);
              }}
            />
          )}
          {which === 'origin' && (
            <Chip
              label={locating ? 'Locating…' : 'Current location'}
              icon="locate"
              onPress={async () => {
                setLocating(true);
                const r = await getCurrentLocation();
                setLocating(false);
                if (r.ok) {
                  setPlace({ address: r.data.address, label: 'Current location' });
                  setTimeout(goNext, 150);
                } else {
                  setStepError(r.error);
                }
              }}
            />
          )}
        </View>

        {current && current.label !== 'Home' && (
          <Pressable
            style={styles.saveHomeRow}
            onPress={async () => {
              await storage.setHomePlace(current);
              setHomePlace(current);
            }}
          >
            <Ionicons
              name={homePlace?.address === current.address ? 'star' : 'star-outline'}
              size={16}
              color={colors.warning}
            />
            <Text style={styles.saveHomeText}>
              {homePlace?.address === current.address
                ? 'Saved as your home'
                : `Save "${current.label}" as home`}
            </Text>
          </Pressable>
        )}

        {which === 'destination' && (
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
            <Text style={styles.hotelAskHint}>
              We'll show stays matched to your trip right after you pick your ticket.
            </Text>
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
    // Viability: on long trips, modes that take 3x+ the flight (or 12h+
    // when flying is possible) are tucked away — visible to explore, but
    // never pushed front and center.
    const flightAvg = modeStats.flights?.durationMinutes.avg;
    const isViable = (key: GroupKey) => {
      if (key === 'flights' || !flightAvg) return true;
      const s = modeStats[key];
      if (!s) return true;
      return s.durationMinutes.min <= Math.max(12 * 60, flightAvg * 3);
    };
    const viableGroups = grouped.filter((g) => isViable(g.key));
    const otherGroups = grouped.filter((g) => !isViable(g.key));

    const renderGroupCard = (g: (typeof grouped)[number]) => {
      const stats = modeStats[g.key];
      return (
            <Pressable
              key={g.key}
              onPress={() => {
                if (group !== g.key) resetFromMode();
                setGroup(g.key);
                setTimeout(goNext, 100);
              }}
              style={({ pressed }) => [
                styles.modeCard,
                group === g.key && styles.modeCardSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.modeHeader}>
                <View style={styles.modeIconCircle}>
                  <Ionicons name={g.icon} size={20} color={colors.primary} />
                </View>
                <Text style={styles.modeTitle}>{g.title}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              {stats ? (
                <View style={styles.statBlock}>
                  {stats.price && (
                    <StatTriple
                      icon="pricetag-outline"
                      cheap={formatMoney(stats.price.min)}
                      avg={formatMoney(stats.price.avg)}
                      expensive={formatMoney(stats.price.max)}
                    />
                  )}
                  <StatTriple
                    icon="time-outline"
                    cheap={formatDuration(stats.durationMinutes.min)}
                    avg={formatDuration(stats.durationMinutes.avg)}
                    expensive={formatDuration(stats.durationMinutes.max)}
                    labels={['fastest', 'typical', 'slowest']}
                  />
                  <Text style={styles.modeCount}>
                    {stats.optionCount} option{stats.optionCount === 1 ? '' : 's'} available
                  </Text>
                </View>
              ) : (
                <Text style={styles.modeCount}>Loading price & time ranges…</Text>
              )}
            </Pressable>
      );
    };

    return (
      <View style={styles.stepBody}>
        <Text style={styles.stepHint}>
          Price and time ranges cover every option we found — cheapest, priciest, and typical.
        </Text>
        {viableGroups.map(renderGroupCard)}

        {otherGroups.length > 0 && (
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
                {otherGroups.length} slower option{otherGroups.length === 1 ? '' : 's'} to explore (
                {otherGroups.map((g) => g.title).join(', ')})
              </Text>
            </Pressable>
            {showOtherModes && otherGroups.map(renderGroupCard)}
          </>
        )}
      </View>
    );
  }

  function renderTicketStep() {
    const g = chosenGroupDef;
    if (!g) return null;

    // Line-haul: real ticket board. Direct modes: pick the exact option.
    if (g.lineHaulMode) {
      const board = ticketBoards[g.key];
      if (!board) return <LoadingState message="Loading departures…" />;

      const sorted = [...board].sort((a, b) => {
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

      return (
        <View style={styles.stepBody}>
          <View style={styles.sortRow}>
            <Text style={styles.sortLabel}>SORT BY</Text>
            <Chip label="Recommended" selected={ticketSort === 'recommended'} onPress={() => setTicketSort('recommended')} />
            <Chip label="Price" selected={ticketSort === 'price'} onPress={() => setTicketSort('price')} />
            <Chip label="Time of day" selected={ticketSort === 'time'} onPress={() => setTicketSort('time')} />
          </View>
          {sorted.map((t) => {
            const isPending = pendingTicket?.haul.id === t.haul.id;
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
                  <View style={styles.flex1}>
                    <Text style={styles.ticketTimes}>
                      {formatTime(t.departureTime)} → {formatTime(t.arrivalTime)}
                    </Text>
                    <Text style={styles.ticketMeta}>
                      {t.haul.provider} {t.haul.serviceName} · {formatDuration(t.haul.durationMinutes)}
                      {t.haul.notes?.[0] ? ` · ${t.haul.notes[0]}` : ''}
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
                    {t.haul.mode === 'flight' ? (
                      <>
                        <Text style={styles.purchaseHint}>Purchase now on:</Text>
                        <View style={styles.providerGrid}>
                          {flightProviderLinksFor(t).map((link) => (
                            <Pressable
                              key={link.id}
                              onPress={() => {
                                openBookingLink(link);
                                chooseTicket(t, 'now', false);
                              }}
                              style={({ pressed }) => [styles.providerButton, pressed && styles.pressed]}
                            >
                              <Text style={styles.providerButtonText}>{link.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    ) : (
                      <AppButton
                        label={purchaseLinkFor(t)?.label ?? 'Purchase now'}
                        icon="cart"
                        small
                        onPress={() => chooseTicket(t, 'now')}
                      />
                    )}
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
        </View>
      );
    }

    const options = grouped.find((x) => x.key === g.key)?.routes ?? [];
    const bestId = options.reduce(
      (best, r) => ((r.score?.overall ?? 0) > (options.find((o) => o.id === best)?.score?.overall ?? -1) ? r.id : best),
      options[0]?.id,
    );
    return (
      <View style={styles.stepBody}>
        <Text style={styles.stepHint}>Pick your exact option — recommended first.</Text>
        {[...options]
          .sort((a, b) => (a.id === bestId ? -1 : b.id === bestId ? 1 : 0))
          .map((r) => (
            <Pressable
              key={r.id}
              onPress={() => {
                setDirectRoute(r);
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
    const areaSelector = (
      <>
        <Text style={styles.subLabel}>WHERE DO YOU WANT TO BE?</Text>
        <View style={styles.quickRow}>
          {(Object.keys(HOTEL_AREA_LABELS) as HotelArea[]).map((a) => (
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

    if (!options) return <LoadingState message="Pricing every way to connect…" />;
    return (
      <View style={styles.stepBody}>
        <Text style={styles.stepHint}>
          {which === 'first' ? `To ${target}` : `From ${ticket?.haul.toStation ?? 'arrival'} to ${target}`} —{' '}
          {explainAccessChoice(options, wx, search?.bags ?? 0)}
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
        {options.map((o) => (
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
          </Pressable>
        ))}
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
                const link = purchaseLinkFor(ticket);
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

function StatTriple({
  icon,
  cheap,
  avg,
  expensive,
  labels = ['cheapest', 'average', 'priciest'],
}: {
  icon: keyof typeof Ionicons.glyphMap;
  cheap: string;
  avg: string;
  expensive: string;
  labels?: [string, string, string] | string[];
}) {
  return (
    <View style={styles.statTriple}>
      <Ionicons name={icon} size={14} color={colors.textSecondary} />
      <View style={styles.statCol}>
        <Text style={styles.statValue}>{cheap}</Text>
        <Text style={styles.statLabel}>{labels[0]}</Text>
      </View>
      <View style={styles.statCol}>
        <Text style={[styles.statValue, styles.statAvg]}>{avg}</Text>
        <Text style={styles.statLabel}>{labels[1]}</Text>
      </View>
      <View style={styles.statCol}>
        <Text style={styles.statValue}>{expensive}</Text>
        <Text style={styles.statLabel}>{labels[2]}</Text>
      </View>
    </View>
  );
}

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
