/**
 * Trip orchestrator.
 *
 * Takes a TripSearch, fans out to the mode services (flights, trains,
 * buses, local maps, rideshare, TSA, weather), and assembles complete
 * door-to-door RouteOptions: segments, timeline, prices, warnings,
 * booking links, airport intel, walk-vs-ride advice, and backup plans.
 * Finally ranks everything with the recommendation engine.
 *
 * Every downstream failure degrades gracefully: missing weather drops the
 * weather warnings, a missing price marks the breakdown `incomplete`, and
 * an unavailable provider simply contributes no routes.
 */

import { CORRIDOR_CITIES, detectCityKey, resolveCorridor, WEATHER_CITY } from '../data/cities';
import type { CorridorKey } from '../data/cities';
import type {
  BackupPlan,
  BookingLink,
  PriceBreakdown,
  PriceLineItem,
  RiskWarning,
  RouteOption,
  RouteSegment,
  ServiceResult,
  TimelineStep,
  TransportMode,
  TripSearch,
  WalkVsRideAdvice,
  WeatherCondition,
} from '../types';
import { addMinutes, formatDuration, formatTime, minutesBetween } from '../utils/time';
import { searchBuses } from './busService';
import {
  buildAirlineBookingLink,
  buildAppleMapsLink,
  buildBusBookingLink,
  buildFlightSearchLink,
  buildGoogleMapsLink,
  buildLyftLink,
  buildRentalCarLink,
  buildTrainBookingLink,
  buildTransitAppLink,
  buildUberLink,
} from './deepLinkService';
import { searchFlights } from './flightService';
import { drivingRouteByAddress } from './geoService';
import { searchRentalCars } from './rentalCarService';
import type { LineHaulOption } from './legTypes';
import { getLocalLegs } from './mapsService';
import type { LocalLeg } from './mapsService';
import { rankRoutes } from './recommendationService';
import { estimatePrimaryRide, estimateRide } from './rideshareService';
import { searchTrains } from './trainService';
import type { AccessOption } from './accessService';
import { buildAirportIntel } from './tsaService';
import { getWeather } from './weatherService';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TripSearchResults {
  routes: RouteOption[];
  originWeather?: WeatherCondition;
  destinationWeather?: WeatherCondition;
  corridor: CorridorKey;
}

export async function searchRoutes(search: TripSearch): Promise<ServiceResult<TripSearchResults>> {
  const originKey = detectCityKey(search.origin.address);
  const destKey = detectCityKey(search.destination.address);
  const corridor = resolveCorridor(originKey, destKey);

  // Weather for both endpoints — failures are tolerated (warnings just drop out).
  const [originWx, destWx] = await Promise.all([
    getWeather(WEATHER_CITY[originKey], search.departureTime),
    getWeather(WEATHER_CITY[destKey], search.departureTime),
  ]);
  const originWeather = originWx.ok ? originWx.data : undefined;
  const destinationWeather = destWx.ok ? destWx.data : undefined;

  const ctx: BuildContext = { search, corridor, originWeather, destinationWeather };

  try {
    const routes =
      corridor === 'nyc-boston' || corridor === 'nyc-dc'
        ? await buildIntercityRoutes(ctx)
        : await buildLocalRoutes(ctx);

    if (routes.length === 0) {
      return {
        ok: false,
        error: 'No routes available for this trip yet. Try one of the sample corridors.',
        code: 'NOT_FOUND',
      };
    }

    const ranked = rankRoutes(routes, search.preference);
    return {
      ok: true,
      data: { routes: ranked.routes, originWeather, destinationWeather, corridor },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Route planning failed unexpectedly.',
      code: 'UNAVAILABLE',
    };
  }
}

// ---------------------------------------------------------------------------
// Shared context + small helpers
// ---------------------------------------------------------------------------

interface BuildContext {
  search: TripSearch;
  corridor: CorridorKey;
  originWeather?: WeatherCondition;
  destinationWeather?: WeatherCondition;
}

let segSeq = 0;
function segId(): string {
  segSeq += 1;
  return `seg-${segSeq}`;
}

function localLegToSegment(leg: LocalLeg, startIso: string, travelers: number): RouteSegment {
  const perPerson = leg.mode === 'transit' || leg.mode === 'airport-transfer';
  return {
    id: segId(),
    mode: leg.mode,
    title: leg.title,
    from: leg.from,
    to: leg.to,
    departureTime: startIso,
    arrivalTime: addMinutes(startIso, leg.durationMinutes),
    durationMinutes: leg.durationMinutes,
    distanceMiles: leg.distanceMiles,
    costUsd: perPerson ? leg.costUsd * travelers : leg.costUsd,
    provider: leg.provider,
    notes: leg.notes,
  };
}

function sumWalkingMinutes(segments: RouteSegment[]): number {
  return segments.filter((s) => s.mode === 'walk').reduce((a, s) => a + s.durationMinutes, 0);
}

function countTransfers(segments: RouteSegment[]): number {
  // A transfer is every vehicle change after the first ride (walking doesn't count).
  const rides = segments.filter((s) => s.mode !== 'walk' && s.mode !== 'wait');
  return Math.max(0, rides.length - 1);
}

function modeMix(segments: RouteSegment[]): TransportMode[] {
  const mix: TransportMode[] = [];
  for (const s of segments) {
    if (s.mode !== 'wait' && mix[mix.length - 1] !== s.mode) mix.push(s.mode);
  }
  return mix;
}

const MODE_STEP_TITLES: Partial<Record<TransportMode, string>> = {
  walk: 'Walk',
  transit: 'Ride transit',
  drive: 'Drive',
  rideshare: 'Ride',
  flight: 'Fly',
  train: 'Train',
  bus: 'Bus',
  'airport-transfer': 'Airport transfer',
};

function buildTimeline(
  segments: RouteSegment[],
  destinationLabel: string,
  extraCriticalNotes: Array<{ beforeSegmentIndex: number; step: TimelineStep }> = [],
): TimelineStep[] {
  const steps: TimelineStep[] = [];
  if (segments.length === 0) return steps;

  steps.push({
    id: 'step-leave',
    time: segments[0].departureTime,
    title: 'Leave home',
    subtitle: `Head to ${segments[0].to}`,
    mode: 'walk',
    emphasis: 'critical',
  });

  segments.forEach((s, i) => {
    for (const extra of extraCriticalNotes) {
      if (extra.beforeSegmentIndex === i) steps.push(extra.step);
    }
    steps.push({
      id: `step-${s.id}`,
      time: s.departureTime,
      title: s.title,
      subtitle: `${MODE_STEP_TITLES[s.mode] ?? 'Travel'} ${formatDuration(s.durationMinutes)} · arrive ${s.to} at ${formatTime(s.arrivalTime)}`,
      mode: s.mode,
      durationMinutes: s.durationMinutes,
      emphasis: s.mode === 'flight' || s.mode === 'train' || s.mode === 'bus' ? 'critical' : 'normal',
    });
  });

  const last = segments[segments.length - 1];
  steps.push({
    id: 'step-arrive',
    time: last.arrivalTime,
    title: `Arrive at ${destinationLabel}`,
    mode: 'walk',
    emphasis: 'critical',
  });
  return steps;
}

function buildPriceBreakdown(items: PriceLineItem[], totalDurationMinutes: number): PriceBreakdown {
  const incomplete = items.some((i) => i.amountUsd === undefined);
  const total = incomplete
    ? undefined
    : Math.round(items.reduce((a, i) => a + (i.amountUsd ?? 0), 0) * 100) / 100;
  return {
    items,
    totalUsd: total,
    // "Time cost" is informational only (valued at ~$25/hr), never in totals.
    timeCostUsd: Math.round((totalDurationMinutes / 60) * 25),
    currency: 'USD',
    incomplete,
  };
}

