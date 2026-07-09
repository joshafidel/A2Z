/**
 * First-mile / last-mile access options.
 *
 * Given a corridor facet ("how do I get to Moynihan / LGA / my hotel"),
 * this service produces every reasonable way to cover that stretch —
 * walk+transit, and a full rideshare comparison (Uber, Uber Shuttle,
 * Lyft, Empower, taxi) — priced, timed, and with a recommendation.
 *
 * The trip builder lets users pick one; tripService then rebuilds the
 * door-to-door plan around the choice.
 *
 * REAL API: leg times/distances come from Google Directions via
 * mapsService; ride prices from the rideshare provider APIs.
 */

import { findCityCoords } from '../data/airports';
import type { CorridorKey } from '../data/cities';
import type { ServiceResult, TransportMode, TripSearch, WeatherCondition } from '../types';
import {
  getLiveTransitLegs,
  getLocalLegs,
  getTransitousPaths,
  getTransitPathAlternatives,
} from './mapsService';
import type { LocalLeg } from './mapsService';
import { estimateRide } from './rideshareService';

export interface AccessEndpoints {
  from: string;
  to: string;
}

/** One selectable transit path — the Apple Maps-style route alternative. */
export interface AccessPathChoice {
  id: string;
  title: string; // "Subway to 74 St + Q70 LaGuardia Link", "6 + F"
  legs: LocalLeg[];
  durationMinutes: number;
  /** Total for the whole party. */
  costUsd: number;
  /** Real clock times when the path came from live GTFS routing. */
  departIso?: string;
  arriveIso?: string;
}

export interface AccessOption {
  id: string;
  title: string; // "Subway + walk", "Uber Shuttle"
  modes: TransportMode[];
  legs: LocalLeg[];
  durationMinutes: number;
  /** Total for the whole party. */
  costUsd: number;
  costLabel: string; // "$5.80", "$38–$52"
  description: string;
  badges: Array<'recommended' | 'cheapest' | 'fastest'>;
  provider?: string;
  /** Alternate transit paths (public-transportation option only). */
  pathChoices?: AccessPathChoice[];
}

/** Name a path by its transit lines: "Subway to 74 St + Q70 LaGuardia Link". */
function pathTitle(legs: LocalLeg[]): string {
  const lines = legs.filter((l) => l.mode !== 'walk').map((l) => l.title);
  return lines.length > 0 ? lines.join(' + ') : 'Walk';
}

/** Straight-line ride stats for each access stretch (mock Directions data). */
const RIDE_STATS: Record<string, { miles: number; minutes: number; from: string; to: string; airport?: boolean }> = {
  'nyc-boston:to-train': { miles: 2.8, minutes: 16, from: 'Home (Upper West Side)', to: 'Moynihan Train Hall' },
  'nyc-boston:from-train': { miles: 0.6, minutes: 6, from: 'Boston South Station', to: 'Downtown hotel' },
  'nyc-boston:to-airport': { miles: 10.2, minutes: 38, from: 'Home (Upper West Side)', to: 'LGA Terminal C', airport: true },
  'nyc-boston:from-airport': { miles: 4.1, minutes: 16, from: 'BOS Terminal A', to: 'Downtown hotel', airport: true },
  'nyc-boston:to-bus': { miles: 3.1, minutes: 18, from: 'Home (Upper West Side)', to: '31st St & 8th Ave' },
  'nyc-boston:from-bus': { miles: 0.65, minutes: 6, from: 'South Station Bus Terminal', to: 'Downtown hotel' },
  'nyc-dc:to-train': { miles: 2.8, minutes: 16, from: 'Home (Upper West Side)', to: 'Moynihan Train Hall' },
  'nyc-dc:from-train': { miles: 0.9, minutes: 8, from: 'Washington Union Station', to: 'Downtown DC hotel' },
  'nyc-dc:to-airport': { miles: 10.2, minutes: 38, from: 'Home (Upper West Side)', to: 'LGA Terminal C', airport: true },
  'nyc-dc:from-airport': { miles: 4.5, minutes: 17, from: 'DCA Terminal 2', to: 'Downtown DC hotel', airport: true },
  'nyc-dc:to-bus': { miles: 3.1, minutes: 18, from: 'Home (Upper West Side)', to: '31st St & 8th Ave' },
  'nyc-dc:from-bus': { miles: 0.9, minutes: 8, from: 'Union Station Bus Terminal', to: 'Downtown DC hotel' },
  'generic:to-airport': { miles: 11, minutes: 32, from: 'Origin', to: 'Departure airport', airport: true },
  'generic:from-airport': { miles: 9, minutes: 26, from: 'Arrival airport', to: 'Destination', airport: true },
  'generic:to-train': { miles: 2.5, minutes: 12, from: 'Origin', to: 'Downtown rail station' },
  'generic:from-train': { miles: 2.5, minutes: 12, from: 'Arrival station', to: 'Destination' },
  'generic:to-bus': { miles: 2, minutes: 10, from: 'Origin', to: 'Downtown bus stop' },
  'generic:from-bus': { miles: 2, minutes: 10, from: 'Arrival bus terminal', to: 'Destination' },
};

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

