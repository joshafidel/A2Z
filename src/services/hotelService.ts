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

import { findCityCoords } from '../data/airports';
import type { CityKey } from '../data/cities';
import type { HotelArea, HotelOption, HotelTag, ServiceResult, TripPurpose } from '../types';
import { mockDelay } from './config';
import { buildHotelSearchLink } from './deepLinkService';

type HotelSeed = Omit<HotelOption, 'bookingUrl' | 'whyRecommended'> & { searchQuery: string };

/** Hotel groups keyed by city group name. */
const HOTELS: Record<string, HotelSeed[]> = {
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
      tags: ['business', 'transit', 'downtown'],
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
    {
      id: 'bos-5',
      name: 'North End Waterfront Hotel',
      area: 'North End / Waterfront',
      pricePerNightUsd: 229,
      rating: 4.7,
      reviewCount: 2540,
      distanceLabel: 'On the Freedom Trail · harbor walk at the door',
      nearAirport: false,
      perks: ['Harbor views', 'Family rooms'],
      tags: ['attractions', 'family'],
      searchQuery: 'North End Boston waterfront hotel',
    },
    {
      id: 'bos-6',
      name: 'Cambridge Squares Inn',
      area: 'Cambridge / Kendall Sq',
      pricePerNightUsd: 159,
      rating: 4.4,
      reviewCount: 1320,
      distanceLabel: 'Red Line at the door · 12 min to downtown',
      nearAirport: false,
      perks: ['Free Wi-Fi', 'Breakfast included'],
      tags: ['business', 'transit'],
      searchQuery: 'Kendall Square Cambridge hotel',
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
      tags: ['business', 'transit', 'downtown'],
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
      tags: ['convention', 'business', 'downtown'],
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
    {
      id: 'dc-5',
      name: 'Georgetown Canal House',
      area: 'Georgetown',
      pricePerNightUsd: 224,
      rating: 4.7,
      reviewCount: 1980,
      distanceLabel: 'On the C&O Canal · M Street shopping outside',
      nearAirport: false,
      perks: ['Boutique rooms', 'Bikes included'],
      tags: ['attractions'],
      searchQuery: 'Georgetown Washington DC hotel',
    },
    {
      id: 'dc-6',
      name: 'Dupont Circle Lodge',
      area: 'Dupont Circle',
      pricePerNightUsd: 139,
      rating: 4.2,
      reviewCount: 1150,
      distanceLabel: 'Red Line Metro across the street',
      nearAirport: false,
      perks: ['Free Wi-Fi', 'Budget-friendly'],
      tags: ['transit', 'downtown'],
      searchQuery: 'Dupont Circle Washington DC hotel',
    },
  ],
  miami: [
    {
      id: 'mia-1',
      name: 'South Beach Shorehouse',
      area: 'South Beach',
      pricePerNightUsd: 259,
      rating: 4.7,
      reviewCount: 3890,
      distanceLabel: 'Steps from the sand on Ocean Drive',
      nearAirport: false,
      perks: ['Beachfront', 'Pool', 'Rooftop bar'],
      tags: ['beach', 'attractions'],
      searchQuery: 'South Beach Miami hotel',
    },
    {
      id: 'mia-2',
      name: 'Brickell City Hotel',
      area: 'Brickell / Downtown',
      pricePerNightUsd: 189,
      rating: 4.5,
      reviewCount: 2210,
      distanceLabel: 'Downtown Miami · Metromover at the door',
      nearAirport: false,
      perks: ['Free Wi-Fi', 'Gym', 'Bay views'],
      tags: ['downtown', 'business', 'transit'],
      searchQuery: 'Brickell Miami hotel',
    },
    {
      id: 'mia-3',
      name: 'MIA Gateway Inn',
      area: 'Airport District',
      pricePerNightUsd: 129,
      rating: 4.1,
      reviewCount: 1540,
      distanceLabel: '5 min free shuttle to MIA terminals',
      nearAirport: true,
      perks: ['Free airport shuttle', '24h check-in'],
      tags: ['airport'],
      searchQuery: 'Miami airport hotel',
    },
    {
      id: 'mia-4',
      name: 'Wynwood Arts Loft',
      area: 'Wynwood',
      pricePerNightUsd: 175,
      rating: 4.6,
      reviewCount: 1980,
      distanceLabel: 'In the middle of the Wynwood Walls art district',
      nearAirport: false,
      perks: ['Design rooms', 'Bike rentals'],
      tags: ['attractions', 'family'],
      searchQuery: 'Wynwood Miami hotel',
    },
    {
      id: 'mia-5',
      name: 'Mid-Beach Sands Resort',
      area: 'Mid-Beach',
      pricePerNightUsd: 179,
      rating: 4.4,
      reviewCount: 2670,
      distanceLabel: 'Private beach access · boardwalk to South Beach',
      nearAirport: false,
      perks: ['Beachfront', 'Two pools', 'Family suites'],
      tags: ['beach', 'family'],
      searchQuery: 'Mid-Beach Miami Beach hotel',
    },
    {
      id: 'mia-6',
      name: 'Coconut Grove Bayside',
      area: 'Coconut Grove',
      pricePerNightUsd: 155,
      rating: 4.5,
      reviewCount: 1430,
      distanceLabel: 'Bayfront park & marina · Metrorail 5 min away',
      nearAirport: false,
      perks: ['Pool', 'Kitchenettes', 'Free parking'],
      tags: ['family', 'transit'],
      searchQuery: 'Coconut Grove Miami hotel',
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
      tags: ['business', 'convention', 'transit', 'downtown'],
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
    {
      id: 'nyc-3',
      name: 'Times Square Broadway Hotel',
      area: 'Times Square / Theater District',
      pricePerNightUsd: 249,
      rating: 4.5,
      reviewCount: 5210,
      distanceLabel: 'In the middle of Times Square · Broadway at the door',
      nearAirport: false,
      perks: ['City views', '24h front desk'],
      tags: ['attractions', 'downtown'],
      searchQuery: 'Times Square New York hotel',
    },
    {
      id: 'nyc-4',
      name: 'SoHo Cobblestone Inn',
      area: 'SoHo / Lower Manhattan',
      pricePerNightUsd: 279,
      rating: 4.7,
      reviewCount: 2380,
      distanceLabel: 'Walk to SoHo shopping, Little Italy & the subway',
      nearAirport: false,
      perks: ['Boutique rooms', 'Rooftop terrace'],
      tags: ['attractions', 'downtown'],
      searchQuery: 'SoHo New York hotel',
    },
    {
      id: 'nyc-5',
      name: 'Brooklyn Bridge Suites',
      area: 'DUMBO, Brooklyn',
      pricePerNightUsd: 189,
      rating: 4.6,
      reviewCount: 1740,
      distanceLabel: 'Skyline views · A/C trains 3 min away',
      nearAirport: false,
      perks: ['Family suites', 'Kitchenettes', 'Cribs available'],
      tags: ['family', 'transit'],
      searchQuery: 'DUMBO Brooklyn hotel',
    },
  ],
  orlando: [
    {
      id: 'orl-1',
      name: 'Lake Eola Grand',
      area: 'Downtown Orlando',
      pricePerNightUsd: 149,
      rating: 4.4,
      reviewCount: 1620,
      distanceLabel: 'On Lake Eola Park · downtown at the door',
      nearAirport: false,
      perks: ['Pool', 'Free Wi-Fi'],
      tags: ['downtown', 'business'],
      searchQuery: 'Downtown Orlando hotel',
    },
    {
      id: 'orl-2',
      name: 'Universal Gateway Resort',
      area: 'International Drive',
      pricePerNightUsd: 165,
      rating: 4.5,
      reviewCount: 4380,
      distanceLabel: 'Free shuttle to Universal & minutes from Disney',
      nearAirport: false,
      perks: ['Theme-park shuttle', 'Two pools', 'Family suites'],
      tags: ['attractions', 'family'],
      searchQuery: 'International Drive Orlando hotel',
    },
    {
      id: 'orl-3',
      name: 'MCO Runway Inn',
      area: 'Airport District',
      pricePerNightUsd: 109,
      rating: 4.1,
      reviewCount: 980,
      distanceLabel: '5 min free shuttle to MCO terminals',
      nearAirport: true,
      perks: ['Free airport shuttle', '24h check-in'],
      tags: ['airport'],
      searchQuery: 'Orlando airport hotel',
    },
  ],
  la: [
    {
      id: 'la-1',
      name: 'Santa Monica Shoreline',
      area: 'Santa Monica',
      pricePerNightUsd: 269,
      rating: 4.6,
      reviewCount: 3120,
      distanceLabel: 'Two blocks from the beach & the pier',
      nearAirport: false,
      perks: ['Beachfront', 'Pool', 'Bike rentals'],
      tags: ['beach', 'attractions'],
      searchQuery: 'Santa Monica beach hotel',
    },
    {
      id: 'la-2',
      name: 'Downtown LA Metropolitan',
      area: 'Downtown LA',
      pricePerNightUsd: 179,
      rating: 4.4,
      reviewCount: 2050,
      distanceLabel: 'Metro at the door · walk to Crypto.com Arena',
      nearAirport: false,
      perks: ['Rooftop pool', 'Gym'],
      tags: ['downtown', 'business', 'transit'],
      searchQuery: 'Downtown Los Angeles hotel',
    },
    {
      id: 'la-3',
      name: 'Hollywood Star Suites',
      area: 'Hollywood',
      pricePerNightUsd: 199,
      rating: 4.3,
      reviewCount: 2890,
      distanceLabel: 'On the Walk of Fame · near the Chinese Theatre',
      nearAirport: false,
      perks: ['Family rooms', 'Pool'],
      tags: ['attractions', 'family'],
      searchQuery: 'Hollywood Los Angeles hotel',
    },
    {
      id: 'la-4',
      name: 'LAX Skyway Hotel',
      area: 'Airport District',
      pricePerNightUsd: 129,
      rating: 4.0,
      reviewCount: 1760,
      distanceLabel: 'Free 24h shuttle to LAX terminals',
      nearAirport: true,
      perks: ['Free airport shuttle', 'Soundproof rooms'],
      tags: ['airport'],
      searchQuery: 'LAX airport hotel',
    },
  ],
  chicago: [
    {
      id: 'chi-1',
      name: 'The Loop Grand',
      area: 'The Loop',
      pricePerNightUsd: 185,
      rating: 4.5,
      reviewCount: 2470,
      distanceLabel: "Under the 'L' · walk to Millennium Park",
      nearAirport: false,
      perks: ['Free Wi-Fi', 'Gym', 'River views'],
      tags: ['downtown', 'business', 'transit'],
      searchQuery: 'Chicago Loop hotel',
    },
    {
      id: 'chi-2',
      name: 'Navy Pier Lakeside',
      area: 'Streeterville',
      pricePerNightUsd: 209,
      rating: 4.6,
      reviewCount: 1980,
      distanceLabel: 'Walk to Navy Pier & the Magnificent Mile',
      nearAirport: false,
      perks: ['Lake views', 'Family rooms', 'Pool'],
      tags: ['attractions', 'family'],
      searchQuery: 'Streeterville Chicago hotel',
    },
    {
      id: 'chi-3',
      name: "O'Hare Junction Inn",
      area: 'Airport District',
      pricePerNightUsd: 119,
      rating: 4.1,
      reviewCount: 1340,
      distanceLabel: "Free shuttle to O'Hare · Blue Line nearby",
      nearAirport: true,
      perks: ['Free airport shuttle', 'Park & fly'],
      tags: ['airport', 'transit'],
      searchQuery: "O'Hare airport hotel",
    },
  ],
  vegas: [
    {
      id: 'lv-1',
      name: 'Strip Center Resort',
      area: 'The Strip',
      pricePerNightUsd: 159,
      rating: 4.5,
      reviewCount: 6240,
      distanceLabel: 'Mid-Strip · walk to the Bellagio fountains',
      nearAirport: false,
      perks: ['Pool complex', 'Casino', 'Shows on site'],
      tags: ['attractions', 'downtown'],
      searchQuery: 'Las Vegas Strip hotel',
    },
    {
      id: 'lv-2',
      name: 'Fremont Street Social',
      area: 'Downtown Las Vegas',
      pricePerNightUsd: 89,
      rating: 4.2,
      reviewCount: 2110,
      distanceLabel: 'Under the Fremont Street canopy',
      nearAirport: false,
      perks: ['Budget-friendly', 'Rooftop pool'],
      tags: ['downtown'],
      searchQuery: 'Fremont Street Las Vegas hotel',
    },
    {
      id: 'lv-3',
      name: 'Harry Reid Gateway Inn',
      area: 'Airport District',
      pricePerNightUsd: 99,
      rating: 4.0,
      reviewCount: 890,
      distanceLabel: '5 min free shuttle to LAS terminals',
      nearAirport: true,
      perks: ['Free airport shuttle', '24h check-in'],
      tags: ['airport'],
      searchQuery: 'Las Vegas airport hotel',
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
    tags: ['business', 'transit', 'attractions', 'downtown'],
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
  {
    id: 'gen-3',
    name: 'Old Town Boutique Inn',
    area: 'Historic district',
    pricePerNightUsd: 168,
    rating: 4.6,
    reviewCount: 1520,
    distanceLabel: 'Steps from the main sights',
    nearAirport: false,
    perks: ['Boutique rooms', 'Breakfast included'],
    tags: ['attractions'],
    searchQuery: 'historic district boutique hotel',
  },
  {
    id: 'gen-4',
    name: 'Shoreline Beach Resort',
    area: 'Beachfront',
    pricePerNightUsd: 195,
    rating: 4.5,
    reviewCount: 2040,
    distanceLabel: 'Direct beach access',
    nearAirport: false,
    perks: ['Beachfront', 'Pool', 'Family suites'],
    tags: ['beach', 'family'],
    searchQuery: 'beachfront resort',
  },
  {
    id: 'gen-5',
    name: 'Budget Stay Express',
    area: 'Near downtown',
    pricePerNightUsd: 89,
    rating: 3.9,
    reviewCount: 640,
    distanceLabel: 'Short transit ride to the center',
    nearAirport: false,
    perks: ['Budget-friendly', 'Free parking'],
    tags: ['downtown', 'transit'],
    searchQuery: 'budget hotel downtown',
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

/** Which tags each stay-area preference targets, and the copy explaining it. */
const AREA_FIT: Record<Exclude<HotelArea, 'custom'>, { tags: HotelTag[]; why: string }> = {
  airport: { tags: ['airport'], why: 'Minutes from the terminal.' },
  beach: { tags: ['beach'], why: 'Right by the beach.' },
  attraction: { tags: ['attractions', 'convention'], why: 'Next to the main sights.' },
  downtown: { tags: ['downtown', 'business', 'transit'], why: 'In the heart of downtown.' },
};

/** Map a CityKey and/or free-text destination to a hotel group. */
function resolveHotelGroup(cityKey: CityKey, destinationQuery?: string): HotelSeed[] | undefined {
  const byKey: Partial<Record<CityKey, string>> = {
    boston: 'boston',
    'bos-airport': 'boston',
    dc: 'dc',
    nyc: 'nyc',
    jfk: 'nyc',
    lga: 'nyc',
    ewr: 'nyc',
  };
  const keyGroup = byKey[cityKey];
  if (keyGroup && HOTELS[keyGroup]) return HOTELS[keyGroup];

  // Unknown corridor — resolve through real geography (Miami, etc.).
  if (destinationQuery) {
    const city = findCityCoords(destinationQuery)?.city.toLowerCase();
    const byName: Record<string, string> = {
      miami: 'miami',
      'fort lauderdale': 'miami',
      boston: 'boston',
      washington: 'dc',
      'new york': 'nyc',
      newark: 'nyc',
      orlando: 'orlando',
      'los angeles': 'la',
      chicago: 'chicago',
      'las vegas': 'vegas',
    };
    const group = city ? byName[city] : undefined;
    if (group && HOTELS[group]) return HOTELS[group];
  }
  return undefined;
}

export interface HotelSearchOptions {
  arrivingByAir?: boolean;
  destinationQuery?: string;
  purpose?: TripPurpose;
  /** Where the traveler wants to stay (asked before showing hotels). */
  area?: HotelArea;
  /** Free-text location when area === 'custom' ("near the convention center"). */
  customArea?: string;
  /** Sort by price (cheapest first) instead of best match. */
  sortByPrice?: boolean;
  /** Trip date → real check-in/check-out on the booking links. */
  checkinIso?: string;
  nights?: number;
}

export async function getHotelRecommendations(
  cityKey: CityKey,
  opts: HotelSearchOptions = {},
): Promise<ServiceResult<HotelOption[]>> {
  await mockDelay(300);

  const seeds =
    resolveHotelGroup(cityKey, opts.destinationQuery) ??
    GENERIC_HOTELS.map((h) => ({
      ...h,
      searchQuery: opts.destinationQuery ?? h.searchQuery,
    }));

  const purposeFit = opts.purpose ? PURPOSE_FIT[opts.purpose] : undefined;
  const areaFit = opts.area && opts.area !== 'custom' ? AREA_FIT[opts.area] : undefined;
  const customQuery = opts.area === 'custom' ? opts.customArea?.trim() : undefined;

  const scored = seeds.map((seed) => {
    let score = seed.rating; // base: quality
    let why: string | undefined;

    // Stay-area preference dominates everything else.
    if (areaFit) {
      const matched = seed.tags.find((t) => areaFit.tags.includes(t));
      if (matched) {
        score += 5;
        why = areaFit.why;
      }
    } else if (customQuery) {
      // Custom entry: fuzzy-match the request against the hotel's area text.
      const q = customQuery.toLowerCase();
      if (`${seed.area} ${seed.distanceLabel}`.toLowerCase().includes(q)) {
        score += 5;
        why = `Matches "${customQuery}".`;
      }
    }

    if (purposeFit) {
      const matched = seed.tags.find((t) => purposeFit.tags.includes(t));
      if (matched) {
        score += 3;
        why = why ?? purposeFit.why[matched];
      }
    } else if (!areaFit && !customQuery && opts.arrivingByAir && seed.nearAirport) {
      score += 1.5;
      why = 'Close to the airport for your arrival.';
    }

    // Custom entries also refine the Booking.com search itself.
    const searchQuery = customQuery
      ? `${customQuery} ${opts.destinationQuery ?? seed.searchQuery}`
      : seed.searchQuery;

    const hotel: HotelOption = {
      ...seed,
      bookingUrl: buildHotelSearchLink(searchQuery, opts.checkinIso, opts.nights ?? 1),
      whyRecommended: why,
    };
    return { hotel, score };
  });

  if (opts.sortByPrice) {
    scored.sort((a, b) => a.hotel.pricePerNightUsd - b.hotel.pricePerNightUsd);
  } else {
    scored.sort((a, b) => b.score - a.score);
  }
  return { ok: true, data: scored.map((s) => s.hotel) };
}
