/**
 * Tests for the curated planner flow: smart place resolution
 * ("loga" → Logan Airport), ticket boards per mode with a recommended
 * option, min/avg/max stats, and building a plan from one chosen ticket.
 */

import { resolvePlace, suggestLocalPlaces } from '../src/services/placesService';
import {
  buildRouteForTicket,
  getTicketsForMode,
  searchRoutes,
  statsFromTickets,
} from '../src/services/tripService';
import { getAccessOptions } from '../src/services/accessService';
import type { TripSearch } from '../src/types';

jest.setTimeout(30_000);

const SEARCH: TripSearch = {
  origin: { address: '215 W 75th St, New York, NY', label: 'Home' },
  destination: { address: 'Downtown hotel, Boston, MA', label: 'Boston hotel' },
  departureTime: '2026-07-11T12:00:00.000Z',
  travelers: 1,
  bags: 1,
  preference: 'easiest',
};

describe('smart place suggestions', () => {
  it('finds Logan Airport from a partial "loga"', () => {
    const suggestions = suggestLocalPlaces('loga');
    expect(suggestions[0].label).toContain('Logan');
    expect(suggestions[0].kind).toBe('airport');
  });

  it('matches airport codes and aliases', () => {
    expect(suggestLocalPlaces('jfk')[0].label).toContain('JFK');
    expect(suggestLocalPlaces('penn')[0].label).toContain('Penn Station');
    expect(suggestLocalPlaces('dc')[0].label).toContain('Washington');
  });

  it('resolves strong matches and passes through unknown addresses', () => {
    expect(resolvePlace('logan airport').address).toContain('Logan');
    const raw = resolvePlace('123 Nowhere Lane, Springfield');
    expect(raw.address).toBe('123 Nowhere Lane, Springfield');
    expect(raw.label).toBe('123 Nowhere Lane');
  });
});

describe('ticket boards', () => {
  it('lists multiple train departures with exactly one recommended first', async () => {
    const board = await getTicketsForMode('nyc-boston', 'train', SEARCH);
    expect(board.ok).toBe(true);
    if (!board.ok) return;

    expect(board.data.length).toBeGreaterThanOrEqual(4); // several departures
    expect(board.data.filter((t) => t.recommended)).toHaveLength(1);
    expect(board.data[0].recommended).toBe(true); // recommended sorted first
    // Everything on the board is the selected mode only.
    expect(board.data.every((t) => t.haul.mode === 'train')).toBe(true);
    // Departures are distinct times.
    const times = new Set(board.data.map((t) => t.departureTime));
    expect(times.size).toBeGreaterThan(1);
  });

  it('errors cleanly for a mode with no service', async () => {
    // Phoenix ↔ Las Vegas has no useful rail — the board must say so.
    const noRail: TripSearch = {
      ...SEARCH,
      origin: { address: 'Phoenix, AZ', label: 'Home' },
      destination: { address: 'The Strip, Las Vegas, NV', label: 'Las Vegas' },
    };
    const board = await getTicketsForMode('generic', 'train', noRail);
    expect(board.ok).toBe(false);
  });

  it('computes cheapest / priciest / average stats', async () => {
    const board = await getTicketsForMode('nyc-boston', 'train', SEARCH);
    if (!board.ok) throw new Error('board failed');
    const stats = statsFromTickets(board.data, 60);
    expect(stats.price).toBeDefined();
    expect(stats.price!.min).toBeLessThanOrEqual(stats.price!.avg);
    expect(stats.price!.avg).toBeLessThanOrEqual(stats.price!.max);
    expect(stats.durationMinutes.min).toBeLessThanOrEqual(stats.durationMinutes.avg);
    expect(stats.durationMinutes.avg).toBeLessThanOrEqual(stats.durationMinutes.max);
  });
});

describe('building the plan from a chosen ticket', () => {
  it('assembles a door-to-door route for the picked ticket + access choices', async () => {
    const board = await getTicketsForMode('nyc-boston', 'train', SEARCH);
    if (!board.ok) throw new Error('board failed');
    const chosen = board.data[1] ?? board.data[0];

    const access = await getAccessOptions('nyc-boston', 'to-train', SEARCH);
    if (!access.ok) throw new Error('access failed');
    const uber = access.data.find((o) => o.provider === 'Uber');

    const route = await buildRouteForTicket(SEARCH, 'nyc-boston', chosen, uber);
    expect(route.ok).toBe(true);
    if (!route.ok) return;

    // The plan is built around the exact chosen departure.
    const haulSeg = route.data.segments.find((s) => s.mode === 'train');
    expect(haulSeg?.departureTime).toBe(chosen.departureTime);
    expect(route.data.segments[0].provider).toBe('Uber');
    // Timeline chronological.
    const times = route.data.timeline.map((s) => new Date(s.time).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('still supports the mode-comparison search that powers stats', async () => {
    const results = await searchRoutes(SEARCH);
    expect(results.ok).toBe(true);
    if (!results.ok) return;
    expect(results.data.routes.length).toBeGreaterThanOrEqual(4);
  });
});
