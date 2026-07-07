/**
 * Rental car service.
 *
 * Builds a full rental option: getting to the pickup office (walk/transit/
 * ride), pickup paperwork time, the drive itself (real road time via OSRM
 * when reachable), and daily rates per company. Booking links open Kayak's
 * rental search pre-filled with the city and dates.
 *
 * MOCK: offices + rates below. REAL API: rental aggregators (Kayak/
 * Priceline affiliate, CarTrawler) or direct company APIs plug in here.
 */

import type { CorridorKey } from '../data/cities';
import type { ServiceResult } from '../types';
import { mockDelay } from './config';
import { drivingRouteByAddress } from './geoService';
import type { LocalLeg } from './mapsService';

export interface RentalOffer {
  company: string; // "Hertz", "Enterprise", "Budget"
  officeName: string;
  officeAddress: string;
  carClass: string; // "Midsize · Toyota Corolla or similar"
  dailyRateUsd: number;
  /** Legs to reach the pickup office from the traveler's start. */
  accessLegs: LocalLeg[];
  pickupProcessMinutes: number; // counter + lot time
  notes: string[];
}

interface CityRentalData {
  cityLabel: string;
  offers: RentalOffer[];
}

const RENTALS: Partial<Record<CorridorKey, CityRentalData>> = {
  'nyc-boston': {
    cityLabel: 'New York',
    offers: [
      {
        company: 'Hertz',
        officeName: 'Hertz Midtown West',
        officeAddress: '346 W 40th St, New York, NY',
        carClass: 'Midsize · Toyota Corolla or similar',
        dailyRateUsd: 89,
        accessLegs: [
          {
            mode: 'transit',
            title: 'Subway 1 train to 42 St',
            from: 'Home (Upper West Side)',
            to: 'Times Sq–42 St Station',
            durationMinutes: 12,
            distanceMiles: 1.9,
            costUsd: 2.9,
            provider: 'MTA',
          },
          {
            mode: 'walk',
            title: 'Walk to Hertz Midtown West',
            from: 'Times Sq–42 St Station',
            to: '346 W 40th St',
            durationMinutes: 7,
            distanceMiles: 0.35,
            costUsd: 0,
          },
        ],
        pickupProcessMinutes: 25,
        notes: ['Return in Boston (one-way fee ~$75 included in estimate)'],
      },
      {
        company: 'Enterprise',
        officeName: 'Enterprise Upper West Side',
        officeAddress: '2160 Broadway, New York, NY',
        carClass: 'Compact · Nissan Sentra or similar',
        dailyRateUsd: 79,
        accessLegs: [
          {
            mode: 'walk',
            title: 'Walk to Enterprise Upper West Side',
            from: 'Home (Upper West Side)',
            to: '2160 Broadway',
            durationMinutes: 9,
            distanceMiles: 0.45,
            costUsd: 0,
          },
        ],
        pickupProcessMinutes: 20,
        notes: ['Closest office — 9 min walk from home', 'One-way fee ~$75 included in estimate'],
      },
    ],
  },
  'nyc-dc': {
    cityLabel: 'New York',
    offers: [
      {
        company: 'Enterprise',
        officeName: 'Enterprise Upper West Side',
        officeAddress: '2160 Broadway, New York, NY',
        carClass: 'Compact · Nissan Sentra or similar',
        dailyRateUsd: 79,
        accessLegs: [
          {
            mode: 'walk',
            title: 'Walk to Enterprise Upper West Side',
            from: 'Home (Upper West Side)',
            to: '2160 Broadway',
            durationMinutes: 9,
            distanceMiles: 0.45,
            costUsd: 0,
          },
        ],
        pickupProcessMinutes: 20,
        notes: ['One-way fee ~$85 included in estimate'],
      },
      {
        company: 'Budget',
        officeName: 'Budget Midtown',
        officeAddress: '304 W 49th St, New York, NY',
        carClass: 'Midsize · Hyundai Elantra or similar',
        dailyRateUsd: 72,
        accessLegs: [
          {
            mode: 'transit',
            title: 'Subway 1 train to 50 St',
            from: 'Home (Upper West Side)',
            to: '50 St Station',
            durationMinutes: 10,
            distanceMiles: 1.6,
            costUsd: 2.9,
            provider: 'MTA',
          },
          {
            mode: 'walk',
            title: 'Walk to Budget Midtown',
            from: '50 St Station',
            to: '304 W 49th St',
            durationMinutes: 5,
            distanceMiles: 0.25,
            costUsd: 0,
          },
        ],
        pickupProcessMinutes: 25,
        notes: ['One-way fee ~$85 included in estimate'],
      },
    ],
  },
  generic: {
    cityLabel: 'your city',
    offers: [
      { company: 'Enterprise', dailyRateUsd: 68, carClass: 'Compact · Nissan Sentra or similar', walkMinutes: 12 },
      { company: 'Hertz', dailyRateUsd: 79, carClass: 'Midsize · Toyota Corolla or similar', walkMinutes: 15 },
      { company: 'Avis', dailyRateUsd: 74, carClass: 'Midsize · Hyundai Elantra or similar', walkMinutes: 14 },
      { company: 'Alamo', dailyRateUsd: 65, carClass: 'Economy · Chevy Spark or similar', walkMinutes: 18 },
      { company: 'National', dailyRateUsd: 88, carClass: 'Full-size · Nissan Altima or similar', walkMinutes: 15 },
      { company: 'Budget', dailyRateUsd: 62, carClass: 'Economy · Kia Rio or similar', walkMinutes: 17 },
    ].map((c) => ({
      company: c.company,
      officeName: `${c.company} (nearest branch)`,
      officeAddress: `Nearest ${c.company} branch`,
      carClass: c.carClass,
      dailyRateUsd: c.dailyRateUsd,
      accessLegs: [
        {
          mode: 'walk' as const,
          title: `Walk to the ${c.company} office`,
          from: 'Origin',
          to: `Nearest ${c.company} branch`,
          durationMinutes: c.walkMinutes,
          distanceMiles: Math.round(c.walkMinutes * 5) / 100,
          costUsd: 0,
        },
      ],
      pickupProcessMinutes: 20,
      notes: ['Estimated from national average rates'],
    })),
  },
};

export interface RentalSearchResult {
  cityLabel: string;
  offers: RentalOffer[];
  /** Real road distance/time for the drive itself, live when available. */
  drive?: { distanceMiles: number; durationMinutes: number; live: boolean };
}

export async function searchRentalCars(
  corridor: CorridorKey,
  originAddress: string,
  destinationAddress: string,
): Promise<ServiceResult<RentalSearchResult>> {
  await mockDelay(300);

  const data = RENTALS[corridor];
  if (!data) {
    return { ok: false, error: 'No rental offices found for this corridor.', code: 'NOT_FOUND' };
  }

  // Real road routing (OSRM) for the actual drive; callers fall back to
  // their corridor mock when this is unavailable.
  const live = await drivingRouteByAddress(originAddress, destinationAddress);
  const drive = live.ok
    ? { distanceMiles: live.data.distanceMiles, durationMinutes: live.data.durationMinutes, live: true }
    : undefined;

  return { ok: true, data: { ...data, drive } };
}