function weatherWarningsFor(
  ctx: BuildContext,
  opts: { walkingMinutes: number; usesFlight: boolean; usesRoad: boolean },
): RiskWarning[] {
  const warnings: RiskWarning[] = [];
  let n = 0;
  const push = (level: RiskWarning['level'], message: string) => {
    n += 1;
    warnings.push({ id: `wx-${n}`, level, category: 'weather', message });
  };

  for (const wx of [ctx.originWeather, ctx.destinationWeather]) {
    if (!wx) continue;
    const where = wx.locationLabel;
    if (opts.walkingMinutes >= 8 && wx.discomfortScore >= 0.6) {
      push(
        'medium',
        wx.kind === 'heat'
          ? `It is ${wx.tempF}°F in ${where} — walking with luggage may be uncomfortable.`
          : `${wx.summary} in ${where} — ${opts.walkingMinutes} min of walking will be unpleasant. Umbrella recommended.`,
      );
    }
    if (opts.usesFlight && wx.delayImpact >= 0.5) {
      push('high', `${wx.summary} in ${where} may increase airport delays.`);
    } else if (opts.usesFlight && wx.delayImpact >= 0.3) {
      push('medium', `${wx.summary} in ${where} could cause minor flight delays.`);
    }
    if (opts.usesRoad && wx.delayImpact >= 0.3) {
      push('medium', `Allow extra time — ${wx.summary.toLowerCase()} in ${where} slows traffic.`);
    }
  }
  // De-duplicate identical messages (origin/destination can share weather).
  const seen = new Set<string>();
  return warnings.filter((w) => (seen.has(w.message) ? false : (seen.add(w.message), true)));
}

/** Rideshare-vs-walk tradeoff for each meaningful walking segment. */
async function buildWalkAdvice(
  segments: RouteSegment[],
  ctx: BuildContext,
): Promise<WalkVsRideAdvice[]> {
  const advice: WalkVsRideAdvice[] = [];
  const bags = ctx.search.bags;
  const luggageBurden: WalkVsRideAdvice['luggageBurden'] =
    bags >= 2 ? 'heavy' : bags === 1 ? 'light' : 'none';

  for (const seg of segments) {
    if (seg.mode !== 'walk' || seg.durationMinutes < 8) continue;

    const wx = ctx.destinationWeather ?? ctx.originWeather;
    const distance = seg.distanceMiles ?? seg.durationMinutes / 20;
    const rideMinutes = Math.max(4, Math.round(seg.durationMinutes * 0.4));
    const est = await estimatePrimaryRide(distance, rideMinutes);
    const ride = est.ok ? est.data : undefined;

    const badWeather = (wx?.discomfortScore ?? 0) >= 0.6;
    const shouldRide =
      Boolean(ride) && (badWeather || (luggageBurden === 'heavy' && seg.durationMinutes >= 10));

    const timeSaved = ride ? seg.durationMinutes - (ride.rideMinutes + ride.etaMinutes) : undefined;
    const pieces: string[] = [
      `Walk: ${seg.durationMinutes} min, free${badWeather && wx ? `, but ${wx.summary.toLowerCase()}` : ''}.`,
    ];
    if (ride) {
      pieces.push(
        `${ride.provider}: $${ride.lowUsd}–$${ride.highUsd}${
          timeSaved && timeSaved > 0 ? `, saves ${timeSaved} min` : ''
        }.`,
      );
    }
    pieces.push(`Recommended: ${shouldRide ? ride?.provider ?? 'rideshare' : 'walk'}.`);
    if (!shouldRide && luggageBurden === 'heavy') {
      pieces.push('Short enough to manage with bags.');
    }

    advice.push({
      segmentId: seg.id,
      walkMinutes: seg.durationMinutes,
      walkDistanceMiles: distance,
      rideEstimate: ride
        ? { lowUsd: ride.lowUsd, highUsd: ride.highUsd, minutes: ride.rideMinutes, provider: ride.provider }
        : undefined,
      timeSavedMinutes: timeSaved,
      weatherSummary: wx?.summary,
      luggageBurden,
      recommendation: shouldRide ? 'ride' : 'walk',
      explanation: pieces.join(' '),
    });
  }
  return advice;
}

// ---------------------------------------------------------------------------
// Intercity corridors (NYC ↔ Boston / DC): train, flight, bus, drive
// ---------------------------------------------------------------------------

async function buildIntercityRoutes(ctx: BuildContext): Promise<RouteOption[]> {
  const [flights, trains, buses] = await Promise.all([
    searchFlights(ctx.corridor, {
      departureIso: ctx.search.departureTime,
      travelers: ctx.search.travelers,
    }),
    searchTrains(ctx.corridor),
    searchBuses(ctx.corridor),
  ]);

  const routes: RouteOption[] = [];

  if (trains.ok) {
    for (const train of trains.data) {
      const r = await buildLineHaulRoute(ctx, train, 'to-train', 'from-train', 20);
      if (r) routes.push(r);
    }
  }
  if (flights.ok) {
    for (const flight of flights.data) {
      const r = await buildFlightRoute(ctx, flight);
      if (r) routes.push(r);
    }
  }
  if (buses.ok) {
    for (const bus of buses.data) {
      const r = await buildLineHaulRoute(ctx, bus, 'to-bus', 'from-bus', 25);
      if (r) routes.push(r);
    }
  }

  const [drive, rental] = await Promise.all([
    buildDriveRoute(ctx, 'drive'),
    buildRentalCarRoute(ctx),
  ]);
  if (drive) routes.push(drive);
  if (rental) routes.push(rental);

  return routes;
}

/**
 * Rental car door-to-door: get to the pickup office (walk/transit),
 * pick up the car, drive (real road time via OSRM when reachable),
 * priced per day + fuel/tolls, with dated Kayak booking links.
 */
