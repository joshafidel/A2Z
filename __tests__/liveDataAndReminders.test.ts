/**
 * Tests for the live-data booking links, rental-car routes, purpose-aware
 * hotels, and the notification reminder schedule (grace periods included).
 */

import {
  buildBusBookingLink,
  buildFlightSearchLink,
  buildHotelSearchLink,
  buildRentalCarLink,
  buildTrainBookingLink,
} from '../src/services/deepLinkService';
import { getHotelRecommendations } from '../src/services/hotelService';
import { buildReminderSchedule } from '../src/services/notificationService';
import { searchRoutes } from '../src/services/tripService';
import type { SavedTrip, TripSearch } from '../src/types';

jest.setTimeout(20_000);

const SEARCH: TripSearch = {
  origin: { address: '215 W 75th St, New York, NY', label: 'Home' },
  destination: { address: 'Downtown hotel, Boston, MA', label: 'Boston hotel' },
  departureTime: '2026-07-11T12:00:00.000Z',
  travelers: 1,
  bags: 1,
  preference: 'easiest',
};

describe('real booking handoff links', () => {
  it('builds a dated Google Flights search for the route', () => {
    const link = buildFlightSearchLink('LGA', 'BOS', '2026-07-11T13:00:00.000Z');
    expect(link.webUrl).toContain('google.com/travel/flights');
    expect(decodeURIComponent(link.webUrl)).toContain('LGA to BOS on 2026-07-11');
  });

  it('builds a dated Wanderu train search with city slugs', () => {
    const link = buildTrainBookingLink('Amtrak', 'https://www.amtrak.com', {
      originCity: 'New York, NY',
      destCity: 'Boston, MA',
      departureIso: '2026-07-11T12:00:00.000Z',
    });
    expect(link.webUrl).toBe('https://www.wanderu.com/en-us/depart/new-york-ny/boston-ma/2026-07-11');
  });

  it('falls back to the provider page without route details', () => {
    const link = buildBusBookingLink('FlixBus', 'https://www.flixbus.com');
    expect(link.webUrl).toBe('https://www.flixbus.com');
  });

  it('builds a Kayak rental link with pickup and drop-off dates', () => {
    const link = buildRentalCarLink('New York', '2026-07-11T12:00:00.000Z');
    expect(link.webUrl).toContain('kayak.com/cars/New-York/2026-07-11/2026-07-12');
  });

  it('adds check-in/check-out to hotel links', () => {
    const url = buildHotelSearchLink('Boston', '2026-07-11T12:00:00.000Z', 2);
    expect(url).toContain('checkin=2026-07-11');
    expect(url).toContain('checkout=2026-07-13');
  });
});

describe('rental car routes', () => {
  it('includes a rental option with access legs to the pickup office', async () => {
    const result = await searchRoutes(SEARCH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rental = result.data.routes.find((r) => r.id.startsWith('route-rental'));
    expect(rental).toBeDefined();
    if (!rental) return;

    // First segment gets you to the office; a pickup step precedes the drive.
    expect(rental.segments[0].mode === 'walk' || rental.segments[0].mode === 'transit').toBe(true);
    expect(rental.segments.some((s) => s.title.startsWith('Pick up car'))).toBe(true);
    expect(rental.segments[rental.segments.length - 1].mode).toBe('drive');
    // Priced: daily rate visible, fuel/tolls as hidden cost.
    expect(rental.priceBreakdown.items.some((i) => i.label.includes('rental'))).toBe(true);
    expect(rental.priceBreakdown.items.some((i) => i.kind === 'fuel' && i.hidden)).toBe(true);
    // Dated Kayak booking link.
    expect(rental.bookingLinks.some((l) => l.webUrl.includes('kayak.com/cars'))).toBe(true);
    // Alternatives listed as backups.
    expect(rental.backupPlans.length).toBeGreaterThan(0);
  });
});

describe('purpose-aware hotel recommendations', () => {
  it('puts convention-district hotels first for work trips', async () => {
    const result = await getHotelRecommendations('boston', { purpose: 'work' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].tags).toContain('convention');
    expect(result.data[0].whyRecommended).toBeTruthy();
  });

  it('puts airport hotels first for layovers', async () => {
    const result = await getHotelRecommendations('boston', { purpose: 'layover' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].nearAirport).toBe(true);
  });

  it('dates the booking links from the trip', async () => {
    const result = await getHotelRecommendations('boston', {
      purpose: 'vacation',
      checkinIso: '2026-07-11T12:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].bookingUrl).toContain('checkin=2026-07-11');
  });
});

describe('trip reminder schedule', () => {
  async function makeTrip(): Promise<SavedTrip> {
    // Search relative to now so timeline steps are in the future.
    const departure = new Date(Date.now() + 24 * 3600_000).toISOString();
    const result = await searchRoutes({ ...SEARCH, departureTime: departure });
    if (!result.ok) throw new Error('search failed');
    const train = result.data.routes.find((r) => r.primaryMode === 'train')!;
    return {
      id: 'trip-test',
      savedAt: new Date().toISOString(),
      search: { ...SEARCH, departureTime: departure },
      route: train,
    };
  }

  it('creates future reminders with grace periods stated in the copy', async () => {
    const trip = await makeTrip();
    const schedule = buildReminderSchedule(trip);
    expect(schedule.length).toBeGreaterThan(0);

    for (const r of schedule) {
      // Fires BEFORE the step, by exactly the grace period.
      const gap = (new Date(r.stepTime).getTime() - new Date(r.fireAt).getTime()) / 60_000;
      expect(Math.round(gap)).toBe(r.graceMinutes);
      expect(r.body).toContain(`${r.graceMinutes}-min grace period`);
      expect(new Date(r.fireAt).getTime()).toBeGreaterThan(Date.now());
    }

    // Sorted chronologically.
    const times = schedule.map((r) => new Date(r.fireAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('skips steps that are already in the past', async () => {
    const trip = await makeTrip();
    const afterTrip = new Date(Date.now() + 10 * 24 * 3600_000);
    expect(buildReminderSchedule(trip, afterTrip)).toHaveLength(0);
  });
});
