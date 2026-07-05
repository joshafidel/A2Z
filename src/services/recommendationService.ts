/**
 * Smart recommendation engine.
 *
 * Pure functions (no I/O) that score, rank, badge, and explain route
 * options. Unit-tested in `__tests__/recommendationService.test.ts`.
 */

import type {
  RecommendationScore,
  RouteBadge,
  RouteOption,
  TravelPreference,
} from '../types';
import { formatDuration } from '../utils/time';

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

interface Weights {
  price: number;
  time: number;
  walking: number;
  weather: number;
  transfers: number;
  reliability: number;
  delayRisk: number;
  comfort: number;
}

const BASE_WEIGHTS: Weights = {
  price: 0.2,
  time: 0.22,
  walking: 0.08,
  weather: 0.1,
  transfers: 0.08,
  reliability: 0.12,
  delayRisk: 0.1,
  comfort: 0.1,
};

/** Which component each preference boosts, then weights are renormalized. */
const PREFERENCE_BOOST: Record<TravelPreference, Array<keyof Weights>> = {
  cheapest: ['price'],
  fastest: ['time'],
  easiest: ['transfers', 'walking', 'comfort'],
  'least-walking': ['walking'],
  'fewest-transfers': ['transfers'],
  'most-reliable': ['reliability', 'delayRisk'],
};

export function weightsFor(preference: TravelPreference): Weights {
  const w: Weights = { ...BASE_WEIGHTS };
  const boosted = PREFERENCE_BOOST[preference];
  // A single-dimension preference ("cheapest") is a strong statement — boost
  // hard so it can outvote a route that's merely good at everything else.
  const multiplier = boosted.length === 1 ? 5 : 3;
  for (const key of boosted) {
    w[key] *= multiplier;
  }
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  (Object.keys(w) as Array<keyof Weights>).forEach((k) => {
    w[k] = w[k] / total;
  });
  return w;
}

// ---------------------------------------------------------------------------
// Component scores (each 0–100, higher = better)
// ---------------------------------------------------------------------------

/** Min-max normalize where LOWER raw values are better. */
function inverseNormalize(value: number, min: number, max: number): number {
  if (max === min) return 100;
  return Math.round(100 * (1 - (value - min) / (max - min)));
}

function weatherPenalty(route: RouteOption): number {
  // More outdoor minutes + harsher warnings = lower score.
  const warningWeight = route.weatherWarnings.reduce(
    (sum, w) => sum + (w.level === 'high' ? 30 : w.level === 'medium' ? 18 : 8),
    0,
  );
  const exposure = Math.min(route.walkingMinutes, 45); // cap exposure influence
  return Math.max(0, Math.round(100 - warningWeight - exposure));
}

export function computeComponents(
  route: RouteOption,
  all: RouteOption[],
): RecommendationScore['components'] {
  const prices = all.map((r) => r.totalPriceUsd).filter((p): p is number => p !== undefined);
  const durations = all.map((r) => r.totalDurationMinutes);
  const walks = all.map((r) => r.walkingMinutes);
  const transfers = all.map((r) => r.transferCount);

  const priceScore =
    route.totalPriceUsd === undefined
      ? 40 // unknown price: neutral-low so it can't win "cheapest" but isn't buried
      : inverseNormalize(route.totalPriceUsd, Math.min(...prices), Math.max(...prices));

  return {
    price: priceScore,
    time: inverseNormalize(
      route.totalDurationMinutes,
      Math.min(...durations),
      Math.max(...durations),
    ),
    walking: inverseNormalize(route.walkingMinutes, Math.min(...walks), Math.max(...walks)),
    weather: weatherPenalty(route),
    transfers: inverseNormalize(
      route.transferCount,
      Math.min(...transfers),
      Math.max(...transfers),
    ),
    reliability: Math.round(route.reliabilityScore),
    delayRisk: Math.round(100 * (1 - route.delayRisk)),
    comfort: Math.round(route.comfortScore),
  };
}

// ---------------------------------------------------------------------------
// Scoring + badges
// ---------------------------------------------------------------------------

export function scoreRoute(
  route: RouteOption,
  all: RouteOption[],
  preference: TravelPreference,
): RecommendationScore {
  const components = computeComponents(route, all);
  const w = weightsFor(preference);
  const overall =
    components.price * w.price +
    components.time * w.time +
    components.walking * w.walking +
    components.weather * w.weather +
    components.transfers * w.transfers +
    components.reliability * w.reliability +
    components.delayRisk * w.delayRisk +
    components.comfort * w.comfort;

  return {
    routeId: route.id,
    overall: Math.round(overall),
    components,
    explanation: '', // filled in after ranking so it can reference alternatives
  };
}

function stressScore(r: RouteOption): number {
  // Lower = calmer. Blends comfort, reliability, transfers, walking, weather.
  const weatherHits = r.weatherWarnings.length * 12;
  return (
    (100 - r.comfortScore) +
    (100 - r.reliabilityScore) +
    r.transferCount * 15 +
    r.walkingMinutes * 1.5 +
    r.delayRisk * 60 +
    weatherHits
  );
}

export interface RankedRoutes {
  /** Routes sorted by overall score, descending, with scores + badges set. */
  routes: RouteOption[];
  badges: Record<RouteBadge, string | undefined>; // badge -> routeId
}

