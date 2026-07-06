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
import { isLive, mockDelay } from './config';

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
}

export interface LocalAccess {
  /** Ordered legs from the door to the station/airport (or full local trip). */
  legs: LocalLeg[];
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
