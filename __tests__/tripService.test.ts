/**
 * Integration smoke tests for the trip orchestrator: exercises the whole
 * mock pipeline (weather → line-haul → local legs → pricing → ranking)
 * for every supported corridor.
 */

import { searchRoutes } from '../src/services/tripService';
import type { TripSearch } from '../src/types';

function makeSearch(origin: string, destination: string, overrides: Partial<TripSearch> = {}): TripSearch {
  return {
    origin: { address: origin, label: 'Home' },
    destination: { address: destination, label: 'destination' },
    departureTime: '2026-07-11T12:00:00.000Z',
    travelers: 2,
    bags: 1,
    preference: 'easiest',
    ...overrides,
  };
}

jest.setTimeout(20_000);

describe('searchRoutes corridors', () => {
  const corridors: Array<[string, string, string, number]> = [
    ['NYC → Boston', '215 W 75th St, New York, NY', 'Downtown hotel, Boston, MA', 4],
    ['NYC → DC', '215 W 75th St, New York, NY', 'Downtown hotel, Washington, DC', 4],
    ['Manhattan → JFK', 'Bryant Park, Manhattan, NY', 'JFK Airport, Terminal 4', 3],
    ['Manhattan → EWR', 'Bryant Park, Manhattan, NY', 'Newark Airport (EWR), Terminal B', 3],
    ['Logan → Boston', 'Boston Logan Airport, Terminal A', 'Downtown hotel, Boston, MA', 3],
  ];

  it.each(corridors)('%s returns enough complete route options', async (_label, origin, dest, minRoutes) => {
    const result = await searchRoutes(makeSearch(origin, dest));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { routes } = result.data;
    expect(routes.length).toBeGreaterThanOrEqual(minRoutes);

    for (const route of routes) {
      // Timeline must be chronological.
      const times = route.timeline.map((s) => new Date(s.time).getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);

      // Segments must chain: each departs at or after the previous arrival.
      for (let i = 1; i < route.segments.length; i++) {
        expect(new Date(route.segments[i].departureTime).getTime()).toBeGreaterThanOrEqual(
          new Date(route.segments[i - 1].arrivalTime).getTime(),
        );
      }

      // Every route needs a price breakdown, booking links, and a leave time.
      expect(route.priceBreakdown.items.length).toBeGreaterThan(0);
      expect(route.bookingLinks.length).toBeGreaterThan(0);
      expect(route.totalDurationMinutes).toBeGreaterThan(0);
      expect(new Date(route.recommendedLeaveTime).getTime()).not.toBeNaN();
    }

    // Exactly one best-overall badge across the set.
    const bestCount = routes.filter((r) => r.badges.includes('best-overall')).length;
    expect(bestCount).toBe(1);
  });

  it('marks flight routes with airport intelligence and bag warnings', async () => {
    const result = await searchRoutes(
      makeSearch('215 W 75th St, New York, NY', 'Downtown hotel, Boston, MA', { bags: 2 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const flight = result.data.routes.find((r) => r.primaryMode === 'flight');
    expect(flight).toBeDefined();
    expect(flight?.airportIntel).toBeDefined();
    expect(flight?.airportIntel?.tsaWaitMinutes.max).toBeGreaterThan(0);
    expect(flight?.airportIntel?.baggageCheckCutoff).toBeDefined();
    // Checked-bag fees must appear in the breakdown as a hidden cost.
    expect(flight?.priceBreakdown.items.some((i) => i.kind === 'baggage' && i.hidden)).toBe(true);
  });

  it('zeroes the fare when the user already holds a train ticket', async () => {
    const withTicket = await searchRoutes(
      makeSearch('215 W 75th St, New York, NY', 'Downtown hotel, Boston, MA', {
        existingTicket: { mode: 'train' },
      }),
    );
    expect(withTicket.ok).toBe(true);
    if (!withTicket.ok) return;

    const train = withTicket.data.routes.find((r) => r.primaryMode === 'train');
    expect(train).toBeDefined();
    const ticketItem = train?.priceBreakdown.items.find((i) => i.kind === 'ticket');
    expect(ticketItem?.amountUsd).toBe(0);
    expect(ticketItem?.label).toContain('already booked');
  });

  it('fails gracefully for an unsupported corridor with no data', async () => {
    const result = await searchRoutes(makeSearch('Springfield, IL', 'Tulsa, OK'));
    // Generic corridor still produces transit/drive/rideshare fallbacks.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.routes.length).toBeGreaterThanOrEqual(2);
  });
});
