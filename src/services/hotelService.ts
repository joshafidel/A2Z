/**
 * Hotel recommendation service.
 *
 * Recommendations adapt to WHY the traveler is going: a work convention
 * sorts business/convention-district stays first, a vacation favors
 * attractions, family trips favor space and kitchens, and layovers favor
 * airport-adjacent hotels. Booking links open Booking.com pre-filled with
 * the destination and real check-in/check-out dates.
 *
 * MOCK: curated stays per demo city.
 * REAL API: Amadeus Hotel Search
 *   GET https://api.amadeus.com/v3/shopping/hotel-offers?cityCode=BOS...
 * or the Booking.com Demand API / Expedia Rapid — map into HotelOption
 * and keep the purpose-scoring below.
 */

import type { CityKey } from '../data/cities';
import type { HotelOption, HotelTag, ServiceResult, TripPurpose } from '../types';
import { mockDelay } from './config';
import { buildHotelSearchLink } from './deepLinkService';

type HotelSeed = Omit<HotelOption, 'bookingUrl' | 'whyRecommended'> & { searchQuery: string };

const HOTELS: Partial<Record<CityKey, HotelSeed[]>> = {
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
      tags: ['business', 'transit'],
      searchQuery: 'Downtown Crossing Boston hotel',
    },
    {
      id: 'bos-2',
      name: 'Seaport Harborview',
      area: 'Seaport District',
      pricePerNightUsd: 241,
      rating: 4.8,
      reviewCount: 3320,
      distanceLabel: '5 min from the BCEC convention center',
      nearAirport: false,
      perks: ['Harbor views', 'Breakfast included'],
      tags: ['convention', 'business', 'attractions'],
      searchQuery: 'Seaport Boston hotel',
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
      tags: ['airport'],
      searchQuery: 'Boston Logan airport hotel',
    },
    {
      id: 'bos-4',
      name: 'Back Bay Garden Suites',
      area: 'Back Bay',
      pricePerNightUsd: 209,
      rating: 4.5,
      reviewCount: 1860,
      distanceLabel: 'Steps from Newbury St & the Public Garden',
      nearAirport: false,
      perks: ['Family rooms', 'Kitchenettes', 'Cribs available'],
      tags: ['family', 'attractions'],
      searchQuery: 'Back Bay Boston hotel',
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
      tags: ['business', 'transit'],
      searchQuery: 'Capitol Hill Washington DC hotel',
    },
    {
      id: 'dc-2',
      name: 'The Monument House',
      area: 'Downtown / Convention Center',
      pricePerNightUsd: 205,
      rating: 4.7,
      reviewCount: 2760,
      distanceLabel: '3 blocks from the Walter E. Washington Convention Center',
      nearAirport: false,
      perks: ['Breakfast included', 'Gym', 'Pet friendly'],
      tags: ['convention', 'business'],
      searchQuery: 'Convention Center Washington DC hotel',
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
      tags: ['airport', 'family'],
      searchQuery: 'Crystal City Arlington hotel',
    },
    {
      id: 'dc-4',
      name: 'Smithsonian Park Hotel',
      area: 'National Mall',
      pricePerNightUsd: 199,
      rating: 4.6,
      reviewCount: 2210,
      distanceLabel: '5 min walk to the National Mall museums',
      nearAirport: false,
      perks: ['Family rooms', 'Museum views'],
      tags: ['attractions', 'family'],
      searchQuery: 'National Mall Washington DC hotel',
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
      distanceLabel: '4 min walk from Penn Station · near Javits Center',
      nearAirport: false,
      perks: ['Free Wi-Fi', '24h front desk'],
      tags: ['business', 'convention', 'transit'],
      searchQuery: 'Penn Station New York hotel',
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
      tags: ['airport'],
      searchQuery: 'JFK airport hotel Jamaica',
    },
  ],
};

const GENERIC_HOTELS: HotelSeed[] = [
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
    tags: ['business', 'transit', 'attractions'],
    searchQuery: 'city center hotel',
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
    tags: ['airport', 'family'],
    searchQuery: 'airport hotel',
  },
];

/** Which tags each purpose favors, plus the copy explaining the match. */
const PURPOSE_FIT: Record<TripPurpose, { tags: HotelTag[]; why: Partial<Record<HotelTag, string>> }> = {
  work: {
    tags: ['convention', 'business'],
    why: {
      convention: 'Right by the convention center — walk to your event.',
      business: 'Business district location with fast transit links.',
    },
  },
  vacation: {
    tags: ['attractions'],
    why: { attractions: 'In the middle of the sights — explore on foot.' },
  },
  family: {
    tags: ['family'],
    why: { family: 'Family rooms and kitchen space for a longer stay.' },
  },
  layover: {
    tags: ['airport'],
    why: { airport: 'Minutes from the terminal for an early departure.' },
  },
};

export interface HotelSearchOptions {
  arrivingByAir?: boolean;
  destinationQuery?: string;
  purpose?: TripPurpose;
  /** Trip date → real check-in/check-out on the booking links. */
  checkinIso?: string;
  nights?: number;
}

export async function getHotelRecommendations(
  cityKey: CityKey,
  opts: HotelSearchOptions = {},
): Promise<ServiceResult<HotelOption[]>> {
  await mockDelay(400);

  const seeds = HOTELS[cityKey] ?? GENERIC_HOTELS.map((h) => ({
    ...h,
    searchQuery: opts.destinationQuery ?? h.searchQuery,
  }));

  const fit = opts.purpose ? PURPOSE_FIT[opts.purpose] : undefined;

  const scored = seeds.map((seed) => {
    let score = seed.rating; // base: quality
    let why: string | undefined;

    if (fit) {
      const matched = seed.tags.find((t) => fit.tags.includes(t));
      if (matched) {
        score += 3; // purpose match dominates
        why = fit.why[matched];
      }
    } else if (opts.arrivingByAir && seed.nearAirport) {
      score += 1.5;
      why = 'Close to the airport for your arrival.';
    }

    const hotel: HotelOption = {
      ...seed,
      bookingUrl: buildHotelSearchLink(seed.searchQuery, opts.checkinIso, opts.nights ?? 1),
      whyRecommended: why,
    };
    return { hotel, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return { ok: true, data: scored.map((s) => s.hotel) };
}
