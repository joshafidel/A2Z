/**
 * Core domain types for A2Z — the door-to-door travel planner.
 *
 * Every service in `src/services` speaks these types, so swapping a mock
 * implementation for a real API only requires the adapter to return the
 * same shapes.
 */

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export type TransportMode =
  | 'flight'
  | 'train'
  | 'bus'
  | 'drive'
  | 'walk'
  | 'transit' // subway / metro / light rail
  | 'rideshare' // Uber / Lyft / taxi
  | 'airport-transfer' // AirTrain, airport shuttle
  | 'ferry'
  | 'wait'; // dwell time at a station / airport

export type TravelPreference =
  | 'cheapest'
  | 'fastest'
  | 'easiest'
  | 'least-walking'
  | 'fewest-transfers'
  | 'most-reliable';

export const PREFERENCE_LABELS: Record<TravelPreference, string> = {
  cheapest: 'Cheapest',
  fastest: 'Fastest',
  easiest: 'Easiest',
  'least-walking': 'Least walking',
  'fewest-transfers': 'Fewest transfers',
  'most-reliable': 'Most reliable',
};

// ---------------------------------------------------------------------------
// Search input
// ---------------------------------------------------------------------------

export interface Place {
  /** Free-text address or place name the user typed. */
  address: string;
  /** Short display name, e.g. "Home" or "Boston Back Bay". */
  label?: string;
  lat?: number;
  lng?: number;
  /** City key used by the mock data layer, e.g. "nyc", "boston". */
  cityKey?: string;
}

/** Optional coarse departure window; departureTime is derived from it. */
export type TimeOfDay = 'morning' | 'midday' | 'night';

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: 'Morning',
  midday: 'Midday',
  night: 'Night',
};