async function buildRentalCarRoute(ctx: BuildContext): Promise<RouteOption | undefined> {
  const { search } = ctx;
  const rentals = await searchRentalCars(
    ctx.corridor,
    search.origin.address,
    search.destination.address,
  );
  if (!rentals.ok || rentals.data.offers.length === 0) return undefined;

  // Best offer = shortest total access time, then price.
  const offers = [...rentals.data.offers].sort((a, b) => {
    const aAccess = a.accessLegs.reduce((s, l) => s + l.durationMinutes, 0);
    const bAccess = b.accessLegs.reduce((s, l) => s + l.durationMinutes, 0);
    return aAccess - bAccess || a.dailyRateUsd - b.dailyRateUsd;
  });
  const offer = offers[0];

  // The drive itself: live road routing when available, corridor mock otherwise.
  const mockDrive = await getLocalLegs(ctx.corridor, 'drive');
  const mockLeg = mockDrive.ok ? mockDrive.data.legs[0] : undefined;
  const driveMinutes = rentals.data.drive?.durationMinutes ?? mockLeg?.durationMinutes ?? 120;
  const driveMiles = rentals.data.drive?.distanceMiles ?? mockLeg?.distanceMiles ?? 80;
  const fuelTolls = Math.round(driveMiles * 0.22 + 12); // fuel ≈$0.16/mi + tolls

  const leaveTime = search.departureTime;
  const segments: RouteSegment[] = [];
  let cursor = leaveTime;
  for (const leg of offer.accessLegs) {
    const seg = localLegToSegment(leg, cursor, search.travelers);
    segments.push(seg);
    cursor = seg.arrivalTime;
  }
  segments.push({
    id: segId(),
    mode: 'wait',
    title: `Pick up car at ${offer.officeName}`,
    from: offer.officeAddress,
    to: offer.officeAddress,
    departureTime: cursor,
    arrivalTime: addMinutes(cursor, offer.pickupProcessMinutes),
    durationMinutes: offer.pickupProcessMinutes,
    costUsd: 0,
    notes: [offer.carClass],
  });
  cursor = addMinutes(cursor, offer.pickupProcessMinutes);
  segments.push({
    id: segId(),
    mode: 'drive',
    title: `Drive rental to ${search.destination.label ?? 'destination'}`,
    from: offer.officeName,
    to: search.destination.label ?? search.destination.address,
    departureTime: cursor,
    arrivalTime: addMinutes(cursor, driveMinutes),
    durationMinutes: driveMinutes,
    distanceMiles: driveMiles,
    costUsd: fuelTolls,
    provider: offer.company,
    notes: rentals.data.drive?.live
      ? [`Real road route: ${driveMiles} mi, ${formatDuration(driveMinutes)}`]
      : undefined,
  });
  cursor = addMinutes(cursor, driveMinutes);

  const items: PriceLineItem[] = [
    {
      label: `${offer.company} rental (1 day, ${offer.carClass.split('·')[0].trim()})`,
      amountUsd: offer.dailyRateUsd,
      kind: 'ticket',
      note: offer.notes[0],
    },
    { label: 'Fuel + tolls (est.)', amountUsd: fuelTolls, kind: 'fuel', hidden: true },
    ...offer.accessLegs
      .filter((l) => l.costUsd > 0)
      .map((l) => ({
        label: `${l.provider ?? 'Transit'} fare ×${search.travelers}`,
        amountUsd: l.costUsd * search.travelers,
        kind: 'transit' as const,
        hidden: true,
      })),
  ];

  const walkingMinutes = sumWalkingMinutes(segments);
  const warnings = weatherWarningsFor(ctx, { walkingMinutes, usesFlight: false, usesRoad: true });
  const wxDelay = Math.max(
    ctx.originWeather?.delayImpact ?? 0,
    ctx.destinationWeather?.delayImpact ?? 0,
  );

  return finalizeRoute(ctx, {
    id: `route-rental-${ctx.corridor}`,
    title: `Rent with ${offer.company}`,
    summary: `${offer.accessLegs.map((l) => (l.mode === 'walk' ? 'Walk' : 'Subway')).join(' → ')} → pick up car → drive`,
    segments,
    timeline: buildTimeline(segments, search.destination.label ?? 'destination'),
    items,
    links: [
      buildRentalCarLink(rentals.data.cityLabel, search.departureTime),
      buildGoogleMapsLink(search.origin.address, offer.officeAddress, 'transit'),
      buildAppleMapsLink(search.origin.address, offer.officeAddress, 'transit'),
      buildGoogleMapsLink(offer.officeAddress, search.destination.address, 'drive'),
    ],
    walkingMinutes,
    warnings,
    reliability: 78,
    comfort: 82,
    delayRisk: Math.min(0.9, 0.25 + wxDelay * 0.3),
    leaveTime,
    arrivalTime: cursor,
    totalDuration: minutesBetween(leaveTime, cursor),
    bufferMinutes: offer.pickupProcessMinutes,
    primaryMode: 'drive',
    backups: offers.slice(1, 3).map((alt) => ({
      id: `bk-rental-${alt.company.toLowerCase()}`,
      title: `${alt.company} — $${alt.dailyRateUsd}/day`,
      description: `${alt.officeName} (${alt.accessLegs.reduce((s, l) => s + l.durationMinutes, 0)} min away) · ${alt.carClass}`,
      mode: 'drive' as const,
      extraCostUsd: alt.dailyRateUsd - offer.dailyRateUsd,
    })),
  });
}

/** Chosen first/last-mile overrides coming from the trip builder. */
interface AccessOverrides {
  accessLegs?: LocalLeg[];
  egressLegs?: LocalLeg[];
  firstMileId?: string;
  lastMileId?: string;
}

/** Train or bus door-to-door: access legs → line haul → egress legs. */
async function buildLineHaulRoute(
  ctx: BuildContext,
  haul: LineHaulOption,
  accessFacet: string,
  egressFacet: string,
  stationBufferMinutes: number,
  overrides: AccessOverrides = {},
): Promise<RouteOption | undefined> {
  const { search } = ctx;
  const [accessDefault, egressDefault] = await Promise.all([
    overrides.accessLegs ? undefined : getLocalLegs(ctx.corridor, accessFacet),
    overrides.egressLegs ? undefined : getLocalLegs(ctx.corridor, egressFacet),
  ]);
  const accessLegs = overrides.accessLegs ?? (accessDefault?.ok ? accessDefault.data.legs : undefined);
  const egressLegs = overrides.egressLegs ?? (egressDefault?.ok ? egressDefault.data.legs : undefined);
  if (!accessLegs || !egressLegs) return undefined; // provider data unavailable → skip mode

  const access = { data: { legs: accessLegs } };
  const egress = { data: { legs: egressLegs } };

  const haulDeparture = addMinutes(search.departureTime, haul.departOffsetMinutes);

  // Work backwards from the departure: station buffer, then access legs.
  const accessDuration = access.data.legs.reduce((a, l) => a + l.durationMinutes, 0);
  const leaveTime = addMinutes(haulDeparture, -(stationBufferMinutes + accessDuration));

  const segments: RouteSegment[] = [];
  let cursor = leaveTime;
  for (const leg of access.data.legs) {
    const seg = localLegToSegment(leg, cursor, search.travelers);
    segments.push(seg);
    cursor = seg.arrivalTime;
  }

  const alreadyBooked = search.existingTicket?.mode === haul.mode;
  segments.push({
    id: segId(),
    mode: haul.mode,
    title: `${haul.provider} ${haul.serviceName}`,
    from: haul.fromStation,
    to: haul.toStation,
    departureTime: haulDeparture,
    arrivalTime: addMinutes(haulDeparture, haul.durationMinutes),
    durationMinutes: haul.durationMinutes,
    costUsd:
      alreadyBooked ? 0 : haul.farePerPersonUsd !== undefined ? haul.farePerPersonUsd * search.travelers : undefined,
    provider: haul.provider,
    vehicleId: haul.serviceName,
    notes: haul.notes,
  });
  cursor = addMinutes(haulDeparture, haul.durationMinutes);

  for (const leg of egress.data.legs) {
    const seg = localLegToSegment(leg, cursor, search.travelers);
    segments.push(seg);
    cursor = seg.arrivalTime;
  }

  // Prices --------------------------------------------------------------
  const items: PriceLineItem[] = [];
  if (alreadyBooked) {
    items.push({ label: `${haul.provider} ticket — already booked`, amountUsd: 0, kind: 'ticket' });
  } else {
    items.push({
      label: `${haul.provider} ticket ×${search.travelers}`,
      amountUsd:
        haul.farePerPersonUsd !== undefined ? haul.farePerPersonUsd * search.travelers : undefined,
      kind: 'ticket',
      note: haul.farePerPersonUsd === undefined ? 'Price unavailable from provider' : undefined,
    });
  }
  addLocalCostItems(items, [...access.data.legs, ...egress.data.legs], search.travelers);

  const timeline = buildTimeline(segments, search.destination.label ?? 'destination', [
    {
      beforeSegmentIndex: access.data.legs.length,
      step: {
        id: 'step-station-buffer',
        time: addMinutes(haulDeparture, -stationBufferMinutes),
        title: `Arrive at ${haul.fromStation}`,
        subtitle: `${stationBufferMinutes} min buffer before ${haul.mode === 'train' ? 'boarding' : 'departure'}`,
        mode: 'wait',
        emphasis: 'critical',
      },
    },
  ]);

  const walkingMinutes = sumWalkingMinutes(segments);
  const warnings = weatherWarningsFor(ctx, {
    walkingMinutes,
    usesFlight: false,
    usesRoad: haul.mode === 'bus',
  });
  if (haul.baseDelayRisk >= 0.3) {
    warnings.push({
      id: 'delay-haul',
      level: 'medium',
      category: 'delay',
      message: `${haul.provider} arrivals on this corridor vary with traffic.`,
    });
  }

  const cities = CORRIDOR_CITIES[ctx.corridor];
  const linkOpts = {
    originCity: cities?.origin,
    destCity: cities?.dest,
    departureIso: search.departureTime,
  };
  const links: BookingLink[] = [
    haul.mode === 'train'
      ? buildTrainBookingLink(haul.provider, haul.bookingUrl, linkOpts)
      : buildBusBookingLink(haul.provider, haul.bookingUrl, linkOpts),
    buildGoogleMapsLink(search.origin.address, haul.fromStation, 'transit'),
    buildAppleMapsLink(search.origin.address, haul.fromStation, 'transit'),
    buildTransitAppLink(search.origin.address, haul.fromStation),
  ];

  const totalDuration = minutesBetween(leaveTime, cursor);
  const wxDelay = Math.max(
    ctx.originWeather?.delayImpact ?? 0,
    ctx.destinationWeather?.delayImpact ?? 0,
  );

  return finalizeRoute(ctx, {
    id: `route-${haul.id}`,
    title: `${haul.provider} ${haul.mode === 'train' ? haul.serviceName.split(' ')[0] : ''}`.trim() || haul.provider,
    summary: summarize(segments),
    segments,
    timeline,
    items,
    links,
    walkingMinutes,
    warnings,
    reliability: haul.reliabilityScore,
    comfort: haul.comfortScore,
    delayRisk: Math.min(0.95, haul.baseDelayRisk + wxDelay * 0.3),
    leaveTime,
    arrivalTime: cursor,
    totalDuration,
    bufferMinutes: stationBufferMinutes,
    primaryMode: haul.mode,
    backups: lineHaulBackups(haul),
    builder: {
      corridor: ctx.corridor,
      haulId: haul.id,
      accessFacet,
      egressFacet,
      stationBufferMinutes,
      firstMileId: overrides.firstMileId,
      lastMileId: overrides.lastMileId,
    },
  });
}