/**
 * Score every route, sort by fit, assign the four headline badges, and write
 * a plain-English explanation onto each route's score.
 */
export function rankRoutes(routes: RouteOption[], preference: TravelPreference): RankedRoutes {
  if (routes.length === 0) {
    return {
      routes: [],
      badges: { 'best-overall': undefined, cheapest: undefined, fastest: undefined, 'least-stressful': undefined },
    };
  }

  const scored = routes.map((r) => ({ ...r, score: scoreRoute(r, routes, preference) }));
  scored.sort((a, b) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0));

  const best = scored[0];
  const priced = scored.filter((r) => r.totalPriceUsd !== undefined);
  const cheapest =
    priced.length > 0
      ? priced.reduce((a, b) => ((a.totalPriceUsd ?? 0) <= (b.totalPriceUsd ?? 0) ? a : b))
      : undefined;
  const fastest = scored.reduce((a, b) =>
    a.totalDurationMinutes <= b.totalDurationMinutes ? a : b,
  );
  const calmest = scored.reduce((a, b) => (stressScore(a) <= stressScore(b) ? a : b));

  const badgeMap: Record<RouteBadge, string | undefined> = {
    'best-overall': best.id,
    cheapest: cheapest?.id,
    fastest: fastest.id,
    'least-stressful': calmest.id,
  };

  for (const route of scored) {
    route.badges = (Object.keys(badgeMap) as RouteBadge[]).filter(
      (badge) => badgeMap[badge] === route.id,
    );
    if (route.score) {
      route.score.explanation = explainRoute(route, scored, badgeMap);
    }
  }

  return { routes: scored, badges: badgeMap };
}

// ---------------------------------------------------------------------------
// Plain-English explanations
// ---------------------------------------------------------------------------

function money(n: number): string {
  return `$${Math.round(n)}`;
}

export function explainRoute(
  route: RouteOption,
  all: RouteOption[],
  badges: Record<RouteBadge, string | undefined>,
): string {
  const parts: string[] = [];
  const others = all.filter((r) => r.id !== route.id);

  if (badges['best-overall'] === route.id) {
    const runnerUp = others[0];
    parts.push(`Best overall: ${route.title}.`);
    if (runnerUp) {
      const priceDiff =
        route.totalPriceUsd !== undefined && runnerUp.totalPriceUsd !== undefined
          ? route.totalPriceUsd - runnerUp.totalPriceUsd
          : undefined;
      const timeDiff = runnerUp.totalDurationMinutes - route.totalDurationMinutes;
      if (priceDiff !== undefined && priceDiff > 0 && timeDiff > 0) {
        parts.push(
          `It is ${money(priceDiff)} more than ${runnerUp.title}, but saves ${formatDuration(timeDiff)}.`,
        );
      } else if (priceDiff !== undefined && priceDiff < 0) {
        parts.push(`It costs ${money(-priceDiff)} less than ${runnerUp.title}.`);
      } else if (timeDiff > 0) {
        parts.push(`It saves ${formatDuration(timeDiff)} over ${runnerUp.title}.`);
      }
    }
    if (route.primaryMode === 'train') parts.push('It avoids airport security and arrives downtown.');
    if (route.transferCount === 0) parts.push('No transfers along the way.');
  } else {
    // Contextualize a non-winner against the best option.
    const best = all.find((r) => r.id === badges['best-overall']);
    if (badges.cheapest === route.id && best && best.id !== route.id) {
      if (route.totalPriceUsd !== undefined && best.totalPriceUsd !== undefined) {
        parts.push(
          `Cheapest option — saves ${money(best.totalPriceUsd - route.totalPriceUsd)} vs ${best.title},`,
        );
        const slower = route.totalDurationMinutes - best.totalDurationMinutes;
        parts.push(
          slower > 0 ? `but takes ${formatDuration(slower)} longer.` : 'with a similar travel time.',
        );
      } else {
        parts.push('Cheapest option on this corridor.');
      }
    } else if (badges.fastest === route.id) {
      parts.push('Fastest door-to-door.');
      if (route.delayRisk > 0.25) parts.push('Watch the delay risk, though.');
    } else if (badges['least-stressful'] === route.id) {
      parts.push('Least stressful: fewest hassles, most predictable.');
    } else if (route.score) {
      const weak = weakestComponent(route.score.components);
      parts.push(`Solid option, but ${weak} holds it back.`);
    }
  }

  if (route.weatherWarnings.some((w) => w.level !== 'low')) {
    parts.push('Weather may affect this route — check the warnings.');
  }
  return parts.join(' ');
}

function weakestComponent(c: RecommendationScore['components']): string {
  const labels: Record<keyof RecommendationScore['components'], string> = {
    price: 'the higher price',
    time: 'the longer travel time',
    walking: 'the amount of walking',
    weather: 'the weather exposure',
    transfers: 'the number of transfers',
    reliability: 'lower reliability',
    delayRisk: 'the delay risk',
    comfort: 'lower comfort',
  };
  const entries = Object.entries(c) as Array<[keyof RecommendationScore['components'], number]>;
  entries.sort((a, b) => a[1] - b[1]);
  return labels[entries[0][0]];
}
