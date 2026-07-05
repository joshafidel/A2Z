/**
 * Unit tests for the recommendation scoring engine.
 * These are pure functions — no React Native or network involved.
 */

import {
  computeComponents,
  rankRoutes,
  scoreRoute,
  weightsFor,
} from '../src/services/recommendationService';
import type { RouteOption } from '../src/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRoute(overrides: Partial<RouteOption> & { id: string }): RouteOption {
  return {
    title: overrides.id,
    summary: 'test route',
    modeMix: ['train'],
    primaryMode: 'train',
    totalPriceUsd: 100,
    totalDurationMinutes: 240,
    departureTime: '2026-07-11T11:00:00.000Z',
    arrivalTime: '2026-07-11T15:00:00.000Z',
    walkingMinutes: 10,
    transferCount: 1,
    reliabilityScore: 80,
    comfortScore: 75,
    delayRisk: 0.15,
    weatherWarnings: [],
    warnings: [],
    priceBreakdown: { items: [], totalUsd: 100, currency: 'USD', incomplete: false },
    segments: [],
    timeline: [],
    bookingLinks: [],
    walkAdvice: [],
    recommendedLeaveTime: '2026-07-11T11:00:00.000Z',
    arrivalBufferMinutes: 20,
    badges: [],
    backupPlans: [],
    ...overrides,
  };
}

const train = makeRoute({
  id: 'train',
  title: 'Amtrak Acela',
  totalPriceUsd: 132,
  totalDurationMinutes: 270,
  walkingMinutes: 18,
  transferCount: 2,
  reliabilityScore: 88,
  comfortScore: 90,
  delayRisk: 0.12,
});

const bus = makeRoute({
  id: 'bus',
  title: 'FlixBus',
  primaryMode: 'bus',
  totalPriceUsd: 25,
  totalDurationMinutes: 350,
  walkingMinutes: 27,
  transferCount: 3,
  reliabilityScore: 68,
  comfortScore: 55,
  delayRisk: 0.34,
});

const flight = makeRoute({
  id: 'flight',
  title: 'Fly Delta',
  primaryMode: 'flight',
  totalPriceUsd: 260,
  totalDurationMinutes: 250,
  walkingMinutes: 5,
  transferCount: 3,
  reliabilityScore: 74,
  comfortScore: 62,
  delayRisk: 0.4,
  weatherWarnings: [
    { id: 'w1', level: 'high', category: 'weather', message: 'Storms may delay flights' },
  ],
  warnings: [{ id: 'w1', level: 'high', category: 'weather', message: 'Storms may delay flights' }],
});

const all = [train, bus, flight];

// ---------------------------------------------------------------------------
// weightsFor
// ---------------------------------------------------------------------------

describe('weightsFor', () => {
  it('always sums to 1', () => {
    for (const pref of ['cheapest', 'fastest', 'easiest', 'least-walking', 'fewest-transfers', 'most-reliable'] as const) {
      const w = weightsFor(pref);
      const total = Object.values(w).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it('boosts the preferred dimension above its base share', () => {
    const cheap = weightsFor('cheapest');
    const fast = weightsFor('fastest');
    expect(cheap.price).toBeGreaterThan(fast.price);
    expect(fast.time).toBeGreaterThan(cheap.time);
  });
});

// ---------------------------------------------------------------------------
// computeComponents
// ---------------------------------------------------------------------------

describe('computeComponents', () => {
  it('gives the cheapest route the best price score', () => {
    const busC = computeComponents(bus, all);
    const flightC = computeComponents(flight, all);
    expect(busC.price).toBe(100);
    expect(flightC.price).toBe(0);
  });

  it('gives the fastest route the best time score', () => {
    const flightC = computeComponents(flight, all);
    const busC = computeComponents(bus, all);
    expect(flightC.time).toBe(100);
    expect(busC.time).toBe(0);
  });

  it('treats a missing price as neutral-low, not best or worst', () => {
    const noPrice = makeRoute({ id: 'np', totalPriceUsd: undefined });
    const c = computeComponents(noPrice, [...all, noPrice]);
    expect(c.price).toBe(40);
  });

  it('penalizes weather warnings in the weather component', () => {
    const clear = computeComponents(train, all);
    const stormy = computeComponents(flight, all);
    expect(stormy.weather).toBeLessThan(clear.weather);
  });
});

// ---------------------------------------------------------------------------
// scoreRoute + rankRoutes
// ---------------------------------------------------------------------------

describe('scoreRoute', () => {
  it('produces an overall score between 0 and 100', () => {
    for (const r of all) {
      const s = scoreRoute(r, all, 'easiest');
      expect(s.overall).toBeGreaterThanOrEqual(0);
      expect(s.overall).toBeLessThanOrEqual(100);
    }
  });

  it('ranks the bus first when the user wants cheapest', () => {
    const scores = all.map((r) => scoreRoute(r, all, 'cheapest'));
    const top = scores.reduce((a, b) => (a.overall >= b.overall ? a : b));
    expect(top.routeId).toBe('bus');
  });
});

describe('rankRoutes', () => {
  it('handles an empty list without crashing', () => {
    const ranked = rankRoutes([], 'fastest');
    expect(ranked.routes).toHaveLength(0);
    expect(ranked.badges['best-overall']).toBeUndefined();
  });

  it('sorts routes by overall score descending', () => {
    const { routes } = rankRoutes(all, 'most-reliable');
    const scores = routes.map((r) => r.score?.overall ?? 0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('assigns cheapest and fastest badges to the right routes', () => {
    const { badges } = rankRoutes(all, 'easiest');
    expect(badges.cheapest).toBe('bus');
    expect(badges.fastest).toBe('flight');
  });

  it('never assigns the cheapest badge to a route with unknown price', () => {
    const noPrice = makeRoute({ id: 'np', totalPriceUsd: undefined, totalDurationMinutes: 100 });
    const { badges } = rankRoutes([noPrice, train], 'cheapest');
    expect(badges.cheapest).toBe('train');
  });

  it('prefers the reliable, comfortable train for least-stressful', () => {
    const { badges } = rankRoutes(all, 'easiest');
    expect(badges['least-stressful']).toBe('train');
  });

  it('writes a plain-English explanation on the best route', () => {
    const { routes, badges } = rankRoutes(all, 'easiest');
    const best = routes.find((r) => r.id === badges['best-overall']);
    expect(best?.score?.explanation).toContain('Best overall');
  });

  it('respects the user preference: cheapest promotes the bus', () => {
    const cheap = rankRoutes(all, 'cheapest');
    expect(cheap.badges['best-overall']).toBe('bus');
  });
});
