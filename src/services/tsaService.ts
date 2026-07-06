/**
 * TSA wait-time / airport intelligence service.
 *
 * MOCK: typical wait profiles per airport and hour of day.
 *
 * REAL API: the MyTSA API exposes historical waits; several airports
 * publish live queue times (e.g. via TSA.gov or airport open-data feeds).
 * Replace `getTsaEstimate` internals; the AirportIntel builder stays as-is.
 */

import type { AirportIntel, ServiceResult } from '../types';
import { addMinutes, formatTime } from '../utils/time';
import { mockDelay } from './config';

interface AirportProfile {
  name: string;
  /** [min, max] TSA wait minutes for off-peak. */
  baseWait: [number, number];
  /** Extra minutes during morning (6–9 AM) and evening (4–7 PM) peaks. */
  peakExtra: number;
  busy: boolean;
}

const AIRPORTS: Record<string, AirportProfile> = {
  LGA: { name: 'LaGuardia Airport', baseWait: [15, 25], peakExtra: 12, busy: true },
  JFK: { name: 'JFK International Airport', baseWait: [18, 30], peakExtra: 15, busy: true },
  EWR: { name: 'Newark Liberty Airport', baseWait: [16, 28], peakExtra: 14, busy: true },
  BOS: { name: 'Boston Logan Airport', baseWait: [12, 22], peakExtra: 10, busy: true },
  DCA: { name: 'Reagan National Airport', baseWait: [10, 20], peakExtra: 10, busy: false },
};

/** Sensible defaults for airports without a curated wait profile. */
function profileFor(airportCode: string): AirportProfile {
  return (
    AIRPORTS[airportCode] ?? {
      name: `${airportCode} Airport`,
      baseWait: [14, 26],
      peakExtra: 10,
      busy: false,
    }
  );
}

export async function getTsaEstimate(
  airportCode: string,
  departureIso: string,
): Promise<ServiceResult<{ min: number; max: number }>> {
  await mockDelay(80);

  const profile = profileFor(airportCode);

  const hour = new Date(departureIso).getHours();
  const isPeak = (hour >= 6 && hour <= 9) || (hour >= 16 && hour <= 19);
  const extra = isPeak ? profile.peakExtra : 0;
  return { ok: true, data: { min: profile.baseWait[0] + extra, max: profile.baseWait[1] + extra } };
}

/**
 * Build the full airport plan for a flight: when to arrive, when boarding
 * starts, bag-check cutoff, and when to leave home given travel time.
 */
export async function buildAirportIntel(params: {
  airportCode: string;
  flightDepartureIso: string;
  travelMinutesToAirport: number;
  checkedBags: boolean;
  international?: boolean;
}): Promise<ServiceResult<AirportIntel>> {
  const { airportCode, flightDepartureIso, travelMinutesToAirport, checkedBags, international } =
    params;

  const profile = profileFor(airportCode);

  const tsa = await getTsaEstimate(airportCode, flightDepartureIso);
  const tsaWait = tsa.ok ? tsa.data : { min: 15, max: 30 };

  const reasons: string[] = [];
  // Base buffer: domestic 90 min; add for bags / international / busy airports.
  let arriveBeforeMinutes = 90;
  if (checkedBags) {
    arriveBeforeMinutes += 15;
    reasons.push('Extra 15 min added for checked-bag drop-off.');
  }
  if (international) {
    arriveBeforeMinutes += 60;
    reasons.push('International flight — arrive 60 min earlier for document checks.');
  }
  if (profile.busy) {
    arriveBeforeMinutes += 10;
    reasons.push(`${profile.name} is busy — 10 extra minutes recommended.`);
  }
  const hour = new Date(flightDepartureIso).getHours();
  if (hour >= 6 && hour <= 9) {
    reasons.push('Morning rush — TSA lines peak between 6–9 AM.');
  }

  const boardingTime = addMinutes(flightDepartureIso, -35);
  const recommendedArrivalTime = addMinutes(flightDepartureIso, -arriveBeforeMinutes);
  const baggageCheckCutoff = checkedBags ? addMinutes(flightDepartureIso, -45) : undefined;
  // Leave-home = arrival target minus travel time minus a 10-min pickup/frictions pad.
  const leaveHomeBy = addMinutes(recommendedArrivalTime, -(travelMinutesToAirport + 10));

  return {
    ok: true,
    data: {
      airportCode,
      airportName: profile.name,
      recommendedArrivalTime,
      tsaWaitMinutes: tsaWait,
      securityBufferMinutes: tsaWait.max + 10,
      boardingTime,
      gateArrivalRecommendation: `Be at the gate by ${formatTime(addMinutes(boardingTime, -10))}`,
      baggageCheckCutoff,
      leaveHomeBy,
      reasons,
    },
  };
}
