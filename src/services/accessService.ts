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

import type { CorridorKey } from '../data/cities';
import type { ServiceResult, TransportMode, TripSearch, WeatherCondition } from '../types';
import { getLocalLegs } from './mapsService';
import type { LocalLeg } from './mapsService';
import { estimateRide } from './rideshareService';

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
export async function getAccessOptions(
  corridor: CorridorKey,
  facet: string,
  search: TripSearch,
  weather?: WeatherCondition,
): Promise<ServiceResult<AccessOption[]>> {
  const base = await getLocalLegs(corridor, facet);
  if (!base.ok) return base;

  const options: AccessOption[] = [];
  const legs = base.data.legs;
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

  // Rideshare comparison for the same stretch.
  const stats = RIDE_STATS[`${corridor}:${facet}`];
  if (stats) {
    const rides = await estimateRide(stats.miles, stats.minutes, { airport: stats.airport });
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