function lineHaulBackups(haul: LineHaulOption): BackupPlan[] {
  if (haul.mode === 'train') {
    return [
      {
        id: `bk-${haul.id}-later`,
        title: 'Next train (~1h later)',
        description: `${haul.provider} runs roughly hourly on this corridor — unreserved fares can be changed.`,
        mode: 'train',
        extraMinutes: 60,
      },
      {
        id: `bk-${haul.id}-bus`,
        title: 'Bus alternative',
        description: 'If trains are disrupted, intercity buses leave from Midtown every 30–60 min.',
        mode: 'bus',
      },
      {
        id: `bk-${haul.id}-ride`,
        title: 'Rideshare to the station',
        description: 'Running late? An Uber to the station cuts 15–20 min off the subway leg.',
        mode: 'rideshare',
      },
    ];
  }
  return [
    {
      id: `bk-${haul.id}-later`,
      title: 'Later bus',
      description: `${haul.provider} usually has another departure within 1–2 hours.`,
      mode: 'bus',
      extraMinutes: 90,
    },
    {
      id: `bk-${haul.id}-train`,
      title: 'Upgrade to the train',
      description: 'If the bus is delayed or sold out, Amtrak covers the same corridor faster.',
      mode: 'train',
    },
  ];
}

/** Flight door-to-door with full airport intelligence. */
async function buildFlightRoute(
  ctx: BuildContext,
  flight: LineHaulOption,
  overrides: AccessOverrides = {},
): Promise<RouteOption | undefined> {
  const { search } = ctx;
  const [accessDefault, egressDefault] = await Promise.all([
    overrides.accessLegs ? undefined : getLocalLegs(ctx.corridor, 'to-airport'),
    overrides.egressLegs ? undefined : getLocalLegs(ctx.corridor, 'from-airport'),
  ]);
  const accessLegs = overrides.accessLegs ?? (accessDefault?.ok ? accessDefault.data.legs : undefined);
  const egressLegs = overrides.egressLegs ?? (egressDefault?.ok ? egressDefault.data.legs : undefined);
  if (!accessLegs || !egressLegs) return undefined;

  const access = { data: { legs: accessLegs } };
  const egress = { data: { legs: egressLegs } };

  const flightDeparture = addMinutes(search.departureTime, flight.departOffsetMinutes);
  const airportCode = flight.fromStation.match(/\(([A-Z]{3})\)/)?.[1] ?? 'LGA';
  const travelToAirport = access.data.legs.reduce((a, l) => a + l.durationMinutes, 0);

  const intelResult = await buildAirportIntel({
    airportCode,
    flightDepartureIso: flightDeparture,
    travelMinutesToAirport: travelToAirport,
    checkedBags: search.bags > 0,
  });
  // Airport intel is additive; fall back to a simple 90-min buffer if missing.
  const intel = intelResult.ok ? intelResult.data : undefined;
  const leaveTime = intel?.leaveHomeBy ?? addMinutes(flightDeparture, -(90 + travelToAirport));

  const segments: RouteSegment[] = [];
  let cursor = leaveTime;
  for (const leg of access.data.legs) {
    const seg = localLegToSegment(leg, cursor, search.travelers);
    segments.push(seg);
    cursor = seg.arrivalTime;
  }

  const airportArrivalActual = cursor;
  const airportWait = minutesBetween(cursor, flightDeparture);
  segments.push({
    id: segId(),
    mode: 'wait',
    title: `Security + boarding at ${airportCode}`,
    from: flight.fromStation,
    to: `Gate, ${flight.fromStation}`,
    departureTime: cursor,
    arrivalTime: flightDeparture,
    durationMinutes: airportWait,
    costUsd: 0,
    notes: intel
      ? [`TSA estimate: ${intel.tsaWaitMinutes.min}–${intel.tsaWaitMinutes.max} min`]
      : undefined,
  });

  const alreadyBooked = search.existingTicket?.mode === 'flight';
  segments.push({
    id: segId(),
    mode: 'flight',
    title: `${flight.provider} ${flight.serviceName}`,
    from: flight.fromStation,
    to: flight.toStation,
    departureTime: flightDeparture,
    arrivalTime: addMinutes(flightDeparture, flight.durationMinutes),
    durationMinutes: flight.durationMinutes,
    costUsd:
      alreadyBooked ? 0 : flight.farePerPersonUsd !== undefined ? flight.farePerPersonUsd * search.travelers : undefined,
    provider: flight.provider,
    vehicleId: flight.serviceName,
    notes: flight.notes,
  });
  cursor = addMinutes(flightDeparture, flight.durationMinutes);

  // Deplane + (optionally) bag claim before ground transport.
  const deplaneMinutes = search.bags > 0 ? 30 : 12;
  segments.push({
    id: segId(),
    mode: 'wait',
    title: search.bags > 0 ? 'Deplane + baggage claim' : 'Deplane',
    from: flight.toStation,
    to: `${flight.toStation} arrivals`,
    departureTime: cursor,
    arrivalTime: addMinutes(cursor, deplaneMinutes),
    durationMinutes: deplaneMinutes,
    costUsd: 0,
  });
  cursor = addMinutes(cursor, deplaneMinutes);

  for (const leg of egress.data.legs) {
    const seg = localLegToSegment(leg, cursor, search.travelers);
    segments.push(seg);
    cursor = seg.arrivalTime;
  }

  // Prices --------------------------------------------------------------
  const items: PriceLineItem[] = [];
  if (alreadyBooked) {
    items.push({ label: `${flight.provider} flight — already booked`, amountUsd: 0, kind: 'ticket' });
  } else {
    items.push({
      label: `${flight.provider} fare ×${search.travelers}`,
      amountUsd:
        flight.farePerPersonUsd !== undefined
          ? flight.farePerPersonUsd * search.travelers
          : undefined,
      kind: 'ticket',
      note: flight.farePerPersonUsd === undefined ? 'Price unavailable from provider' : undefined,
    });
  }
  if (search.bags > 0 && flight.bagFeeUsd > 0) {
    items.push({
      label: `Checked bag fee ×${search.bags}`,
      amountUsd: flight.bagFeeUsd * search.bags,
      kind: 'baggage',
      hidden: true,
    });
  }
  if (flight.seatFeeUsd && !alreadyBooked) {
    items.push({
      label: `Seat selection ×${search.travelers}`,
      amountUsd: flight.seatFeeUsd * search.travelers,
      kind: 'seat',
      hidden: true,
      note: 'Optional — skip to save',
    });
  }
  addLocalCostItems(items, [...access.data.legs, ...egress.data.legs], search.travelers, true);

  const timeline = buildTimeline(segments, search.destination.label ?? 'destination', [
    ...(intel
      ? [
          {
            beforeSegmentIndex: access.data.legs.length,
            step: {
              id: 'step-airport-arrive',
              // Actual arrival time (slightly ahead of the recommended target).
              time: airportArrivalActual,
              title: `Arrive at ${airportCode}`,
              subtitle: `TSA: ${intel.tsaWaitMinutes.min}–${intel.tsaWaitMinutes.max} min · boarding ${formatTime(intel.boardingTime)}`,
              mode: 'wait' as const,
              emphasis: 'critical' as const,
              warning: intel.baggageCheckCutoff
                ? `Bag check closes ${formatTime(intel.baggageCheckCutoff)}`
                : undefined,
            },
          },
        ]
      : []),
  ]);

  const walkingMinutes = sumWalkingMinutes(segments);
  const warnings = weatherWarningsFor(ctx, { walkingMinutes, usesFlight: true, usesRoad: false });
  if (search.bags > 0 && intel?.baggageCheckCutoff) {
    warnings.push({
      id: 'bag-cutoff',
      level: 'medium',
      category: 'cutoff',
      message: `Checked bags must be dropped by ${formatTime(intel.baggageCheckCutoff)}.`,
    });
  }

  const destCode = flight.toStation.match(/\(([A-Z]{3})\)/)?.[1] ?? 'BOS';
  const links: BookingLink[] = [
    buildFlightSearchLink(airportCode, destCode, flightDeparture),
    buildAirlineBookingLink(flight.provider, flight.bookingUrl),
    buildUberLink(search.origin.address, flight.fromStation),
    buildLyftLink(search.origin.address, flight.fromStation),
    buildGoogleMapsLink(search.origin.address, flight.fromStation, 'drive'),
    buildAppleMapsLink(search.origin.address, flight.fromStation, 'drive'),
  ];

  const wxDelay = Math.max(
    ctx.originWeather?.delayImpact ?? 0,
    ctx.destinationWeather?.delayImpact ?? 0,
  );

  return finalizeRoute(ctx, {
    id: `route-${flight.id}`,
    title: `Fly ${flight.provider}`,
    summary: summarize(segments),
    segments,
    timeline,
    items,
    links,
    walkingMinutes,
    warnings,
    reliability: flight.reliabilityScore,
    comfort: flight.comfortScore,
    delayRisk: Math.min(0.95, flight.baseDelayRisk + wxDelay * 0.5),
    leaveTime,
    arrivalTime: cursor,
    totalDuration: minutesBetween(leaveTime, cursor),
    bufferMinutes: intel ? minutesBetween(intel.recommendedArrivalTime, flightDeparture) : 90,
    primaryMode: 'flight',
    airportIntel: intel,
    builder: {
      corridor: ctx.corridor,
      haulId: flight.id,
      accessFacet: 'to-airport',
      egressFacet: 'from-airport',
      stationBufferMinutes: 0,
      firstMileId: overrides.firstMileId,
      lastMileId: overrides.lastMileId,
    },
    backups: [
      {
        id: 'bk-next-flight',
        title: 'Next shuttle flight (~1h later)',
        description: `${flight.provider} runs hourly on this corridor; same-day change fees may apply.`,
        mode: 'flight',
        extraMinutes: 60,
      },
      {
        id: 'bk-train-fallback',
        title: 'Fall back to Amtrak',
        description: 'If the flight cancels, trains depart roughly hourly from Moynihan Train Hall.',
        mode: 'train',
      },
    ],
  });
}

