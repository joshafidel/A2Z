/**
 * Maps / local routing service — walking, driving, and public transit
 * estimates for the first/last mile and full local trips.
 *
 * MOCK: curated segment estimates per corridor.
 *
 * REAL API: Google Maps Directions API
 *   GET https://maps.googleapis.com/maps/api/directions/json
 *       ?origin=..&destination=..&mode=walking|driving|transit
 *       &key=${apiConfig.googleMapsApiKey}
 * Map each leg into LocalLeg. Transit legs also come from Transitland/GTFS.
 */

import type { CorridorKey } from '../data/cities';
import type { ServiceResult, TransportMode } from '../types';
import { apiConfig, fetchWithTimeout, isLive, liveDataEnabled, mockDelay } from './config';
import { geocode } from './geoService';

export interface LocalLeg {
  mode: Extract<TransportMode, 'walk' | 'drive' | 'transit' | 'airport-transfer'>;
  title: string;
  from: string;
  to: string;
  durationMinutes: number;
  distanceMiles: number;
  costUsd: number; // per person for transit; total for drive (fuel+tolls)
  provider?: string;
  notes?: string[];
  /** Line badge, Google/Apple Maps-style: "6", "F", "M15", "Q70". */
  lineName?: string;
  /** Official line color for the badge (hex). */
  lineColor?: string;
  /** Service frequency — "every 6 min". */
  headwayMinutes?: number;
}

export interface LocalAccess {
  /** Ordered legs from the door to the station/airport (or full local trip). */
  legs: LocalLeg[];
}

/** One real transit itinerary (Google Routes API or Transitous). */
export interface TransitPath {
  title: string;
  legs: LocalLeg[];
  departIso?: string;
  arriveIso?: string;
}

/** "312s" → 312 (Routes API duration strings). */
function secs(v?: string | number): number {
  if (typeof v === 'number') return v;
  return v ? parseInt(v, 10) || 0 : 0;
}

interface RoutesApiStep {
  travelMode?: string;
  staticDuration?: string;
  distanceMeters?: number;
  navigationInstruction?: { instructions?: string };
  transitDetails?: {
    headsign?: string;
    stopDetails?: {
      departureTime?: string;
      arrivalTime?: string;
      departureStop?: { name?: string };
      arrivalStop?: { name?: string };
    };
    transitLine?: {
      nameShort?: string;
      name?: string;
      color?: string;
      agencies?: Array<{ name?: string }>;
      vehicle?: { name?: { text?: string } };
    };
  };
}

/**
 * REAL Google transit routing via the current **Routes API** (the modern
 * replacement for the retired legacy Directions API — new Google Cloud
 * accounts can only enable this one). Returns the same multi-route list
 * Google Maps shows: real clock times, line names/colors, and the
 * published fare. Activates when EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is set.
 */