export interface TripSearch {
  origin: Place;
  destination: Place;
  /** ISO datetime the user wants to depart (or arrive by, see anchor). */
  departureTime: string;
  /** Coarse window the user picked (optional — not mandatory). */
  timeOfDay?: TimeOfDay;
  travelers: number;
  /** Checked-size bags. Carry-ons are assumed free on most modes. */
  bags: number;
  preference: TravelPreference;
  /** Set when the user already holds a ticket (skip pricing that leg). */
  existingTicket?: {
    mode: Extract<TransportMode, 'flight' | 'train' | 'bus'>;
    reference?: string;
    departureTime?: string;
  };
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

export type WeatherKind =
  | 'clear'
  | 'clouds'
  | 'rain'
  | 'heavy-rain'
  | 'snow'
  | 'storm'
  | 'heat'
  | 'cold'
  | 'wind'
  | 'fog';

export interface WeatherCondition {
  locationLabel: string;
  kind: WeatherKind;
  tempF: number;
  /** 0–100 chance of precipitation. */
  precipChance: number;
  windMph: number;
  summary: string; // "Light rain, 54°F"
  /** Plain-English advice derived from conditions, e.g. "Umbrella recommended." */
  advisories: string[];
  /** 0–1 multiplier of how much this weather hurts outdoor segments. */
  discomfortScore: number;
  /** 0–1 how much this weather raises delay risk for flights/trains. */
  delayImpact: number;
}

// ---------------------------------------------------------------------------
// Route composition
// ---------------------------------------------------------------------------

export interface RouteSegment {
  id: string;
  mode: TransportMode;
  /** "Amtrak Acela 2153", "Uber to JFK", "Walk to 34 St–Penn Station". */
  title: string;
  from: string;
  to: string;
  departureTime: string; // ISO
  arrivalTime: string; // ISO
  durationMinutes: number;
  distanceMiles?: number;
  /** Cost for the whole party for this segment; undefined = provider unavailable. */
  costUsd?: number;
  provider?: string; // "Amtrak", "Delta", "Uber", "MTA"
  vehicleId?: string; // flight number, train number
  notes?: string[];
}

export interface TimelineStep {
  id: string;
  time: string; // ISO
  title: string; // "Leave home"
  subtitle?: string; // "Walk 6 min to 34 St–Penn Station"
  mode: TransportMode;
  durationMinutes?: number;
  /** Highlight steps that are decision points or hard cutoffs. */
  emphasis?: 'normal' | 'critical';
  warning?: string;
}

export interface PriceLineItem {
  label: string; // "Amtrak ticket ×2", "Checked bag fee", "Airport Uber"
  amountUsd?: number; // undefined = unavailable from provider
  kind: 'ticket' | 'baggage' | 'rideshare' | 'transit' | 'seat' | 'fuel' | 'parking' | 'toll' | 'other';
  hidden?: boolean; // true for "hidden cost" items people forget to count
  note?: string;
}

export interface PriceBreakdown {
  items: PriceLineItem[];
  totalUsd?: number; // undefined if any required price is missing
  /** Approximate value of time spent, for the "time cost" callout. */
  timeCostUsd?: number;
  currency: 'USD';
  incomplete: boolean; // true when a provider price was unavailable
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskWarning {
  id: string;
  level: RiskLevel;
  /** "weather" | "delay" | "transfer" | "cutoff" | "comfort" */
  category: 'weather' | 'delay' | 'transfer' | 'cutoff' | 'comfort';
  message: string;
}

export interface BookingLink {
  id: string;
  label: string; // "Open in Uber"
  provider: string; // "Uber"
  /** Native deep link, tried first. */
  deepLink?: string;
  /** Web fallback used when the app is not installed. */
  webUrl: string;
  icon?: string; // Ionicons name
  kind: 'rideshare' | 'flight' | 'train' | 'bus' | 'maps' | 'transit';
}

// ---------------------------------------------------------------------------
// Intelligence layers
// ---------------------------------------------------------------------------

export interface AirportIntel {
  airportCode: string;
  airportName: string;
  recommendedArrivalTime: string; // ISO — be at the airport by this time
  tsaWaitMinutes: { min: number; max: number };
  securityBufferMinutes: number;
  boardingTime: string; // ISO
  gateArrivalRecommendation: string; // "Be at the gate by 8:15 AM"
  baggageCheckCutoff?: string; // ISO — only when bags are checked
  leaveHomeBy: string; // ISO — accounting for travel time to airport
  reasons: string[]; // why extra buffer was added (international, checked bags, peak hours)
}

/** Rideshare-vs-walking tradeoff for a single walking segment. */
export interface WalkVsRideAdvice {
  segmentId: string;
  walkMinutes: number;
  walkDistanceMiles: number;
  rideEstimate?: { lowUsd: number; highUsd: number; minutes: number; provider: string };
  timeSavedMinutes?: number;
  weatherSummary?: string;
  luggageBurden: 'none' | 'light' | 'heavy';
  recommendation: 'walk' | 'ride';
  explanation: string; // "Walk: 18 min, free, but rain expected. Uber: $14–$19, saves 11 min."
}

export interface RecommendationScore {
  routeId: string;
  /** 0–100 overall score after preference weighting. */
  overall: number;
  components: {
    price: number;
    time: number;
    walking: number;
    weather: number;
    transfers: number;
    reliability: number;
    delayRisk: number;
    comfort: number;
  };
  /** Plain-English reason this route ranked where it did. */
  explanation: string;
}

export type RouteBadge = 'best-overall' | 'cheapest' | 'fastest' | 'least-stressful';

export const BADGE_LABELS: Record<RouteBadge, string> = {
  'best-overall': 'Best overall',
  cheapest: 'Cheapest',
  fastest: 'Fastest',
  'least-stressful': 'Least stressful',
};

// ---------------------------------------------------------------------------
// Route option — the unit the UI compares
// ---------------------------------------------------------------------------

export interface RouteOption {
  id: string;
  title: string; // "Amtrak Acela"
  summary: string; // "Subway → Acela → short Uber"
  modeMix: TransportMode[]; // ordered, deduped major modes
  primaryMode: TransportMode;
  totalPriceUsd?: number; // undefined when a price is unavailable
  totalDurationMinutes: number;
  departureTime: string; // ISO — when you leave the door
  arrivalTime: string; // ISO — when you reach the destination door
  walkingMinutes: number;
  transferCount: number;
  /** 0–100. Historical on-time-ness of the mode/provider. */
  reliabilityScore: number;
  /** 0–100. Seat comfort, crowding, luggage ease. */
  comfortScore: number;
  /** 0–1. Probability-ish measure of a meaningful delay. */
  delayRisk: number;
  weatherWarnings: RiskWarning[];
  warnings: RiskWarning[]; // all warnings incl. weather
  priceBreakdown: PriceBreakdown;
  segments: RouteSegment[];
  timeline: TimelineStep[];
  bookingLinks: BookingLink[];
  airportIntel?: AirportIntel;
  walkAdvice: WalkVsRideAdvice[];
  /** Recommended time to walk out the door, with buffer already applied. */
  recommendedLeaveTime: string; // ISO
  /** Minutes of slack built in before the first hard departure. */
  arrivalBufferMinutes: number;
  badges: RouteBadge[];
  score?: RecommendationScore;
  /** Alternative fallbacks if this route goes wrong. */
  backupPlans: BackupPlan[];
  /**
   * Rebuild metadata for line-haul routes: lets the trip builder swap the
   * first/last-mile legs and regenerate the full plan.
   */
  builder?: {
    corridor: string;
    haulId: string;
    accessFacet: string;
    egressFacet: string;
    stationBufferMinutes: number;
    /** Currently selected access option ids (default = recommended). */
    firstMileId?: string;
    lastMileId?: string;
  };
}

export interface BackupPlan {
  id: string;
  title: string; // "Next train: 9:05 AM Northeast Regional"
  description: string;
  mode: TransportMode;
  extraCostUsd?: number;
  extraMinutes?: number;
}

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

export interface HotelOption {
  id: string;
  name: string;
  area: string; // "Downtown / South Station", "Near Logan Airport"
  pricePerNightUsd: number;
  rating: number; // 0–5
  reviewCount: number;
  distanceLabel: string; // "5 min walk from South Station"
  nearAirport: boolean;
  perks: string[];
  bookingUrl: string;
}

// ---------------------------------------------------------------------------
// Saved trips
// ---------------------------------------------------------------------------

export interface SavedTrip {
  id: string;
  savedAt: string; // ISO
  search: TripSearch;
  route: RouteOption;
}

// ---------------------------------------------------------------------------
// Service plumbing
// ---------------------------------------------------------------------------

/** Uniform result wrapper so the UI can render partial data + errors. */
export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: 'UNAVAILABLE' | 'NOT_FOUND' | 'NETWORK' | 'CONFIG' };