/**
 * Build all access options for one stretch (first or last mile).
 * Always returns at least the transit/walk default when data exists.
 */
/** Real-world endpoints for a facet — used for live Google routing links. */
export function accessEndpoints(
  corridor: CorridorKey,
  facet: string,
  search: TripSearch,
  stationName?: string,
): AccessEndpoints {
  const stats = RIDE_STATS[`${corridor}:${facet}`];
  if (facet.startsWith('to-')) {
    return { from: search.origin.address, to: stationName ?? stats?.to ?? search.destination.address };
  }
  return { from: stationName ?? stats?.from ?? search.origin.address, to: search.destination.address };
}

export async function getAccessOptions(
  corridor: CorridorKey,
  facet: string,
  search: TripSearch,
  weather?: WeatherCondition,
  stationName?: string,
): Promise<ServiceResult<AccessOption[]>> {
  const base = await getLocalLegs(corridor, facet);
  if (!base.ok) return base;

  const options: AccessOption[] = [];
  let legs = base.data.legs;

  // REAL routing: when a Google Maps key is configured, the walk/transit
  // chain comes from Google Directions — actual subway/bus lines, real
  // travel times, and the published fare.
  const endpoints = accessEndpoints(corridor, facet, search, stationName);
  const live = await getLiveTransitLegs(endpoints.from, endpoints.to);
  if (live && legs.length > 0 && legs[0].mode !== 'drive') {
    legs = live;
  }
  const walkMinutes = legs.filter((l) => l.mode === 'walk').reduce((a, l) => a + l.durationMinutes, 0);
  const transitCostPerPerson = legs.reduce((a, l) => a + l.costUsd, 0);
  const transitCost =
    legs.every((l) => l.mode === 'walk')
      ? 0
      : transitCostPerPerson * search.travelers;
  const transitDuration = legs.reduce((a, l) => a + l.durationMinutes, 0);
  const isDefaultRide = legs.length === 1 && legs[0].mode === 'drive';

  if (!isDefaultRide) {
    options.push({
      id: nextId('acc-transit'),
      title: legs.every((l) => l.mode === 'walk') ? 'Walk' : 'Transit + walk',
      modes: Array.from(new Set(legs.map((l) => l.mode))),
      legs,
      durationMinutes: transitDuration,
      costUsd: transitCost,
      costLabel: transitCost === 0 ? 'Free' : `$${transitCost.toFixed(2).replace(/\.00$/, '')}`,
      description: legs.map((l) => l.title).join(' → '),
      badges: [],
    });
  }

  // Public-transportation alternative for stretches whose default is a ride
  // (airport runs get a subway/bus chain too — live Google routing when
  // a key is configured, curated lines otherwise). Alternate paths come
  // along as a dropdown, Apple Maps-style: each names its lines.
  // The city on this stretch's end (origin for to-, destination for from-)
  // powers named-line alternates and rideshare coverage checks.
  const cityAddress = facet.startsWith('to-') ? search.origin.address : search.destination.address;
  const stretchCity = findCityCoords(cityAddress)?.city;

  const transitVariant = await getLocalLegs(corridor, `${facet}-transit`);
  if (transitVariant.ok) {
    const tLegs = (isDefaultRide ? live : undefined) ?? transitVariant.data.legs;
    const perPersonCost = tLegs.reduce((a, l) => a + l.costUsd, 0);
    const total = perPersonCost * search.travelers;
    const buildChoice = (
      legs: LocalLeg[],
      times?: { departIso?: string; arriveIso?: string },
    ): AccessPathChoice => ({
      id: nextId('path'),
      title: pathTitle(legs),
      legs,
      durationMinutes: legs.reduce((a, l) => a + l.durationMinutes, 0),
      costUsd: legs.reduce((a, l) => a + l.costUsd, 0) * search.travelers,
      departIso: times?.departIso,
      arriveIso: times?.arriveIso,
    });
    // REAL routes first: Transitous (keyless GTFS routing — real lines and
    // real clock times, like the Google/Apple Maps route list); curated
    // named-line paths otherwise.
    const livePaths = await getTransitousPaths(endpoints.from, endpoints.to);
    const pathChoices =
      livePaths && livePaths.length > 0
        ? livePaths.map((p) =>
            buildChoice(p.legs, { departIso: p.departIso, arriveIso: p.arriveIso }),
          )
        : [
            buildChoice(tLegs),
            ...getTransitPathAlternatives(corridor, facet).map((alt) => buildChoice(alt.legs)),
          ];
    options.push({
      id: nextId('acc-pt'),
      title: 'Public transportation',
      modes: Array.from(new Set(tLegs.map((l) => l.mode))),
      legs: tLegs,
      durationMinutes: tLegs.reduce((a, l) => a + l.durationMinutes, 0),
      costUsd: total,
      costLabel: total === 0 ? 'Free' : `$${total.toFixed(2).replace(/\.00$/, '')}`,
      description: tLegs.map((l) => l.title).join(' → '),
      badges: [],
      pathChoices,
    });
  }

  // Rideshare comparison for the same stretch. The stretch's city gates
  // city-limited providers (Uber Shuttle, Empower) to where they operate.
  const stats = RIDE_STATS[`${corridor}:${facet}`];
  if (stats) {
    const rides = await estimateRide(stats.miles, stats.minutes, {
      airport: stats.airport,
      city: stretchCity,
    });
    if (rides.ok) {
      for (const ride of rides.data) {
        const mid = Math.round((ride.lowUsd + ride.highUsd) / 2);
        options.push({
          id: nextId(`acc-${ride.provider.toLowerCase().replace(/\s+/g, '-')}`),
          title: ride.provider,
          modes: ['rideshare'],
          legs: [
            {
              mode: 'drive',
              title: `${ride.provider} to ${stats.to}`,
              from: stats.from,
              to: stats.to,
              durationMinutes: ride.rideMinutes + ride.etaMinutes,
              distanceMiles: stats.miles,
              costUsd: mid,
              provider: ride.provider,
              notes: [
                `Fare range $${ride.lowUsd}–$${ride.highUsd}`,
                `Pickup in ~${ride.etaMinutes} min`,
                ...(ride.note ? [ride.note] : []),
              ],
            },
          ],
          durationMinutes: ride.rideMinutes + ride.etaMinutes,
          costUsd: mid,
          costLabel: `$${ride.lowUsd}–$${ride.highUsd}`,
          description: ride.note ?? `${ride.product} · door to door`,
          badges: [],
          provider: ride.provider,
        });
      }
    }
  }

  if (options.length === 0) {
    return { ok: false, error: 'No access options available for this stretch.', code: 'NOT_FOUND' };
  }

  assignBadges(options, { walkMinutes, weather, bags: search.bags });
  return { ok: true, data: options };
}

