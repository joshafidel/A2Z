/**
 * Deterministic departure-engine tests — every rule the engine promises:
 * domestic/international bases, bag/PreCheck/CLEAR adjustments, delay
 * handling (never leave later because of a delay), traffic, missing
 * traffic data, low-confidence buffers, DST transitions, and departures
 * that cross midnight.
 */

import {
  describeDepartureChange,
  recommendDeparture,
  type DepartureRecommendationInput,
} from '../src/services/departureService';

const base: DepartureRecommendationInput = {
  scheduledDepartureAt: new Date('2026-07-20T18:05:00-04:00'),
  estimatedDepartureAt: null,
  routeDurationMinutes: 35,
  routeTrafficDurationMinutes: null,
  isInternational: false,
  hasTsaPrecheck: false,
  hasClear: false,
  checksBag: false,
  routeConfidence: 'high',
};

const minutesBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60_000);

describe('departure engine — lead times', () => {
  it('domestic flight: 120-min base lead, route + buffer itemized', () => {
    const out = recommendDeparture(base);
    expect(out.airportLeadTimeMinutes).toBe(120);
    expect(minutesBetween(base.scheduledDepartureAt, out.targetAirportArrivalAt)).toBe(120);
    expect(minutesBetween(out.targetAirportArrivalAt, out.recommendedLeaveAt)).toBe(35 + 5);
    expect(out.explanation).toContain('Leave by');
  });

  it('international flight: 180-min base lead', () => {
    const out = recommendDeparture({ ...base, isInternational: true });
    expect(out.airportLeadTimeMinutes).toBe(180);
  });

  it('checked bag adds 20 minutes and shows up as a factor', () => {
    const out = recommendDeparture({ ...base, checksBag: true });
    expect(out.airportLeadTimeMinutes).toBe(140);
    expect(out.factors.some((f) => f.label === 'Checked bag' && f.impactMinutes === 20)).toBe(true);
  });

  it('TSA PreCheck subtracts 15 and CLEAR 5, but never below the safe floor', () => {
    const out = recommendDeparture({ ...base, hasTsaPrecheck: true, hasClear: true });
    expect(out.airportLeadTimeMinutes).toBe(100);
    // Pathological stack of preferences cannot go under the floor.
    const floor = recommendDeparture({
      ...base,
      hasTsaPrecheck: true,
      hasClear: true,
      airportArrivalPreferenceMinutes: -60,
    });
    expect(floor.airportLeadTimeMinutes).toBeGreaterThanOrEqual(75);
    expect(floor.factors.some((f) => f.label === 'Safety floor')).toBe(true);
  });
});

describe('departure engine — delays and traffic', () => {
  it('a delayed flight never pushes the leave time later', () => {
    const onTime = recommendDeparture(base);
    const delayed = recommendDeparture({
      ...base,
      estimatedDepartureAt: new Date('2026-07-20T18:42:00-04:00'), // +37 min
    });
    expect(delayed.recommendedLeaveAt.getTime()).toBe(onTime.recommendedLeaveAt.getTime());
    expect(delayed.factors.some((f) => f.label === 'Flight delay')).toBe(true);
  });

  it('a delay later removed returns to the original recommendation', () => {
    const during = recommendDeparture({
      ...base,
      estimatedDepartureAt: new Date('2026-07-20T18:42:00-04:00'),
    });
    const after = recommendDeparture({ ...base, estimatedDepartureAt: null });
    expect(after.recommendedLeaveAt.getTime()).toBe(during.recommendedLeaveAt.getTime());
  });

  it('an EARLIER estimated departure moves everything earlier (safety)', () => {
    const early = recommendDeparture({
      ...base,
      estimatedDepartureAt: new Date('2026-07-20T17:45:00-04:00'),
    });
    const normal = recommendDeparture(base);
    expect(early.recommendedLeaveAt.getTime()).toBeLessThan(normal.recommendedLeaveAt.getTime());
  });

  it('heavy traffic extends the route time and is itemized', () => {
    const out = recommendDeparture({ ...base, routeTrafficDurationMinutes: 76 });
    expect(out.routeTimeMinutes).toBe(76);
    expect(out.factors.some((f) => f.label === 'Current traffic' && f.impactMinutes === 41)).toBe(true);
  });

  it('missing traffic data falls back to the baseline route time', () => {
    const out = recommendDeparture({ ...base, routeTrafficDurationMinutes: null });
    expect(out.routeTimeMinutes).toBe(35);
  });

  it('low route confidence buys a 20-min buffer vs 5 for high', () => {
    const low = recommendDeparture({ ...base, routeConfidence: 'low' });
    const high = recommendDeparture({ ...base, routeConfidence: 'high' });
    expect(low.uncertaintyBufferMinutes).toBe(20);
    expect(high.uncertaintyBufferMinutes).toBe(5);
    expect(minutesBetween(high.recommendedLeaveAt, low.recommendedLeaveAt)).toBe(15);
  });
});

describe('departure engine — clock edge cases', () => {
  it('handles the spring-forward DST transition without drifting', () => {
    // 2026-03-08 02:00 → 03:00 in America/New_York. A 07:00 EDT flight:
    const out = recommendDeparture({
      ...base,
      scheduledDepartureAt: new Date('2026-03-08T07:00:00-04:00'),
    });
    // 120 lead + 35 route + 5 buffer = 160 real minutes before departure.
    expect(minutesBetween(new Date('2026-03-08T07:00:00-04:00'), out.recommendedLeaveAt)).toBe(160);
  });

  it('handles departures that cross midnight', () => {
    const out = recommendDeparture({
      ...base,
      scheduledDepartureAt: new Date('2026-07-21T00:45:00-04:00'),
    });
    expect(out.recommendedLeaveAt.getTime()).toBeLessThan(
      new Date('2026-07-21T00:45:00-04:00').getTime(),
    );
    expect(minutesBetween(new Date('2026-07-21T00:45:00-04:00'), out.recommendedLeaveAt)).toBe(160);
  });
});

describe('what-changed comparisons', () => {
  it('describes a meaningful move with its cause', () => {
    const before = recommendDeparture({ ...base, routeTrafficDurationMinutes: null });
    const after = recommendDeparture({ ...base, routeTrafficDurationMinutes: 53 });
    const msg = describeDepartureChange(before, after);
    expect(msg).toMatch(/moved from .* to .* because traffic added 18 minutes/);
  });

  it('stays quiet for moves under 10 minutes', () => {
    const before = recommendDeparture(base);
    const after = recommendDeparture({ ...base, routeTrafficDurationMinutes: 40 });
    expect(describeDepartureChange(before, after)).toBeUndefined();
  });
});