async function fetchGoogleTransitPaths(
  originAddress: string,
  destAddress: string,
  alternatives: boolean,
): Promise<TransitPath[] | undefined> {
  if (!isLive('googleMapsApiKey')) return undefined;
  try {
    const res = await fetchWithTimeout('https://routes.googleapis.com/directions/v2:computeRoutes', 6500, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiConfig.googleMapsApiKey,
        'X-Goog-FieldMask': [
          'routes.duration',
          'routes.travelAdvisory.transitFare',
          'routes.legs.steps.travelMode',
          'routes.legs.steps.staticDuration',
          'routes.legs.steps.distanceMeters',
          'routes.legs.steps.navigationInstruction',
          'routes.legs.steps.transitDetails',
        ].join(','),
      },
      body: JSON.stringify({
        origin: { address: originAddress },
        destination: { address: destAddress },
        travelMode: 'TRANSIT',
        computeAlternativeRoutes: alternatives,
      }),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as {
      routes?: Array<{
        travelAdvisory?: { transitFare?: { units?: string; nanos?: number } };
        legs?: Array<{ steps?: RoutesApiStep[] }>;
      }>;
    };
    if (!body.routes?.length) return undefined;

    const paths = body.routes
      .slice(0, 3)
      .map((route): TransitPath | undefined => {
        const steps = route.legs?.[0]?.steps ?? [];
        const fareUsd = route.travelAdvisory?.transitFare
          ? Number(route.travelAdvisory.transitFare.units ?? 0) +
            (route.travelAdvisory.transitFare.nanos ?? 0) / 1e9
          : undefined;
        let farePlaced = false;
        const legs: LocalLeg[] = steps
          .filter((s) => s.travelMode === 'WALK' || s.travelMode === 'TRANSIT')
          .map((s) => {
            const minutes = Math.max(1, Math.round(secs(s.staticDuration) / 60));
            const miles = Math.round(((s.distanceMeters ?? 0) / 1609.34) * 10) / 10;
            if (s.travelMode === 'TRANSIT' && s.transitDetails) {
              const line = s.transitDetails.transitLine;
              const lineName = line?.nameShort ?? line?.name ?? '';
              const cost = !farePlaced && fareUsd !== undefined ? Math.round(fareUsd * 100) / 100 : 0;
              if (cost > 0) farePlaced = true;
              return {
                mode: 'transit' as const,
                title: `${line?.vehicle?.name?.text ?? 'Transit'} ${lineName}${
                  s.transitDetails.headsign ? ` toward ${s.transitDetails.headsign}` : ''
                }`.trim(),
                from: s.transitDetails.stopDetails?.departureStop?.name ?? originAddress,
                to: s.transitDetails.stopDetails?.arrivalStop?.name ?? destAddress,
                durationMinutes: minutes,
                distanceMiles: miles,
                costUsd: cost,
                provider: line?.agencies?.[0]?.name,
                lineName: lineName || undefined,
                lineColor: line?.color,
                notes: ['Live route via Google Maps'],
              };
            }
            return {
              mode: 'walk' as const,
              title: s.navigationInstruction?.instructions ?? 'Walk',
              from: originAddress,
              to: destAddress,
              durationMinutes: minutes,
              distanceMiles: miles,
              costUsd: 0,
            };
          });
        if (!legs.some((l) => l.mode === 'transit')) return undefined;
        const transitSteps = steps.filter((s) => s.travelMode === 'TRANSIT');
        return {
          title: legs
            .filter((l) => l.mode === 'transit')
            .map((l) => l.lineName ?? l.title)
            .join(' + '),
          legs,
          departIso: transitSteps[0]?.transitDetails?.stopDetails?.departureTime,
          arriveIso: transitSteps[transitSteps.length - 1]?.transitDetails?.stopDetails?.arrivalTime,
        };
      })
      .filter((path): path is TransitPath => Boolean(path));
    return paths.length > 0 ? paths : undefined;
  } catch {
    return undefined;
  }
}

/** Single best Google transit chain (first route). */
export async function getLiveTransitLegs(
  originAddress: string,
  destAddress: string,
): Promise<LocalLeg[] | undefined> {
  const paths = await fetchGoogleTransitPaths(originAddress, destAddress, false);
  return paths?.[0]?.legs;
}

/** Google's full route list with alternatives — the Maps-style picker. */
export async function getLiveTransitPaths(
  originAddress: string,
  destAddress: string,
): Promise<TransitPath[] | undefined> {
  return fetchGoogleTransitPaths(originAddress, destAddress, true);
}

function hexColor(c?: string): string | undefined {
  if (!c) return undefined;
  return c.startsWith('#') ? c : `#${c}`;
}

