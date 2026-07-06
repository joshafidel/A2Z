/**
 * Real-geography coverage: flights must populate for ANY known city pair
 * (the Miami case), trains only where rail is an option, and distances
 * must come from actual coordinates.
 */

import { findCityCoords, haversineMiles, nearestAirport } from '../src/data/airports';
import { suggestLocalPlaces } from '../src/services/placesService';
import { getTicketsForMode, searchRoutes } from '../src/services/tripService';
import type { TripSearch } from '../src/types';

jest.setTimeout(30_000);

function makeSearch(origin: string, destination: string): TripSearch {
  return {
    origin: { address: origin, label: 'Home' },
    destination: { address: destination, label: destination.split(',')[0] },
    departureTime: '2026-07-11T12:00:00.000Z',
    travelers: 1,
    bags: 1,
    preference: 'easiest',
  };
}

describe('real geographical data', () => {
  it('computes true great-circle distances', () => {
    const nyc = findCityCoords('Manhattan, New York, NY')!;
    const miami = findCityCoords('Downtown Miami, FL')!;
    const dist = haversineMiles(nyc, miami);
    expect(dist).toBeGreaterThan(1000); // actual ≈1,090 mi
    expect(dist).toBeLessThan(1200);
  });

  it('finds the nearest airport from coordinates', () => {
    const miami = findCityCoords('Downtown Miami, FL')!;
    expect(nearestAirport(miami).code).toBe('MIA');
    const nyc = findCityCoords('Manhattan, New York, NY')!;
    expect(['JFK', 'LGA', 'EWR']).toContain(nearestAirport(nyc).code);
  });

  it('suggests Miami in the autocomplete', () => {
    expect(suggestLocalPlaces('mia')[0].label).toBe('Miami');
  });
});

describe('NYC → Miami (the corridor that previously showed only cars)', () => {
  const search = makeSearch('Manhattan, New York, NY', 'Downtown Miami, FL');

  it('populates flights, and trains where rail exists', async () => {
    const result = await searchRoutes(search);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const modes = result.data.routes.map((r) => r.primaryMode);
    expect(modes).toContain('flight'); // flights always populate
    expect(modes).toContain('train'); // NYC↔Miami is on Amtrak's network
    expect(modes).not.toContain('bus'); // 1,000+ mi — no sane bus option

    // Flight duration reflects real distance (~1,090 mi ≈ 2h50m nonstop).
    const flight = result.data.routes.find((r) => r.primaryMode === 'flight')!;
    const flightSeg = flight.segments.find((s) => s.mode === 'flight')!;
    expect(flightSeg.durationMinutes).toBeGreaterThan(140);
    expect(flightSeg.durationMinutes).toBeLessThan(220);
    expect(flightSeg.from).toContain('(');
    // Train is honestly slow for this distance.
    const train = result.data.routes.find((r) => r.primaryMode === 'train')!;
    expect(train.totalDurationMinutes).toBeGreaterThan(20 * 60);
  });

  it('serves a full flight ticket board for the generic corridor', async () => {
    const board = await getTicketsForMode('generic', 'flight', search);
    expect(board.ok).toBe(true);
    if (!board.ok) return;
    expect(board.data.length).toBeGreaterThanOrEqual(3);
    expect(board.data.filter((t) => t.recommended)).toHaveLength(1);
    expect(board.data[0].haul.fromStation).toMatch(/\((JFK|LGA|EWR)\)/);
    expect(board.data[0].haul.toStation).toContain('(MIA)');
  });
});

describe('short generic pairs', () => {
  it('offers buses for Boston → Philadelphia distances', async () => {
    const result = await searchRoutes(makeSearch('Boston, MA', 'Center City, Philadelphia, PA'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const modes = result.data.routes.map((r) => r.primaryMode);
    expect(modes).toContain('flight');
    expect(modes).toContain('bus'); // ~270 mi → bus is realistic
  });

  it('skips flights when both ends share an airport', async () => {
    const result = await searchRoutes(makeSearch('Downtown Miami, FL', 'Miami Beach, FL'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.routes.map((r) => r.primaryMode)).not.toContain('flight');
  });
});
