/**
 * Tests for the new booking-flow services: multi-provider rideshare
 * comparison, first/last-mile access options, trip rebuilds, and hotel
 * recommendations.
 */

import { getAccessOptions } from '../src/services/accessService';
import { getHotelRecommendations, hotelAreasFor } from '../src/services/hotelService';
import { estimateRide } from '../src/services/rideshareService';
import { rebuildRouteWithAccess, searchRoutes } from '../src/services/tripService';
import type { TripSearch } from '../src/types';

jest.setTimeout(20_000);

const SEARCH: TripSearch = {
  origin: { address: '215 W 75th St, New York, NY', label: 'Home' },
  destination: { address: 'Downtown hotel, Boston, MA', label: 'Boston hotel' },
  departureTime: '2026-07-11T12:00:00.000Z',
  travelers: 1,
  bags: 1,
  preference: 'easiest',
};

describe('rideshareService provider comparison', () => {
  it('compares Uber, Lyft, Empower, and taxi in a city Empower serves', async () => {
    const result = await estimateRide(3, 15, { city: 'Washington' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const providers = result.data.map((e) => e.provider);
    expect(providers).toEqual(expect.arrayContaining(['Uber', 'Lyft', 'Empower', 'Taxi']));
    expect(providers).not.toContain('Uber Shuttle'); // airport-only product
  });

  it('adds Uber Shuttle on airport trips where it operates, sorted cheapest first', async () => {
    const result = await estimateRide(10, 38, { airport: true, city: 'New York' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((e) => e.provider)).toContain('Uber Shuttle');
    const lows = result.data.map((e) => e.lowUsd);
    expect([...lows].sort((a, b) => a - b)).toEqual(lows);
    // The shared shuttle should be the cheapest way to the airport.
    expect(result.data[0].provider).toBe('Uber Shuttle');
  });

  it('hides Uber Shuttle and Empower where they do not operate', async () => {
    const denver = await estimateRide(10, 38, { airport: true, city: 'Denver' });
    expect(denver.ok).toBe(true);
    if (!denver.ok) return;
    const providers = denver.data.map((e) => e.provider);
    expect(providers).not.toContain('Uber Shuttle'); // NYC/CHI/CLT/PIT only
    expect(providers).not.toContain('Empower'); // DC & Miami only
    expect(providers).toEqual(expect.arrayContaining(['Uber', 'Lyft', 'Taxi']));
  });

  it('offers Empower in Miami now that it has launched there', async () => {
    const result = await estimateRide(5, 20, { city: 'Miami' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((e) => e.provider)).toContain('Empower');
  });

  it('prices rides by the city cost level — the same trip costs less in Miami than NYC', async () => {
    const nyc = await estimateRide(8, 30, { city: 'New York' });
    const miami = await estimateRide(8, 30, { city: 'Miami' });
    expect(nyc.ok && miami.ok).toBe(true);
    if (!nyc.ok || !miami.ok) return;
    const nycUber = nyc.data.find((e) => e.provider === 'Uber')!;
    const miamiUber = miami.data.find((e) => e.provider === 'Uber')!;
    expect(miamiUber.lowUsd).toBeLessThan(nycUber.lowUsd);
  });

  it('prices Empower below UberX', async () => {
    const result = await estimateRide(5, 20, { city: 'Washington' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const uber = result.data.find((e) => e.provider === 'Uber');
    const empower = result.data.find((e) => e.provider === 'Empower');
    expect(empower!.lowUsd).toBeLessThan(uber!.lowUsd);
  });
});

describe('accessService first/last-mile options', () => {
  it('offers transit plus a rideshare comparison, gated to local providers', async () => {
    const result = await getAccessOptions('nyc-boston', 'to-train', SEARCH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const titles = result.data.map((o) => o.title);
    expect(titles).toContain('Transit + walk');
    expect(titles).toEqual(expect.arrayContaining(['Uber', 'Lyft', 'Taxi']));
    // Empower doesn't operate in New York — it must not be offered here.
    expect(titles).not.toContain('Empower');
    // Exactly one recommended option, and cheapest/fastest are marked.
    expect(result.data.filter((o) => o.badges.includes('recommended'))).toHaveLength(1);
    expect(result.data.some((o) => o.badges.includes('cheapest'))).toBe(true);
  });

  it('gives the public-transportation option selectable line-by-line paths', async () => {
    const result = await getAccessOptions('nyc-boston', 'to-airport', SEARCH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pt = result.data.find((o) => o.title === 'Public transportation');
    expect(pt?.pathChoices?.length).toBeGreaterThanOrEqual(2);
    const titles = pt!.pathChoices!.map((p) => p.title);
    // Named by their actual lines, Apple Maps-style.
    expect(titles.join(' ')).toMatch(/Q70|M60/);
    for (const p of pt!.pathChoices!) {
      expect(p.legs.length).toBeGreaterThan(0);
      expect(p.durationMinutes).toBeGreaterThan(0);
    }
  });

  it('recommends a private ride when the traveler has heavy bags', async () => {
    const result = await getAccessOptions('nyc-boston', 'to-train', { ...SEARCH, bags: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const recommended = result.data.find((o) => o.badges.includes('recommended'));
    expect(recommended?.modes).toContain('rideshare');
  });
});

describe('rebuildRouteWithAccess', () => {
  it('rebuilds a train route with an Uber first mile', async () => {
    const search = await searchRoutes(SEARCH);
    expect(search.ok).toBe(true);
    if (!search.ok) return;

    const train = search.data.routes.find((r) => r.primaryMode === 'train');
    expect(train?.builder).toBeDefined();
    if (!train?.builder) return;

    const access = await getAccessOptions('nyc-boston', train.builder.accessFacet, SEARCH);
    expect(access.ok).toBe(true);
    if (!access.ok) return;
    const uber = access.data.find((o) => o.provider === 'Uber');
    expect(uber).toBeDefined();

    const rebuilt = await rebuildRouteWithAccess(SEARCH, train, uber);
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) return;

    // Same identity, new first segment is the chosen ride.
    expect(rebuilt.data.id).toBe(train.id);
    expect(rebuilt.data.segments[0].provider).toBe('Uber');
    expect(rebuilt.data.builder?.firstMileId).toBe(uber!.id);
    // Timeline still chronological after the rebuild.
    const times = rebuilt.data.timeline.map((s) => new Date(s.time).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('hotelService', () => {
  it('returns Boston hotels sorted by rating for ground arrivals', async () => {
    const result = await getHotelRecommendations('boston', { arrivingByAir: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThanOrEqual(3);
    const ratings = result.data.map((h) => h.rating);
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
  });

  it('puts airport-adjacent stays first for air arrivals', async () => {
    const result = await getHotelRecommendations('boston', { arrivingByAir: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].nearAirport).toBe(true);
  });

  it('falls back to generic stays for unknown cities', async () => {
    const result = await getHotelRecommendations('unknown', { destinationQuery: 'Tulsa, OK' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0].bookingUrl).toContain('Tulsa');
  });

  it('books the EXACT hotel: the booking link carries the hotel name + dates', async () => {
    const result = await getHotelRecommendations('boston', {
      destinationQuery: 'Boston, MA',
      checkinIso: '2026-07-25T12:00:00.000Z',
      nights: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const url = decodeURIComponent(result.data[0].bookingUrl);
    expect(url).toContain(result.data[0].name); // this exact property
    expect(url).toContain('checkin=2026-07-25');
    expect(url).toContain('checkout=2026-07-27');
  });

  it('offers a beach area only where a beach exists', () => {
    expect(hotelAreasFor('unknown', 'Miami, FL')).toContain('beach');
    expect(hotelAreasFor('unknown', 'Kansas City, MO')).not.toContain('beach');
    expect(hotelAreasFor('boston', 'Boston, MA')).not.toContain('beach');
    // Everyone keeps the core choices.
    expect(hotelAreasFor('unknown', 'Kansas City, MO')).toEqual(
      expect.arrayContaining(['airport', 'attraction', 'downtown', 'custom']),
    );
  });

  it('filters to luxury stays, with a five-star fallback anywhere', async () => {
    const miami = await getHotelRecommendations('unknown', {
      destinationQuery: 'Miami, FL',
      luxury: true,
    });
    expect(miami.ok).toBe(true);
    if (!miami.ok) return;
    expect(miami.data.every((h) => h.tags.includes('luxury'))).toBe(true);
    expect(miami.data.map((h) => h.name)).toContain('South Beach Shorehouse');

    // Unknown city → the generic five-star stay keeps the filter alive.
    const tulsa = await getHotelRecommendations('unknown', {
      destinationQuery: 'Tulsa, OK',
      luxury: true,
    });
    expect(tulsa.ok).toBe(true);
    if (!tulsa.ok) return;
    expect(tulsa.data.length).toBeGreaterThan(0);
    expect(tulsa.data.every((h) => h.tags.includes('luxury'))).toBe(true);
  });
});