function assignBadges(
  options: AccessOption[],
  ctx: { walkMinutes: number; weather?: WeatherCondition; bags: number },
): void {
  const cheapest = options.reduce((a, b) => (a.costUsd <= b.costUsd ? a : b));
  const fastest = options.reduce((a, b) => (a.durationMinutes <= b.durationMinutes ? a : b));
  cheapest.badges.push('cheapest');
  if (fastest.id !== cheapest.id) fastest.badges.push('fastest');

  // Recommendation: transit wins unless weather is rough or bags are heavy,
  // in which case the best-value private ride wins.
  const badWeather = (ctx.weather?.discomfortScore ?? 0) >= 0.6;
  const heavyBags = ctx.bags >= 2;
  const transit = options.find((o) => o.modes.includes('transit') || o.modes.includes('walk'));
  const rides = options.filter((o) => o.provider && o.provider !== 'Uber Shuttle');

  let recommended: AccessOption | undefined;
  if (transit && !badWeather && !heavyBags) {
    recommended = transit;
  } else if (rides.length > 0) {
    recommended = rides.reduce((a, b) => (a.costUsd <= b.costUsd ? a : b));
  } else {
    recommended = cheapest;
  }
  recommended.badges.unshift('recommended');
}

/** Plain-English one-liner explaining the recommended pick. */
export function explainAccessChoice(
  options: AccessOption[],
  weather?: WeatherCondition,
  bags = 0,
): string {
  const rec = options.find((o) => o.badges.includes('recommended'));
  if (!rec) return '';
  const cheapest = options.find((o) => o.badges.includes('cheapest'));
  const parts: string[] = [`Recommended: ${rec.title} (${rec.costLabel}, ~${rec.durationMinutes} min).`];
  if ((weather?.discomfortScore ?? 0) >= 0.6) {
    parts.push(`${weather?.summary} — a ride beats waiting outside.`);
  } else if (bags >= 2) {
    parts.push(`With ${bags} bags, skipping stairs and crowds is worth it.`);
  } else if (cheapest && cheapest.id !== rec.id) {
    parts.push(`${cheapest.title} is cheaper (${cheapest.costLabel}) if you have the time.`);
  }
  return parts.join(' ');
}
