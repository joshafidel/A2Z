/**
 * Hotel recommendation service.
 *
 * MOCK: curated stays per demo city, positioned relative to where the
 * traveler actually arrives (downtown station vs airport).
 *
 * REAL API: Amadeus Hotel Search
 *   GET https://api.amadeus.com/v3/shopping/hotel-offers?cityCode=BOS...
 * or the Booking.com Demand API / Expedia Rapid. Map results into
 * HotelOption; the booking links below already point at official search
 * pages as a web fallback.
 */

import type { CityKey } from '../data/cities';
import type { HotelOption, ServiceResult } from '../types';
import { mockDelay } from './config';

function bookingSearchUrl(query: string): string {
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(query)}`;
}

const HOTELS: Partial<Record<CityKey, HotelOption[]>> = {
  boston: [
    {
      id: 'bos-1',
      name: 'The Beacon Downtown',
      area: 'Downtown Crossing',
      pricePerNightUsd: 189,
      rating: 4.6,
      reviewCount: 2140,
      distanceLabel: '6 min walk from South Station',
      nearAirport: false,
      perks: ['Free Wi-Fi', 'Late checkout', 'Gym'],
      bookingUrl: bookingSearchUrl('Downtown Crossing Boston hotel'),
    },
    {
      id: 'bos-2',
      name: 'Seaport Harborview',
      area: 'Seaport District',
      pricePerNightUsd: 241,
      rating: 4.8,
      reviewCount: 3320,
      distanceLabel: '10 min from South Station · 12 min from Logan',
      nearAirport: false,
      perks: ['Harbor views', 'Breakfast included'],
      bookingUrl: bookingSearchUrl('Seaport Boston hotel'),
    },
    {
      id: 'bos-3',
      name: 'Logan Airport Inn',
      area: 'East Boston',
      pricePerNightUsd: 139,
      rating: 4.2,
      reviewCount: 1580,
      distanceLabel: '5 min free shuttle to Logan terminals',
      nearAirport: true,
      perks: ['Free airport shuttle', 'Early breakfast from 4 AM'],
      bookingUrl: bookingSearchUrl('Boston Logan airport hotel'),
    },
  ],
  dc: [
    {
      id: 'dc-1',
      name: 'Capitol Row Hotel',
      area: 'Capitol Hill',
      pricePerNightUsd: 175,
      rating: 4.5,
      reviewCount: 1890,
      distanceLabel: '8 min walk from Union Station',
      nearAirport: false,
      perks: ['Free Wi-Fi', 'Rooftop bar'],
      bookingUrl: bookingSearchUrl('Capitol Hill Washington DC hotel'),
    },
    {
      id: 'dc-2',
      name: 'The Monument House',
      area: 'Downtown / Metro Center',
      pricePerNightUsd: 205,
      rating: 4.7,
      reviewCount: 2760,
      distanceLabel: '2 blocks from Metro Center station',
      nearAirport: false,
      perks: ['Breakfast included', 'Gym', 'Pet friendly'],
      bookingUrl: bookingSearchUrl('Metro Center Washington DC hotel'),
    },
    {
      id: 'dc-3',
      name: 'National Gateway Suites',
      area: 'Crystal City',
      pricePerNightUsd: 149,
      rating: 4.3,
      reviewCount: 1420,
      distanceLabel: '1 Metro stop from DCA airport',
      nearAirport: true,
      perks: ['Free airport shuttle', 'Kitchenettes'],
      bookingUrl: bookingSearchUrl('Crystal City Arlington hotel'),
    },
  ],
  nyc: [
    {
      id: 'nyc-1',
      name: 'Midtown 34 Hotel',
      area: 'Midtown / Penn Station',
      pricePerNightUsd: 219,
      rating: 4.4,
      reviewCount: 4120,
      distanceLabel: '4 min walk from Penn Station',
      nearAirport: false,
      perks: ['Free Wi-Fi', '24h front desk'],
      bookingUrl: bookingSearchUrl('Penn Station New York hotel'),
    },
    {
      id: 'nyc-2',
      name: 'Jamaica AirGate',
      area: 'Jamaica, Queens',
      pricePerNightUsd: 129,
      rating: 4.1,
      reviewCount: 980,
      distanceLabel: 'AirTrain to JFK in 18 min',
      nearAirport: true,
      perks: ['Free shuttle', 'Early breakfast'],
      bookingUrl: bookingSearchUrl('JFK airport hotel Jamaica'),
    },
  ],
};

const GENERIC_HOTELS: HotelOption[] = [
  {
    id: 'gen-1',
    name: 'Central Square Hotel',
    area: 'City center',
    pricePerNightUsd: 145,
    rating: 4.3,
    reviewCount: 1240,
    distanceLabel: 'Walkable to downtown transit',
    nearAirport: false,
    perks: ['Free Wi-Fi', 'Breakfast included'],
    bookingUrl: bookingSearchUrl('city center hotel'),
  },
  {
    id: 'gen-2',
    name: 'Airport Parkway Inn',
    area: 'Airport district',
    pricePerNightUsd: 112,
    rating: 4.0,
    reviewCount: 860,
    distanceLabel: 'Free shuttle to the airport',
    nearAirport: true,
    perks: ['Free airport shuttle', 'Free parking'],
    bookingUrl: bookingSearchUrl('airport hotel'),
  },
];

/**
 * Recommend hotels for a destination city. When the traveler arrives by
 * air, airport-adjacent stays sort higher for early departures.
 */
export async function getHotelRecommendations(
  cityKey: CityKey,
  opts: { arrivingByAir?: boolean; destinationQuery?: string } = {},
): Promise<ServiceResult<HotelOption[]>> {
  await mockDelay(400);

  const hotels = HOTELS[cityKey] ?? GENERIC_HOTELS.map((h) => ({
    ...h,
    bookingUrl: bookingSearchUrl(opts.destinationQuery ?? 'hotel'),
  }));

  const sorted = [...hotels].sort((a, b) => {
    if (opts.arrivingByAir && a.nearAirport !== b.nearAirport) {
      return a.nearAirport ? -1 : 1;
    }
    return b.rating - a.rating;
  });
  return { ok: true, data: sorted };
}