function toIso(t?: string | number): string | undefined {
  if (t === undefined) return undefined;
  const d = typeof t === 'number' ? new Date(t) : new Date(t);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * REAL keyless transit routing via Transitous (transitous.org) — a free,
 * community-run MOTIS instance routing on worldwide public GTFS feeds.
 * Returns up to three alternate itineraries with real clock times, line
 * names, and official line colors. No API key, no scraping; fails soft so
 * callers keep their curated paths when unreachable.
 */
export async function getTransitousPaths(
  fromAddress: string,
  toAddress: string,
): Promise<TransitPath[] | undefined> {
  if (!liveDataEnabled()) return undefined;
  try {
    const [from, to] = await Promise.all([geocode(fromAddress), geocode(toAddress)]);
    if (!from.ok || !to.ok) return undefined;
    const res = await fetchWithTimeout(
      `https://api.transitous.org/api/v1/plan?fromPlace=${from.data.lat},${from.data.lng}` +
        `&toPlace=${to.data.lat},${to.data.lng}&numItineraries=3`,
      6000,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return undefined;
    const body = (await res.json()) as {
      itineraries?: Array<{
        startTime?: string | number;
        endTime?: string | number;
        legs?: Array<{
          mode?: string;
          from?: { name?: string };
          to?: { name?: string };
          duration?: number; // seconds
          distance?: number; // meters
          startTime?: string | number;
          endTime?: string | number;
          routeShortName?: string;
          routeColor?: string;
          headsign?: string;
          agencyName?: string;
        }>;
      }>;
    };
    const itineraries = body.itineraries?.slice(0, 3);
    if (!itineraries || itineraries.length === 0) return undefined;

    const paths = itineraries
      .map((it): TransitPath | undefined => {
        const legs: LocalLeg[] = (it.legs ?? []).map((l) => {
          const isWalk = (l.mode ?? 'WALK').toUpperCase() === 'WALK';
          const minutes = Math.max(1, Math.round((l.duration ?? 60) / 60));
          const miles = Math.round(((l.distance ?? 0) / 1609.34) * 10) / 10;
          const line = l.routeShortName;
          return {
            mode: isWalk ? ('walk' as const) : ('transit' as const),
            title: isWalk
              ? `Walk to ${l.to?.name ?? 'the stop'}`
              : `${line ?? 'Transit'}${l.headsign ? ` toward ${l.headsign}` : ''}`,
            from: l.from?.name ?? fromAddress,
            to: l.to?.name ?? toAddress,
            durationMinutes: minutes,
            distanceMiles: miles,
            costUsd: 0, // GTFS feeds rarely publish fares — shown as live route
            provider: l.agencyName,
            lineName: isWalk ? undefined : line,
            lineColor: isWalk ? undefined : hexColor(l.routeColor),
            notes: ['Live route via Transitous (GTFS)'],
          };
        });
        if (legs.length === 0 || !legs.some((l) => l.mode === 'transit')) return undefined;
        const lines = legs.filter((l) => l.mode === 'transit').map((l) => l.lineName ?? l.title);
        return {
          title: lines.join(' + '),
          legs,
          departIso: toIso(it.startTime),
          arriveIso: toIso(it.endTime),
        };
      })
      .filter((p): p is TransitPath => Boolean(p));
    return paths.length > 0 ? paths : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Access legs to reach each corridor's major stations, plus full local
 * drive options. Keys: `<corridor>:<facet>`.
 */
const ACCESS: Record<string, LocalLeg[]> = {
  // --- NYC ↔ Boston -------------------------------------------------------
  'nyc-boston:to-train': [
    {
      mode: 'walk',
      title: 'Walk to 72 St Station',
      from: 'Home (Upper West Side)',
      to: '72 St Subway Station',
      durationMinutes: 6,
      distanceMiles: 0.3,
      costUsd: 0,
    },
    {
      mode: 'transit',
      title: 'Subway 2 train to Penn Station',
      from: '72 St Station',
      to: '34 St–Penn Station',
      durationMinutes: 14,
      distanceMiles: 2.4,
      costUsd: 2.9,
      provider: 'MTA',
    },
  ],
  'nyc-boston:to-airport': [
    {
      mode: 'drive',
      title: 'Uber to LaGuardia',
      from: 'Home (Upper West Side)',
      to: 'LGA Terminal C',
      durationMinutes: 38,
      distanceMiles: 10.2,
      costUsd: 52,
      provider: 'Uber',
      notes: ['Grand Central Pkwy traffic varies ±15 min'],
    },
  ],
  'nyc-boston:from-train': [
    {
      mode: 'walk',
      title: 'Walk to hotel',
      from: 'Boston South Station',
      to: 'Downtown hotel',
      durationMinutes: 12,
      distanceMiles: 0.6,
      costUsd: 0,
    },
  ],
  'nyc-boston:from-airport': [
    {
      mode: 'drive',
      title: 'Uber to downtown Boston',
      from: 'BOS Terminal A',
      to: 'Downtown hotel',
      durationMinutes: 16,
      distanceMiles: 4.1,
      costUsd: 34,
      provider: 'Uber',
    },
  ],
  'nyc-boston:drive': [
    {
      mode: 'drive',
      title: 'Drive I-95 N to Boston',
      from: 'Home (Upper West Side)',
      to: 'Downtown Boston',
      durationMinutes: 245,
      distanceMiles: 215,
      costUsd: 63,
      notes: ['~$38 fuel + ~$25 tolls', 'Parking in Boston ~$40/day not included'],
    },
  ],
  'nyc-boston:to-bus': [
    {
      mode: 'walk',
      title: 'Walk to 72 St Station',
      from: 'Home (Upper West Side)',
      to: '72 St Subway Station',
      durationMinutes: 6,
      distanceMiles: 0.3,
      costUsd: 0,
    },
    {
      mode: 'transit',
      title: 'Subway 1 train to 28 St',
      from: '72 St Station',
      to: '28 St Station',
      durationMinutes: 16,
      distanceMiles: 2.6,
      costUsd: 2.9,
      provider: 'MTA',
    },
    {
      mode: 'walk',
      title: 'Walk to FlixBus stop',
      from: '28 St Station',
      to: '31st St & 8th Ave',
      durationMinutes: 8,
      distanceMiles: 0.4,
      costUsd: 0,
    },
  ],
  'nyc-boston:from-bus': [
    {
      mode: 'walk',
      title: 'Walk to hotel',
      from: 'South Station Bus Terminal',
      to: 'Downtown hotel',
      durationMinutes: 13,
      distanceMiles: 0.65,
      costUsd: 0,
    },
  ],

  // --- NYC ↔ DC ------------------------------------------------------------
  'nyc-dc:to-train': [
    {
      mode: 'walk',
      title: 'Walk to 72 St Station',
      from: 'Home (Upper West Side)',
      to: '72 St Subway Station',
      durationMinutes: 6,
      distanceMiles: 0.3,
      costUsd: 0,
    },
    {
      mode: 'transit',
      title: 'Subway 2 train to Penn Station',
      from: '72 St Station',
      to: '34 St–Penn Station',
      durationMinutes: 14,
      distanceMiles: 2.4,
      costUsd: 2.9,
      provider: 'MTA',
    },
  ],
  'nyc-dc:to-airport': [
    {
      mode: 'drive',
      title: 'Uber to LaGuardia',
      from: 'Home (Upper West Side)',
      to: 'LGA Terminal C',
      durationMinutes: 38,
      distanceMiles: 10.2,
      costUsd: 52,
      provider: 'Uber',
    },
  ],
  'nyc-dc:from-train': [
    {
      mode: 'walk',
      title: 'Walk to hotel',
      from: 'Washington Union Station',
      to: 'Downtown DC hotel',
      durationMinutes: 18,
      distanceMiles: 0.9,
      costUsd: 0,
    },
  ],
  'nyc-dc:from-airport': [
    {
      mode: 'transit',
      title: 'Metro Blue Line to downtown',
      from: 'DCA Station',
      to: 'Metro Center',
      durationMinutes: 18,
      distanceMiles: 4.5,
      costUsd: 2.65,
      provider: 'WMATA',
      lineName: 'BL',
      lineColor: '#0076BF',
      headwayMinutes: 10,
    },
    {
      mode: 'walk',
      title: 'Walk to hotel',
      from: 'Metro Center',
      to: 'Downtown DC hotel',
      durationMinutes: 7,
      distanceMiles: 0.35,
      costUsd: 0,
    },
  ],
  'nyc-dc:drive': [
    {
      mode: 'drive',
      title: 'Drive I-95 S to Washington',
      from: 'Home (Upper West Side)',
      to: 'Downtown DC',
      durationMinutes: 265,
      distanceMiles: 228,
      costUsd: 71,
      notes: ['~$40 fuel + ~$31 tolls', 'DC parking ~$35/day not included'],
    },
  ],
  'nyc-dc:to-bus': [
    {
      mode: 'transit',
      title: 'Subway 1 train to 28 St',
      from: '72 St Station',
      to: '28 St Station',
      durationMinutes: 16,
      distanceMiles: 2.6,
      costUsd: 2.9,
      provider: 'MTA',
    },
    {
      mode: 'walk',
      title: 'Walk to FlixBus stop',
      from: '28 St Station',
      to: '31st St & 8th Ave',
      durationMinutes: 8,
      distanceMiles: 0.4,
      costUsd: 0,
    },
  ],
  'nyc-dc:from-bus': [
    {
      mode: 'walk',
      title: 'Walk to hotel',
      from: 'Union Station Bus Terminal',
      to: 'Downtown DC hotel',
      durationMinutes: 18,
      distanceMiles: 0.9,
      costUsd: 0,
    },
  ],

  // --- Manhattan → JFK -----------------------------------------------------
  'nyc-jfk:transit': [
    {
      mode: 'walk',
      title: 'Walk to 34 St–Penn Station',
      from: 'Midtown Manhattan',
      to: '34 St–Penn Station',
      durationMinutes: 8,
      distanceMiles: 0.4,
      costUsd: 0,
    },
    {
      mode: 'transit',
      title: 'LIRR to Jamaica',
      from: 'Penn Station',
      to: 'Jamaica Station',
      durationMinutes: 20,
      distanceMiles: 11,
      costUsd: 5,
      provider: 'LIRR',
    },
    {
      mode: 'airport-transfer',
      title: 'AirTrain to JFK terminals',
      from: 'Jamaica Station',
      to: 'JFK Terminal 4',
      durationMinutes: 18,
      distanceMiles: 3.3,
      costUsd: 8.5,
      provider: 'Port Authority',
    },
  ],
  'nyc-jfk:subway': [
    {
      mode: 'transit',
      title: 'Subway E train to Sutphin Blvd',
      from: 'Midtown Manhattan',
      to: 'Sutphin Blvd–Archer Av',
      durationMinutes: 42,
      distanceMiles: 12,
      costUsd: 2.9,
      provider: 'MTA',
    },
    {
      mode: 'airport-transfer',
      title: 'AirTrain to JFK terminals',
      from: 'Jamaica Station',
      to: 'JFK Terminal 4',
      durationMinutes: 18,
      distanceMiles: 3.3,
      costUsd: 8.5,
      provider: 'Port Authority',
    },
  ],
  'nyc-jfk:drive': [
    {
      mode: 'drive',
      title: 'Drive to JFK (long-term parking)',
      from: 'Midtown Manhattan',
      to: 'JFK Terminal 4',
      durationMinutes: 55,
      distanceMiles: 16.8,
      costUsd: 22,
      notes: ['Midtown Tunnel toll $6.94', 'Long-term parking $20/day extra'],
    },
  ],

  // --- Manhattan → Newark --------------------------------------------------
  'nyc-ewr:transit': [
    {
      mode: 'walk',
      title: 'Walk to 34 St–Penn Station',
      from: 'Midtown Manhattan',
      to: '34 St–Penn Station',
      durationMinutes: 8,
      distanceMiles: 0.4,
      costUsd: 0,
    },
    {
      mode: 'transit',
      title: 'NJ Transit to Newark Airport Station',
      from: 'Penn Station NY',
      to: 'Newark Airport Station',
      durationMinutes: 26,
      distanceMiles: 14,
      costUsd: 15.75,
      provider: 'NJ Transit',
      notes: ['Fare includes AirTrain'],
    },
    {
      mode: 'airport-transfer',
      title: 'AirTrain to terminals',
      from: 'Newark Airport Station',
      to: 'EWR Terminal B',
      durationMinutes: 10,
      distanceMiles: 1.5,
      costUsd: 0,
      provider: 'Port Authority',
    },
  ],
  'nyc-ewr:drive': [
    {
      mode: 'drive',
      title: 'Drive to Newark Airport',
      from: 'Midtown Manhattan',
      to: 'EWR Terminal B',
      durationMinutes: 45,
      distanceMiles: 16.5,
      costUsd: 21,
      notes: ['Holland Tunnel + NJ Turnpike tolls'],
    },
  ],

  // --- Boston Logan → downtown hotel ---------------------------------------
  'bosairport-boston:transit': [
    {
      mode: 'airport-transfer',
      title: 'Silver Line SL1 to South Station',
      from: 'BOS Terminal A',
      to: 'South Station',
      durationMinutes: 22,
      distanceMiles: 3.8,
      costUsd: 0,
      provider: 'MBTA',
      lineName: 'SL1',
      lineColor: '#7C878E',
      headwayMinutes: 12,
      notes: ['Free from the airport'],
    },
    {
      mode: 'walk',
      title: 'Walk to hotel',
      from: 'South Station',
      to: 'Downtown hotel',
      durationMinutes: 12,
      distanceMiles: 0.6,
      costUsd: 0,
    },
  ],
  'bosairport-boston:blue-line': [
    {
      mode: 'airport-transfer',
      title: 'Massport Shuttle 66 to Airport Station',
      from: 'BOS Terminal A',
      to: 'Airport Station (Blue Line)',
      durationMinutes: 8,
      distanceMiles: 0.9,
      costUsd: 0,
      provider: 'Massport',
    },
    {
      mode: 'transit',
      title: 'Blue Line to State St',
      from: 'Airport Station',
      to: 'State Street Station',
      durationMinutes: 10,
      distanceMiles: 2.6,
      costUsd: 2.4,
      provider: 'MBTA',
    },
    {
      mode: 'walk',
      title: 'Walk to hotel',
      from: 'State Street Station',
      to: 'Downtown hotel',
      durationMinutes: 9,
      distanceMiles: 0.45,
      costUsd: 0,
    },
  ],

  'bosairport-boston:drive': [
    {
      mode: 'drive',
      title: 'Drive to downtown Boston',
      from: 'BOS Terminal A',
      to: 'Downtown hotel',
      durationMinutes: 16,
      distanceMiles: 4.1,
      costUsd: 9,
      notes: ['Sumner Tunnel toll included', 'Rental pickup adds ~25 min if needed'],
    },
  ],

  // --- Public-transit airport access (offered alongside rideshares) --------
  'nyc-boston:to-airport-transit': [
    {
      mode: 'transit',
      title: 'Subway to 74 St–Roosevelt Av',
      from: 'Home (Upper West Side)',
      to: '74 St–Roosevelt Av',
      durationMinutes: 34,
      distanceMiles: 8,
      costUsd: 2.9,
      provider: 'MTA',
      lineName: 'E',
      lineColor: '#0039A6',
      headwayMinutes: 6,
    },
    {
      mode: 'airport-transfer',
      title: 'Q70 LaGuardia Link bus',
      from: '74 St–Roosevelt Av',
      to: 'LGA Terminal C',
      durationMinutes: 15,
      distanceMiles: 2.4,
      costUsd: 0,
      provider: 'MTA',
      lineName: 'Q70',
      lineColor: '#2850AD',
      headwayMinutes: 10,
      notes: ['Free airport bus'],
    },
  ],
  'nyc-boston:from-airport-transit': [
    {
      mode: 'airport-transfer',
      title: 'Silver Line SL1 to South Station',
      from: 'BOS Terminal A',
      to: 'South Station',
      durationMinutes: 22,
      distanceMiles: 3.8,
      costUsd: 0,
      provider: 'MBTA',
      lineName: 'SL1',
      lineColor: '#7C878E',
      headwayMinutes: 12,
      notes: ['Free from the airport'],
    },
    {
      mode: 'walk',
      title: 'Walk to hotel',
      from: 'South Station',
      to: 'Downtown hotel',
      durationMinutes: 12,
      distanceMiles: 0.6,
      costUsd: 0,
    },
  ],
  'nyc-dc:to-airport-transit': [
    {
      mode: 'transit',
      title: 'Subway to 74 St–Roosevelt Av',
      from: 'Home (Upper West Side)',
      to: '74 St–Roosevelt Av',
      durationMinutes: 34,
      distanceMiles: 8,
      costUsd: 2.9,
      provider: 'MTA',
      lineName: 'E',
      lineColor: '#0039A6',
      headwayMinutes: 6,
    },
    {
      mode: 'airport-transfer',
      title: 'Q70 LaGuardia Link bus',
      from: '74 St–Roosevelt Av',
      to: 'LGA Terminal C',
      durationMinutes: 15,
      distanceMiles: 2.4,
      costUsd: 0,
      provider: 'MTA',
      lineName: 'Q70',
      lineColor: '#2850AD',
      headwayMinutes: 10,
    },
  ],
  'nyc-dc:from-airport-transit': [
    {
      mode: 'transit',
      title: 'Metro Blue Line to downtown',
      from: 'DCA Station',
      to: 'Metro Center',
      durationMinutes: 18,
      distanceMiles: 4.5,
      costUsd: 2.65,
      provider: 'WMATA',
      lineName: 'BL',
      lineColor: '#0076BF',
      headwayMinutes: 10,
    },
    {
      mode: 'walk',
      title: 'Walk to hotel',
      from: 'Metro Center',
      to: 'Downtown DC hotel',
      durationMinutes: 7,
      distanceMiles: 0.35,
      costUsd: 0,
    },
  ],
  'generic:to-airport-transit': [
    {
      mode: 'walk',
      title: 'Walk to the transit stop',
      from: 'Origin',
      to: 'Local transit stop',
      durationMinutes: 8,
      distanceMiles: 0.4,
      costUsd: 0,
    },
    {
      mode: 'transit',
      title: 'Airport rail / bus line',
      from: 'Local transit stop',
      to: 'Departure airport',
      durationMinutes: 40,
      distanceMiles: 11,
      costUsd: 3.5,
      provider: 'Local transit',
    },
  ],
  'generic:from-airport-transit': [
    {
      mode: 'transit',
      title: 'Airport rail / bus line',
      from: 'Arrival airport',
      to: 'Downtown transit stop',
      durationMinutes: 35,
      distanceMiles: 9,
      costUsd: 3.5,
      provider: 'Local transit',
    },
    {
      mode: 'walk',
      title: 'Walk to your destination',
      from: 'Downtown transit stop',
      to: 'Destination',
      durationMinutes: 8,
      distanceMiles: 0.4,
      costUsd: 0,
    },
  ],

  // --- Generic fallback corridor -------------------------------------------
  'generic:to-airport': [
    {
      mode: 'drive',
      title: 'Ride to the airport',
      from: 'Origin',
      to: 'Departure airport',
      durationMinutes: 32,
      distanceMiles: 11,
      costUsd: 38,
      provider: 'Uber',
      notes: ['Typical city-to-airport run — traffic varies'],
    },
  ],
  'generic:from-airport': [
    {
      mode: 'drive',
      title: 'Ride to your destination',
      from: 'Arrival airport',
      to: 'Destination',
      durationMinutes: 26,
      distanceMiles: 9,
      costUsd: 32,
      provider: 'Uber',
    },
  ],
  'generic:to-train': [
    {
      mode: 'walk',
      title: 'Walk to the station',
      from: 'Origin',
      to: 'Downtown rail station',
      durationMinutes: 12,
      distanceMiles: 0.6,
      costUsd: 0,
    },
  ],
  'generic:from-train': [
    {
      mode: 'walk',
      title: 'Walk to your destination',
      from: 'Arrival station',
      to: 'Destination',
      durationMinutes: 12,
      distanceMiles: 0.6,
      costUsd: 0,
    },
  ],
  'generic:to-bus': [
    {
      mode: 'walk',
      title: 'Walk to the bus stop',
      from: 'Origin',
      to: 'Downtown bus stop',
      durationMinutes: 10,
      distanceMiles: 0.5,
      costUsd: 0,
    },
  ],
  'generic:from-bus': [
    {
      mode: 'walk',
      title: 'Walk to your destination',
      from: 'Arrival bus terminal',
      to: 'Destination',
      durationMinutes: 10,
      distanceMiles: 0.5,
      costUsd: 0,
    },
  ],
  'generic:drive': [
    {
      mode: 'drive',
      title: 'Drive to destination',
      from: 'Origin',
      to: 'Destination',
      durationMinutes: 95,
      distanceMiles: 62,
      costUsd: 24,
      notes: ['Estimated from average regional distances'],
    },
  ],
  'generic:transit': [
    {
      mode: 'walk',
      title: 'Walk to nearest station',
      from: 'Origin',
      to: 'Local station',
      durationMinutes: 9,
      distanceMiles: 0.45,
      costUsd: 0,
    },
    {
      mode: 'transit',
      title: 'Regional rail toward destination',
      from: 'Local station',
      to: 'Destination station',
      durationMinutes: 105,
      distanceMiles: 58,
      costUsd: 14.5,
      provider: 'Regional transit',
    },
    {
      mode: 'walk',
      title: 'Walk to destination',
      from: 'Destination station',
      to: 'Destination',
      durationMinutes: 11,
      distanceMiles: 0.55,
      costUsd: 0,
    },
  ],
};

/**
 * Alternate public-transportation paths for a stretch — the Apple Maps-style
 * "other routes" list. Each entry names its lines and carries full legs.
 * Curated for the demo corridors; generic express-bus paths elsewhere.
 */
const TRANSIT_ALTS: Record<string, Array<{ title: string; legs: LocalLeg[] }>> = {
  'nyc-boston:to-airport-transit': [
    {
      title: 'M60 SBS from 125 St',
      legs: [
        {
          mode: 'transit',
          title: 'Subway 1 train to 125 St',
          from: 'Home (Upper West Side)',
          to: '125 St Station',
          durationMinutes: 14,
          distanceMiles: 2.6,
          costUsd: 2.9,
          provider: 'MTA',
          lineName: '1',
          lineColor: '#EE352E',
          headwayMinutes: 5,
        },
        {
          mode: 'airport-transfer',
          title: 'M60 SBS bus to LGA',
          from: '125 St & Lexington Av',
          to: 'LGA Terminal C',
          durationMinutes: 32,
          distanceMiles: 6.8,
          costUsd: 0,
          provider: 'MTA',
          lineName: 'M60',
          lineColor: '#2850AD',
          headwayMinutes: 12,
          notes: ['Free transfer from the subway'],
        },
      ],
    },
  ],
  'nyc-boston:from-airport-transit': [
    {
      title: 'Blue Line via Airport Station',
      legs: [
        {
          mode: 'airport-transfer',
          title: 'Massport shuttle to Airport Station',
          from: 'BOS Terminal A',
          to: 'Airport Station (Blue Line)',
          durationMinutes: 8,
          distanceMiles: 1.1,
          costUsd: 0,
          provider: 'Massport',
        },
        {
          mode: 'transit',
          title: 'Blue Line to State St',
          from: 'Airport Station',
          to: 'State St Station',
          durationMinutes: 12,
          distanceMiles: 2.6,
          costUsd: 2.4,
          provider: 'MBTA',
          lineName: 'BL',
          lineColor: '#003DA5',
          headwayMinutes: 9,
        },
        {
          mode: 'walk',
          title: 'Walk to hotel',
          from: 'State St Station',
          to: 'Downtown hotel',
          durationMinutes: 8,
          distanceMiles: 0.4,
          costUsd: 0,
        },
      ],
    },
  ],
  'nyc-dc:from-airport-transit': [
    {
      title: 'Yellow Line via Gallery Place',
      legs: [
        {
          mode: 'transit',
          title: 'Metro Yellow Line to Gallery Place',
          from: 'DCA Station',
          to: 'Gallery Place',
          durationMinutes: 15,
          distanceMiles: 4.2,
          costUsd: 2.65,
          provider: 'WMATA',
          lineName: 'YL',
          lineColor: '#FFD100',
          headwayMinutes: 10,
        },
        {
          mode: 'walk',
          title: 'Walk to hotel',
          from: 'Gallery Place',
          to: 'Downtown DC hotel',
          durationMinutes: 9,
          distanceMiles: 0.45,
          costUsd: 0,
        },
      ],
    },
  ],
  'generic:to-airport-transit': [
    {
      title: 'Express airport bus',
      legs: [
        {
          mode: 'walk',
          title: 'Walk to the express-bus stop',
          from: 'Origin',
          to: 'Express-bus stop',
          durationMinutes: 6,
          distanceMiles: 0.3,
          costUsd: 0,
        },
        {
          mode: 'airport-transfer',
          title: 'Express bus to the airport',
          from: 'Express-bus stop',
          to: 'Departure airport',
          durationMinutes: 33,
          distanceMiles: 11,
          costUsd: 8,
          provider: 'Airport express',
          notes: ['Fewer stops than the local line'],
        },
      ],
    },
  ],
  'generic:from-airport-transit': [
    {
      title: 'Express downtown bus',
      legs: [
        {
          mode: 'airport-transfer',
          title: 'Express bus downtown',
          from: 'Arrival airport',
          to: 'Downtown terminal',
          durationMinutes: 28,
          distanceMiles: 9,
          costUsd: 8,
          provider: 'Airport express',
        },
        {
          mode: 'walk',
          title: 'Walk to your destination',
          from: 'Downtown terminal',
          to: 'Destination',
          durationMinutes: 7,
          distanceMiles: 0.35,
          costUsd: 0,
        },
      ],
    },
  ],
};

/** NYC's LGA paths apply to every NYC corridor with the same airport run. */
TRANSIT_ALTS['nyc-dc:to-airport-transit'] = TRANSIT_ALTS['nyc-boston:to-airport-transit'];

export function getTransitPathAlternatives(
  corridor: CorridorKey,
  facet: string,
): Array<{ title: string; legs: LocalLeg[] }> {
  return (
    TRANSIT_ALTS[`${corridor}:${facet}-transit`] ??
    TRANSIT_ALTS[`generic:${facet}-transit`] ??
    []
  );
}

export async function getLocalLegs(
  corridor: CorridorKey,
  facet: string,
): Promise<ServiceResult<LocalAccess>> {
  if (isLive('googleMapsApiKey')) {
    // REAL API: call Google Directions here with the actual addresses.
  }

  await mockDelay(200);

  const legs = ACCESS[`${corridor}:${facet}`];
  if (!legs) {
    return { ok: false, error: `No local route data for ${corridor}:${facet}`, code: 'NOT_FOUND' };
  }
  return { ok: true, data: { legs } };
}
