/**
 * Meaningful-change detection (thresholds, no spam) and packing-list
 * generation (validated structure, rules fallback, user items preserved).
 */

import {
  generatePackingList,
  mergeRegenerated,
} from '../src/services/packingService';
import { diffSnapshots, recordSnapshot } from '../src/services/tripMonitorService';

describe('meaningful-change detection', () => {
  it('flags delay moves of 10+ minutes and ignores smaller wobbles', () => {
    const prev = { flightEstimatedIso: '2026-07-20T18:05:00Z' };
    expect(diffSnapshots(prev, { flightEstimatedIso: '2026-07-20T18:42:00Z' })[0]).toMatch(
      /Flight departure moved from .* to .*/,
    );
    expect(diffSnapshots(prev, { flightEstimatedIso: '2026-07-20T18:09:00Z' })).toHaveLength(0);
  });

  it('flags gate and status changes', () => {
    const msgs = diffSnapshots(
      { gate: 'B12', flightStatus: 'scheduled' },
      { gate: 'C4', flightStatus: 'cancelled' },
    );
    expect(msgs.join(' ')).toContain('Gate changed from B12 to C4');
    expect(msgs.join(' ')).toContain('scheduled to cancelled');
  });

  it('flags TSA swings of 10+ minutes only', () => {
    expect(diffSnapshots({ tsaWaitMinutes: 15 }, { tsaWaitMinutes: 35 })[0]).toContain('grew');
    expect(diffSnapshots({ tsaWaitMinutes: 15 }, { tsaWaitMinutes: 20 })).toHaveLength(0);
  });

  it('recordSnapshot is idempotent — unchanged data adds no log entries', async () => {
    const snap = { flightStatus: 'scheduled', gate: 'B12' };
    await recordSnapshot('trip-x', snap);
    const second = await recordSnapshot('trip-x', snap);
    expect(second).toHaveLength(0);
    const third = await recordSnapshot('trip-x', { ...snap, gate: 'C4' });
    expect(third).toHaveLength(1);
  });
});

describe('packing list', () => {
  it('falls back to labeled rules-based suggestions without an AI key', async () => {
    const list = await generatePackingList({
      tripId: 't1',
      destination: 'Boston',
      nights: 3,
      travelers: 1,
      checksBag: false,
    });
    expect(list.generatedBy).toBe('rules');
    expect(list.items.length).toBeGreaterThanOrEqual(6);
    expect(list.items.every((i) => i.quantity >= 1)).toBe(true);
    // Carry-on rule is stated, airline policies are NOT invented.
    expect(list.baggageWarnings.join(' ')).toContain('Carry-on only');
  });

  it('adds rain gear when the forecast is wet', async () => {
    const list = await generatePackingList({
      tripId: 't2',
      destination: 'Miami',
      nights: 2,
      travelers: 2,
      checksBag: true,
      weather: {
        locationLabel: 'Miami',
        kind: 'rain',
        tempF: 78,
        precipChance: 70,
        windMph: 10,
        summary: 'Rainy, 78°F',
        advisories: [],
        discomfortScore: 0.5,
        delayImpact: 0.3,
      },
    });
    expect(list.items.some((i) => /umbrella|rain/i.test(i.name))).toBe(true);
    expect(list.weatherWarnings.length).toBeGreaterThan(0);
  });

  it('regeneration preserves user items and packed state', async () => {
    const first = await generatePackingList({
      tripId: 't3',
      destination: 'Boston',
      nights: 2,
      travelers: 1,
      checksBag: false,
    });
    const withUser = {
      ...first,
      items: [
        ...first.items.map((i, idx) => (idx === 0 ? { ...i, packed: true } : i)),
        { id: 'user-1', category: 'Your items', name: 'Gift for grandma', quantity: 1, reason: 'Added by you', essential: false, packed: false, source: 'user' as const },
      ],
    };
    const regenerated = await generatePackingList({
      tripId: 't3',
      destination: 'Boston',
      nights: 2,
      travelers: 1,
      checksBag: false,
    });
    const merged = mergeRegenerated(withUser, regenerated);
    expect(merged.items.some((i) => i.name === 'Gift for grandma')).toBe(true);
    expect(merged.items[0].packed).toBe(true); // packed state carried by name
  });
});