/** Driving route for intercity or local corridors. */
async function buildDriveRoute(ctx: BuildContext, facet: string): Promise<RouteOption | undefined> {
  const { search } = ctx;
  const drive = await getLocalLegs(ctx.corridor, facet);
  if (!drive.ok) return undefined;

  // Real road distance/time (OSRM) replaces the mock estimate when the
  // live routing API is reachable — especially important for the generic
  // corridor where we have no curated data.
  let legs = drive.data.legs;
  const live = await drivingRouteByAddress(search.origin.address, search.destination.address);
  if (live.ok && legs.length === 1) {
    legs = [
      {
        ...legs[0],
        durationMinutes: live.data.durationMinutes,
        distanceMiles: live.data.distanceMiles,
        costUsd: Math.round(live.data.distanceMiles * 0.22 + 10),
        notes: [
          `Real road route: ${live.data.distanceMiles} mi, ${formatDuration(live.data.durationMinutes)}`,
          ...(legs[0].notes ?? []),
        ],
      },
    ];
  }

  const leaveTime = search.departureTime;
  const segments: RouteSegment[] = [];
  let cursor = leaveTime;
  for (const leg of legs) {
    const seg = localLegToSegment(leg, cursor, search.travelers);
    segments.push(seg);
    cursor = seg.arrivalTime;
  }

  const items: PriceLineItem[] = legs.map((leg) => ({
    label: leg.notes?.find((n) => n.startsWith('~')) ?? `Fuel + tolls (${leg.title})`,
    amountUsd: leg.costUsd,
    kind: 'fuel' as const,
  }));

  const walkingMinutes = sumWalkingMinutes(segments);
  const warnings = weatherWarningsFor(ctx, { walkingMinutes, usesFlight: false, usesRoad: true });

  const wxDelay = Math.max(
    ctx.originWeather?.delayImpact ?? 0,
    ctx.destinationWeather?.delayImpact ?? 0,
  );

  return finalizeRoute(ctx, {
    id: `route-drive-${ctx.corridor}`,
    title: 'Drive',
    summary: summarize(segments),
    segments,
    timeline: buildTimeline(segments, search.destination.label ?? 'destination'),
    items,
    links: [
      buildGoogleMapsLink(search.origin.address, search.destination.address, 'drive'),
      buildAppleMapsLink(search.origin.address, search.destination.address, 'drive'),
    ],
    walkingMinutes,
    warnings,
    reliability: 72,
    comfort: 70,
    delayRisk: Math.min(0.9, 0.3 + wxDelay * 0.3),
    leaveTime,
    arrivalTime: cursor,
    totalDuration: minutesBetween(leaveTime, cursor),
    bufferMinutes: 0,
    primaryMode: 'drive',
    backups: [
      {
        id: 'bk-drive-later',
        title: 'Leave 30 min later',
        description: 'Driving is flexible — shift departure to dodge rush hour.',
        mode: 'drive',
        extraMinutes: 30,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Local corridors (Manhattan→JFK/EWR, Logan→downtown, generic)
// ---------------------------------------------------------------------------

async function buildLocalRoutes(ctx: BuildContext): Promise<RouteOption[]> {
  const routes: RouteOption[] = [];

  const facets: Array<{ facet: string; title: string; reliability: number; comfort: number; risk: number }> =
    ctx.corridor === 'nyc-jfk'
      ? [
          { facet: 'transit', title: 'LIRR + AirTrain', reliability: 88, comfort: 72, risk: 0.1 },
          { facet: 'subway', title: 'Subway + AirTrain', reliability: 80, comfort: 55, risk: 0.18 },
        ]
      : ctx.corridor === 'nyc-ewr'
        ? [{ facet: 'transit', title: 'NJ Transit + AirTrain', reliability: 82, comfort: 68, risk: 0.16 }]
        : ctx.corridor === 'bosairport-boston'
          ? [
              { facet: 'transit', title: 'Silver Line (free)', reliability: 84, comfort: 66, risk: 0.12 },
              { facet: 'blue-line', title: 'Blue Line via shuttle', reliability: 80, comfort: 60, risk: 0.15 },
            ]
          : [{ facet: 'transit', title: 'Public transit', reliability: 78, comfort: 62, risk: 0.18 }];

  for (const f of facets) {
    const route = await buildTransitChainRoute(ctx, f.facet, f.title, f.reliability, f.comfort, f.risk);
    if (route) routes.push(route);
  }

  // Airport hops keep the door-to-door rideshare option (a rental makes no
  // sense for a 30-minute airport run); the generic corridor gets a rental
  // car instead, including the legs to reach the pickup office.
  if (ctx.corridor === 'generic') {
    const rental = await buildRentalCarRoute(ctx);
    if (rental) routes.push(rental);
  } else {
    const rideshare = await buildRideshareRoute(ctx);
    if (rideshare) routes.push(rideshare);
  }

  const drive = await buildDriveRoute(ctx, 'drive');
  if (drive) routes.push(drive);

  return routes;
}

async function buildTransitChainRoute(
  ctx: BuildContext,
  facet: string,
  title: string,
  reliability: number,
  comfort: number,
  baseRisk: number,
): Promise<RouteOption | undefined> {
  const { search } = ctx;
  const result = await getLocalLegs(ctx.corridor, facet);
  if (!result.ok) return undefined;

  const leaveTime = search.departureTime;
  const segments: RouteSegment[] = [];
  let cursor = leaveTime;
  for (const leg of result.data.legs) {
    const seg = localLegToSegment(leg, cursor, search.travelers);
    segments.push(seg);
    cursor = seg.arrivalTime;
  }

  const items: PriceLineItem[] = result.data.legs
    .filter((l) => l.costUsd > 0)
    .map((l) => ({
      label: `${l.provider ?? 'Transit'} fare ×${search.travelers}`,
      amountUsd: l.costUsd * search.travelers,
      kind: 'transit' as const,
    }));
  if (items.length === 0) {
    items.push({ label: 'Free transit', amountUsd: 0, kind: 'transit' });
  }

  const walkingMinutes = sumWalkingMinutes(segments);
  const warnings = weatherWarningsFor(ctx, { walkingMinutes, usesFlight: false, usesRoad: false });
  if (search.bags >= 2) {
    warnings.push({
      id: 'bags-transit',
      level: 'medium',
      category: 'comfort',
      message: `${search.bags} bags on transit — expect stairs and crowding.`,
    });
  }

  return finalizeRoute(ctx, {
    id: `route-${ctx.corridor}-${facet}`,
    title,
    summary: summarize(segments),
    segments,
    timeline: buildTimeline(segments, search.destination.label ?? 'destination'),
    items,
    links: [
      buildTransitAppLink(search.origin.address, search.destination.address),
      buildGoogleMapsLink(search.origin.address, search.destination.address, 'transit'),
      buildAppleMapsLink(search.origin.address, search.destination.address, 'transit'),
    ],
    walkingMinutes,
    warnings,
    reliability,
    comfort,
    delayRisk: baseRisk,
    leaveTime,
    arrivalTime: cursor,
    totalDuration: minutesBetween(leaveTime, cursor),
    bufferMinutes: 10,
    primaryMode: 'transit',
    backups: [
      {
        id: 'bk-rideshare',
        title: 'Switch to Uber/Lyft',
        description: 'If trains are disrupted, a rideshare covers the same trip on demand.',
        mode: 'rideshare',
      },
    ],
  });
}

async function buildRideshareRoute(ctx: BuildContext): Promise<RouteOption | undefined> {
  const { search } = ctx;
  // Reuse the drive facet for distance/time, then price it as a rideshare.
  const drive = await getLocalLegs(ctx.corridor, 'drive');
  if (!drive.ok || drive.data.legs.length === 0) return undefined;
  const leg = drive.data.legs[0];

  const isAirport = /airport|jfk|ewr|terminal/i.test(search.destination.address + leg.to);
  const est = await estimateRide(leg.distanceMiles, leg.durationMinutes, { airport: isAirport });
  if (!est.ok) return undefined;
  const uber = est.data.find((e) => e.provider === 'Uber') ?? est.data[0];
  const alternatives = est.data.filter((e) => e.provider !== uber.provider);

  const leaveTime = search.departureTime;
  const pickupWait = uber.etaMinutes;
  const segments: RouteSegment[] = [
    {
      id: segId(),
      mode: 'rideshare',
      title: `${uber.provider} ${uber.product} to ${leg.to}`,
      from: search.origin.label ?? leg.from,
      to: leg.to,
      departureTime: addMinutes(leaveTime, pickupWait),
      arrivalTime: addMinutes(leaveTime, pickupWait + leg.durationMinutes),
      durationMinutes: leg.durationMinutes,
      distanceMiles: leg.distanceMiles,
      costUsd: (uber.lowUsd + uber.highUsd) / 2,
      provider: uber.provider,
      notes: [`Pickup in ~${pickupWait} min`, `Fare range $${uber.lowUsd}–$${uber.highUsd}`],
    },
  ];
  const arrival = segments[0].arrivalTime;

  const items: PriceLineItem[] = [
    {
      label: `${uber.provider} ${uber.product} (est. $${uber.lowUsd}–$${uber.highUsd})`,
      amountUsd: (uber.lowUsd + uber.highUsd) / 2,
      kind: 'rideshare',
    },
  ];

  const warnings = weatherWarningsFor(ctx, { walkingMinutes: 0, usesFlight: false, usesRoad: true });

  return finalizeRoute(ctx, {
    id: `route-${ctx.corridor}-rideshare`,
    title: `${uber.provider} door-to-door`,
    summary: `${uber.product} · no transfers · door to door`,
    segments,
    timeline: buildTimeline(segments, search.destination.label ?? 'destination'),
    items,
    links: [
      buildUberLink(search.origin.address, search.destination.address),
      buildLyftLink(search.origin.address, search.destination.address),
      buildGoogleMapsLink(search.origin.address, search.destination.address, 'drive'),
      buildAppleMapsLink(search.origin.address, search.destination.address, 'drive'),
    ],
    walkingMinutes: 0,
    warnings,
    reliability: 86,
    comfort: 88,
    delayRisk: 0.15,
    leaveTime,
    arrivalTime: arrival,
    totalDuration: minutesBetween(leaveTime, arrival),
    bufferMinutes: pickupWait,
    primaryMode: 'rideshare',
    backups: alternatives.slice(0, 3).map((alt) => ({
      id: `bk-${alt.provider.toLowerCase().replace(/\s+/g, '-')}`,
      title: `Compare with ${alt.provider}`,
      description: `${alt.provider} estimate: $${alt.lowUsd}–$${alt.highUsd} (~${alt.rideMinutes} min)${alt.note ? ` — ${alt.note}` : ''}.`,
      mode: 'rideshare' as const,
    })),
  });
}

// ---------------------------------------------------------------------------
// Finalization
// ---------------------------------------------------------------------------

interface DraftRoute {
  id: string;
  title: string;
  summary: string;
  segments: RouteSegment[];
  timeline: TimelineStep[];
  items: PriceLineItem[];
  links: BookingLink[];
  walkingMinutes: number;
  warnings: RiskWarning[];
  reliability: number;
  comfort: number;
  delayRisk: number;
  leaveTime: string;
  arrivalTime: string;
  totalDuration: number;
  bufferMinutes: number;
  primaryMode: TransportMode;
  airportIntel?: RouteOption['airportIntel'];
  backups: BackupPlan[];
  builder?: RouteOption['builder'];
}

async function finalizeRoute(ctx: BuildContext, draft: DraftRoute): Promise<RouteOption> {
  const walkAdvice = await buildWalkAdvice(draft.segments, ctx);
  const priceBreakdown = buildPriceBreakdown(draft.items, draft.totalDuration);
  const weatherWarnings = draft.warnings.filter((w) => w.category === 'weather');

  return {
    id: draft.id,
    title: draft.title,
    summary: draft.summary,
    modeMix: modeMix(draft.segments),
    primaryMode: draft.primaryMode,
    totalPriceUsd: priceBreakdown.totalUsd,
    totalDurationMinutes: draft.totalDuration,
    departureTime: draft.leaveTime,
    arrivalTime: draft.arrivalTime,
    walkingMinutes: draft.walkingMinutes,
    transferCount: countTransfers(draft.segments),
    reliabilityScore: draft.reliability,
    comfortScore: draft.comfort,
    delayRisk: draft.delayRisk,
    weatherWarnings,
    warnings: draft.warnings,
    priceBreakdown,
    segments: draft.segments,
    timeline: draft.timeline,
    bookingLinks: draft.links,
    airportIntel: draft.airportIntel,
    walkAdvice,
    recommendedLeaveTime: draft.leaveTime,
    arrivalBufferMinutes: draft.bufferMinutes,
    badges: [],
    backupPlans: draft.backups,
    builder: draft.builder,
  };
}

// ---------------------------------------------------------------------------
// Ticket selection: every departure for one chosen mode
// ---------------------------------------------------------------------------

export interface TicketOption {
  haul: LineHaulOption;
  departureTime: string; // ISO
  arrivalTime: string; // ISO
  farePerPersonUsd?: number;
  recommended: boolean;
  /** Why this one is recommended / notable. */
  note?: string;
}

/**
 * Registry of expanded ticket instances so access-leg rebuilds can find
 * hauls that aren't in the base catalogs.
 */
const ticketRegistry = new Map<string, LineHaulOption>();

/**
 * Expand each base service into departures across the day. Deterministic:
 * same corridor + date always yields the same board.
 */
function expandDepartures(base: LineHaulOption): LineHaulOption[] {
  const spacing = base.mode === 'flight' ? 120 : base.mode === 'bus' ? 150 : 60;
  const count = base.mode === 'flight' ? 3 : 4;
  const out: LineHaulOption[] = [];
  for (let k = 0; k < count; k++) {
    const offset = base.departOffsetMinutes + (k - 1) * spacing;
    if (offset < 30) continue; // must leave enough time to reach the station
    // Fares swing with demand: peak-ish departures cost more (deterministic).
    const swing = 1 + ((k * 7 + base.id.length) % 5) * 0.06 - 0.12;
    const fare =
      base.farePerPersonUsd !== undefined
        ? Math.round(base.farePerPersonUsd * swing)
        : undefined;
    const serviceNumber = base.serviceName.replace(/\d+$/, (n) => String(Number(n) + k * 2));
    const instance: LineHaulOption = {
      ...base,
      id: `${base.id}-dep${k}`,
      serviceName: serviceNumber,
      departOffsetMinutes: offset,
      farePerPersonUsd: fare,
    };
    ticketRegistry.set(instance.id, instance);
    out.push(instance);
  }
  return out;
}

/**
 * All bookable tickets for one mode — shown after the user picks how they
 * want to travel. Sorted with the recommended option first.
 */
export async function getTicketsForMode(
  corridor: CorridorKey,
  mode: 'flight' | 'train' | 'bus',
  search: TripSearch,
): Promise<ServiceResult<TicketOption[]>> {
  const result =
    mode === 'flight'
      ? await searchFlights(corridor, { departureIso: search.departureTime, travelers: search.travelers })
      : mode === 'train'
        ? await searchTrains(corridor)
        : await searchBuses(corridor);
  if (!result.ok) return result;
  if (result.data.length === 0) {
    return { ok: false, error: `No ${mode} service on this route.`, code: 'NOT_FOUND' };
  }

  const instances = result.data.flatMap((base) => expandDepartures(base));
  const tickets: TicketOption[] = instances.map((haul) => {
    const dep = addMinutes(search.departureTime, haul.departOffsetMinutes);
    return {
      haul,
      departureTime: dep,
      arrivalTime: addMinutes(dep, haul.durationMinutes),
      farePerPersonUsd: haul.farePerPersonUsd,
      recommended: false,
    };
  });

  // Recommended = best blend of price, speed, and closeness to the
  // requested departure time.
  const fares = tickets.map((t) => t.farePerPersonUsd).filter((f): f is number => f !== undefined);
  const minFare = Math.min(...fares);
  const maxFare = Math.max(...fares);
  const durations = tickets.map((t) => t.haul.durationMinutes);
  const minDur = Math.min(...durations);
  const maxDur = Math.max(...durations);
  let best: { ticket: TicketOption; score: number } | undefined;
  for (const t of tickets) {
    const fareScore =
      t.farePerPersonUsd === undefined || maxFare === minFare
        ? 0.5
        : 1 - (t.farePerPersonUsd - minFare) / (maxFare - minFare);
    const durScore =
      maxDur === minDur ? 0.5 : 1 - (t.haul.durationMinutes - minDur) / (maxDur - minDur);
    const offsetPenalty = Math.min(1, Math.abs(t.haul.departOffsetMinutes - 90) / 300);
    const score = fareScore * 0.4 + durScore * 0.35 + (1 - offsetPenalty) * 0.25;
    if (!best || score > best.score) best = { ticket: t, score };
  }
  if (best) {
    best.ticket.recommended = true;
    best.ticket.note = 'Best mix of price, speed, and timing for your departure';
  }

  tickets.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime();
  });
  return { ok: true, data: tickets };
}

// ---------------------------------------------------------------------------
// Mode statistics: cheapest / priciest / average — price and speed
// ---------------------------------------------------------------------------

export interface ModeStats {
  price?: { min: number; max: number; avg: number };
  durationMinutes: { min: number; max: number; avg: number };
  optionCount: number;
}

/** Stats across a set of route options (drive/rental/transit groups). */
export function statsFromRoutes(routes: RouteOption[]): ModeStats {
  const prices = routes.map((r) => r.totalPriceUsd).filter((p): p is number => p !== undefined);
  const durations = routes.map((r) => r.totalDurationMinutes);
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return {
    price:
      prices.length > 0
        ? { min: Math.min(...prices), max: Math.max(...prices), avg: avg(prices) }
        : undefined,
    durationMinutes: {
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: avg(durations),
    },
    optionCount: routes.length,
  };
}

/** Stats across a ticket board (fare per person + door-to-door time). */
export function statsFromTickets(tickets: TicketOption[], accessOverheadMinutes: number): ModeStats {
  const fares = tickets.map((t) => t.farePerPersonUsd).filter((f): f is number => f !== undefined);
  const durations = tickets.map((t) => t.haul.durationMinutes + accessOverheadMinutes);
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return {
    price:
      fares.length > 0
        ? { min: Math.min(...fares), max: Math.max(...fares), avg: avg(fares) }
        : undefined,
    durationMinutes: {
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: avg(durations),
    },
    optionCount: tickets.length,
  };
}

// ---------------------------------------------------------------------------
// Build the full door-to-door plan for one chosen ticket
// ---------------------------------------------------------------------------

export async function buildRouteForTicket(
  search: TripSearch,
  corridor: CorridorKey,
  ticket: TicketOption,
  firstMile?: AccessOption,
  lastMile?: AccessOption,
): Promise<ServiceResult<RouteOption>> {
  const originKey = detectCityKey(search.origin.address);
  const destKey = detectCityKey(search.destination.address);
  const [originWx, destWx] = await Promise.all([
    getWeather(WEATHER_CITY[originKey], search.departureTime),
    getWeather(WEATHER_CITY[destKey], search.departureTime),
  ]);
  const ctx: BuildContext = {
    search,
    corridor,
    originWeather: originWx.ok ? originWx.data : undefined,
    destinationWeather: destWx.ok ? destWx.data : undefined,
  };
  const overrides: AccessOverrides = {
    accessLegs: firstMile?.legs,
    egressLegs: lastMile?.legs,
    firstMileId: firstMile?.id,
    lastMileId: lastMile?.id,
  };
  const haul = ticket.haul;
  const route =
    haul.mode === 'flight'
      ? await buildFlightRoute(ctx, haul, overrides)
      : haul.mode === 'train'
        ? await buildLineHaulRoute(ctx, haul, 'to-train', 'from-train', 20, overrides)
        : await buildLineHaulRoute(ctx, haul, 'to-bus', 'from-bus', 25, overrides);
  if (!route) {
    return { ok: false, error: 'Could not build a plan for this ticket.', code: 'UNAVAILABLE' };
  }
  return { ok: true, data: route };
}

// ---------------------------------------------------------------------------
// Trip-builder rebuild: swap first/last-mile choices and regenerate the plan
// ---------------------------------------------------------------------------

/**
 * Rebuild a line-haul route with the user's chosen first/last-mile access
 * options (from accessService). Keeps the route id, badges, and score so
 * the rest of the app treats it as the same option.
 */
export async function rebuildRouteWithAccess(
  search: TripSearch,
  route: RouteOption,
  firstMile?: AccessOption,
  lastMile?: AccessOption,
): Promise<ServiceResult<RouteOption>> {
  const meta = route.builder;
  if (!meta) {
    return { ok: false, error: 'This route has no configurable access legs.', code: 'NOT_FOUND' };
  }
  const corridor = meta.corridor as CorridorKey;

  const [flights, trains, buses] = await Promise.all([
    searchFlights(corridor),
    searchTrains(corridor),
    searchBuses(corridor),
  ]);
  const hauls: LineHaulOption[] = [
    ...(flights.ok ? flights.data : []),
    ...(trains.ok ? trains.data : []),
    ...(buses.ok ? buses.data : []),
  ];
  // Expanded ticket instances live in the registry, not the base catalogs.
  const haul = ticketRegistry.get(meta.haulId) ?? hauls.find((h) => h.id === meta.haulId);
  if (!haul) {
    return { ok: false, error: 'The selected service is no longer available.', code: 'NOT_FOUND' };
  }

  const originKey = detectCityKey(search.origin.address);
  const destKey = detectCityKey(search.destination.address);
  const [originWx, destWx] = await Promise.all([
    getWeather(WEATHER_CITY[originKey], search.departureTime),
    getWeather(WEATHER_CITY[destKey], search.departureTime),
  ]);
  const ctx: BuildContext = {
    search,
    corridor,
    originWeather: originWx.ok ? originWx.data : undefined,
    destinationWeather: destWx.ok ? destWx.data : undefined,
  };

  const overrides: AccessOverrides = {
    accessLegs: firstMile?.legs,
    egressLegs: lastMile?.legs,
    firstMileId: firstMile?.id,
    lastMileId: lastMile?.id,
  };

  const rebuilt =
    haul.mode === 'flight'
      ? await buildFlightRoute(ctx, haul, overrides)
      : await buildLineHaulRoute(
          ctx,
          haul,
          meta.accessFacet,
          meta.egressFacet,
          meta.stationBufferMinutes,
          overrides,
        );

  if (!rebuilt) {
    return { ok: false, error: 'Could not rebuild this route.', code: 'UNAVAILABLE' };
  }

  // Preserve identity so the results list and saved trips keep working.
  rebuilt.id = route.id;
  rebuilt.badges = route.badges;
  rebuilt.score = route.score;
  return { ok: true, data: rebuilt };
}

function addLocalCostItems(
  items: PriceLineItem[],
  legs: LocalLeg[],
  travelers: number,
  ridesAreHiddenCosts = false,
): void {
  for (const leg of legs) {
    if (leg.costUsd <= 0) continue;
    if (leg.mode === 'transit' || leg.mode === 'airport-transfer') {
      items.push({
        label: `${leg.provider ?? 'Transit'} fare ×${travelers}`,
        amountUsd: leg.costUsd * travelers,
        kind: 'transit',
        hidden: ridesAreHiddenCosts,
      });
    } else if (leg.mode === 'drive') {
      items.push({
        label: leg.provider ? `${leg.provider} to ${leg.to}` : leg.title,
        amountUsd: leg.costUsd,
        kind: leg.provider ? 'rideshare' : 'fuel',
        hidden: ridesAreHiddenCosts,
      });
    }
  }
}

function summarize(segments: RouteSegment[]): string {
  const names: Partial<Record<TransportMode, string>> = {
    walk: 'Walk',
    transit: 'Subway',
    train: 'Train',
    bus: 'Bus',
    flight: 'Flight',
    drive: 'Drive',
    rideshare: 'Uber',
    'airport-transfer': 'AirTrain',
  };
  return modeMix(segments)
    .map((m) => names[m])
    .filter(Boolean)
    .join(' → ');
}
