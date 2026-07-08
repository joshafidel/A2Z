/**
 * Tests for this round's coverage upgrades: multi-carrier buses with
 * regional carriers (RedCoach in TX/FL, Peter Pan in the Northeast),
 * every major rental company, unfamiliar-address inference, the
 * Amtrak-direct booking link, and exact-flight provider links.
 */

import { airportsNear, busTerminalFor, trainStationFor } from '../src/data/airports';
import { generateBuses } from '../src/services/busService';
import { searchFlights } from '../src/services/flightService';
import {
  buildFlightProviderLinks,
  buildTicketPurchaseLink,
  buildTrainBookingLink,
} from '../src/services/deepLinkService';
import { generateFlights } from '../src/services/flightService';
import { resolveCityCoords } from '../src/services/geoService';
import { searchRentalCars } from '../src/services/rentalCarService';
import { generateTrains } from '../src/services/trainService';

jest.setTimeout(20_000);

describe('multi-carrier bus coverage', () => {
  it('offers Greyhound, FlixBus, and Megabus on any served pair', async () => {
    const buses = await generateBuses('Austin, TX', 'Dallas, TX');
    const providers = buses.map((b) => b.provider);
    expect(providers).toEqual(expect.arrayContaining(['Greyhound', 'FlixBus', 'Megabus']));
    const greyhound = buses.find((b) => b.provider === 'Greyhound');
    expect(greyhound?.bookingUrl).toContain('greyhound.com');
  });

  it('adds RedCoach within Texas and within Florida, but not in the Northeast', async () => {
    const texas = await generateBuses('Austin, TX', 'Dallas, TX');
    expect(texas.map((b) => b.provider)).toContain('RedCoach');

    const florida = await generateBuses('Miami, FL', 'Orlando, FL');
    expect(florida.map((b) => b.provider)).toContain('RedCoach');

    const northeast = await generateBuses('New York, NY', 'Boston, MA');
    expect(northeast.map((b) => b.provider)).not.toContain('RedCoach');
    expect(northeast.map((b) => b.provider)).toContain('Peter Pan');
  });

  it('prices RedCoach as the premium first-class option', async () => {
    const buses = await generateBuses('Miami, FL', 'Orlando, FL');
    const redcoach = buses.find((b) => b.provider === 'RedCoach');
    const greyhound = buses.find((b) => b.provider === 'Greyhound');
    expect(redcoach!.farePerPersonUsd).toBeGreaterThan(greyhound!.farePerPersonUsd!);
    expect(redcoach!.comfortScore).toBeGreaterThan(greyhound!.comfortScore);
  });
});

describe('rental cars include all the top companies', () => {
  it('offers Enterprise, Hertz, Avis, Alamo, National, and Budget', async () => {
    const result = await searchRentalCars('generic', 'Denver, CO', 'Salt Lake City, UT');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const companies = result.data.offers.map((o) => o.company);
    expect(companies).toEqual(
      expect.arrayContaining(['Enterprise', 'Hertz', 'Avis', 'Alamo', 'National', 'Budget']),
    );
  });
});

describe('unfamiliar addresses are resolved, never guessed', () => {
  it('resolves known city keywords instantly (offline)', async () => {
    const miami = await resolveCityCoords('South Beach, Miami, FL');
    expect(miami?.city).toBe('Miami');
    expect(miami?.amtrak).toBe(true);
  });

  it('returns no flights when the destination cannot be located', async () => {
    const flights = await generateFlights('New York, NY', 'Zzyzx Nowhere Lane 00000');
    expect(flights).toEqual([]);
  });

  it('returns no trains when either end lacks Amtrak service', async () => {
    // Las Vegas has no Amtrak service — no train options should be invented.
    const trains = await generateTrains('Los Angeles, CA', 'Las Vegas, NV');
    expect(trains).toEqual([]);
  });

  it('generates real trains between Amtrak cities', async () => {
    const trains = await generateTrains('Chicago, IL', 'St. Louis, MO');
    expect(trains.length).toBeGreaterThan(0);
    expect(trains[0].provider).toBe('Amtrak');
  });
});

describe('departure points near the origin', () => {
  it('finds every NYC airport — JFK, LGA, and EWR', () => {
    const near = airportsNear({ lat: 40.7128, lng: -74.006 }, 80);
    const codes = near.map((n) => n.airport.code);
    expect(codes).toEqual(expect.arrayContaining(['JFK', 'LGA', 'EWR']));
    // Sorted closest first.
    const miles = near.map((n) => n.miles);
    expect([...miles].sort((a, b) => a - b)).toEqual(miles);
  });

  it('always returns at least one airport even for remote spots', () => {
    // Middle of Montana — nothing within 80 miles.
    const near = airportsNear({ lat: 47.0, lng: -109.0 }, 80);
    expect(near.length).toBeGreaterThanOrEqual(1);
  });

  it('names the real rail hub and bus terminal for major cities', () => {
    expect(trainStationFor('New York')).toContain('Moynihan');
    expect(busTerminalFor('New York')).toContain('Port Authority');
    expect(trainStationFor('Smallville')).toBe('Smallville Amtrak Station');
  });
});

describe('flights from every nearby airport', () => {
  it('generates flights out of multiple origin airports for NYC', async () => {
    const flights = await generateFlights('New York, NY', 'Miami, FL');
    const codes = new Set(
      flights.map((f) => f.fromStation.match(/\(([A-Z]{3})\)/)?.[1]).filter(Boolean),
    );
    expect(codes.size).toBeGreaterThanOrEqual(2);
    expect(codes).toContain('JFK');
  });

  it('adds JFK/EWR departures alongside the curated LGA shuttle on NYC-Boston', async () => {
    const result = await searchFlights('nyc-boston', {
      originAddress: 'New York, NY',
      destAddress: 'Boston, MA',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const codes = new Set(
      result.data.map((f) => f.fromStation.match(/\(([A-Z]{3})\)/)?.[1]).filter(Boolean),
    );
    expect(codes).toContain('LGA');
    expect(codes).toContain('JFK');
    expect(codes).toContain('EWR');
  });
});

describe('booking links', () => {
  it('sends Amtrak bookings to amtrak.com, never an aggregator', () => {
    const link = buildTrainBookingLink('Amtrak', 'https://www.wanderu.com', {
      originCity: 'New York, NY',
      destCity: 'Boston, MA',
      departureIso: '2026-07-11T12:00:00.000Z',
    });
    expect(link.webUrl).toContain('amtrak.com');
    expect(link.webUrl).not.toContain('wanderu');

    const purchase = buildTicketPurchaseLink('train', {
      originCity: 'New York, NY',
      destCity: 'Boston, MA',
      departureIso: '2026-07-11T12:00:00.000Z',
    });
    expect(purchase.webUrl).toContain('amtrak.com');
  });

  it('offers every major flight site, targeting the exact selected flight', () => {
    const links = buildFlightProviderLinks('JFK', 'MIA', '2026-07-11T12:00:00.000Z', 2, 'DL 1232');
    const providers = links.map((l) => l.provider);
    expect(providers).toEqual(
      expect.arrayContaining([
        'Expedia',
        'Kayak',
        'Google Flights',
        'Skyscanner',
        'Southwest',
        'Delta',
        'American Airlines',
      ]),
    );
    const google = links.find((l) => l.provider === 'Google Flights');
    expect(decodeURIComponent(google!.webUrl)).toContain('DL 1232');
    const kayak = links.find((l) => l.provider === 'Kayak');
    expect(kayak!.webUrl).toContain('JFK-MIA/2026-07-11');
  });
});
