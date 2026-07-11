/**
 * Manual trips — the Create Trip form's engine.
 *
 * The user enters everything themselves (there is no live reservation
 * feed), and this service turns those fields into a SavedTrip whose
 * synthesized route plugs into every existing surface: the living
 * timeline, the departure engine, packing, approvals. Editing rebuilds
 * the route and records honest "what changed" sentences with old and new
 * values; nothing here is ever labeled live.
 */

import {
  describeDepartureChange,
  recommendDeparture,
  type DepartureRecommendationOutput,
} from './departureService';
import type { TravelerProfile } from './preferencesService';
import { recordManualChange } from './tripMonitorService';
import { clearTimelineTracking } from './timelineService';
import * as storage from './storageService';
import type {
  ManualTripDetails,
  RouteOption,
  RouteSegment,
  SavedTrip,
  TimelineStep,
} from '../types';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// ---------------------------------------------------------------------------
// Validation — plain-English messages the form shows inline.
// ---------------------------------------------------------------------------

export function validateManualTrip(d: ManualTripDetails): string[] {
  const errors: string[] = [];
  if (!d.name.trim()) errors.push('Give the trip a name.');
  if (!d.originCity.trim()) errors.push('Enter the city you are leaving from.');
  if (!d.destinationCity.trim()) errors.push('Enter the destination city.');
  if (!d.startsAt || Number.isNaN(new Date(d.startsAt).getTime()))
    errors.push('Pick a departure date and time.');
  if (d.endsAt && Number.isNaN(new Date(d.endsAt).getTime()))
    errors.push('The end date is not a valid date.');
  if (d.endsAt && d.startsAt && new Date(d.endsAt) < new Date(d.startsAt))
    errors.push('The end date is before the departure date.');
  if (!d.departure.startingLocation.trim())
    errors.push('Enter where you will start from on travel day.');
  if (!Number.isFinite(d.departure.estimatedTravelMinutes) || d.departure.estimatedTravelMinutes <= 0)
    errors.push('Estimate the travel time to the airport in minutes (a number above 0).');
  if (d.originAirportCode && !/^[A-Za-z]{3}$/.test(d.originAirportCode))
    errors.push('Origin airport code should be 3 letters (like JFK).');
  if (d.destinationAirportCode && !/^[A-Za-z]{3}$/.test(d.destinationAirportCode))
    errors.push('Destination airport code should be 3 letters (like LHR).');
  if (d.flight && Number.isNaN(new Date(d.flight.scheduledDepartureAt).getTime()))
    errors.push('The flight departure time is not valid.');
  return errors;
}

// ---------------------------------------------------------------------------
// Departure recommendation from manual inputs + the traveler profile.
// ---------------------------------------------------------------------------

export function departureForManual(
  d: ManualTripDetails,
  profile: TravelerProfile,
): DepartureRecommendationOutput {
  const scheduled = d.flight?.scheduledDepartureAt ?? d.startsAt;
  const estimated = d.flight?.estimatedDepartureAt;
  return recommendDeparture({
    scheduledDepartureAt: new Date(scheduled),
    estimatedDepartureAt: estimated ? new Date(estimated) : null,
    routeDurationMinutes: d.departure.estimatedTravelMinutes,
    routeTrafficDurationMinutes: d.departure.currentTrafficMinutes ?? null,
    isInternational: d.isInternational,
    hasTsaPrecheck: d.hasTsaPrecheck,
    hasClear: d.hasClear,
    checksBag: d.checkedBag,
    routeConfidence: d.departure.currentTrafficMinutes != null ? 'medium' : 'low',
    baseLeadOverrideMinutes:
      d.departure.airportBufferMinutes ??
      (d.isInternational ? profile.internationalBufferMinutes : profile.domesticBufferMinutes),
    uncertaintyOverrideMinutes: profile.trafficUncertaintyMinutes,
  });
}

// ---------------------------------------------------------------------------
// Trip synthesis — a SavedTrip the rest of the app already understands.
// ---------------------------------------------------------------------------

export function buildManualTrip(
  d: ManualTripDetails,
  profile: TravelerProfile,
  existingId?: string,
): SavedTrip {
  const id = existingId ?? `trip-${Date.now()}`;
  const rec = departureForManual(d, profile);
  const flightDep = d.flight?.scheduledDepartureAt ?? d.startsAt;
  const flightArr =
    d.flight?.scheduledArrivalAt ??
    new Date(new Date(flightDep).getTime() + 3 * 60 * 60_000).toISOString();
  const leaveIso = rec.recommendedLeaveAt.toISOString();
  const airportIso = rec.targetAirportArrivalAt.toISOString();
  const originAirport = d.originAirportCode?.toUpperCase();
  const destAirport = d.destinationAirportCode?.toUpperCase();

  const timeline: TimelineStep[] = [
    {
      id: 'm-leave',
      time: leaveIso,
      title: `Leave ${d.departure.startingLocation}`,
      subtitle: `${d.departure.estimatedTravelMinutes} min to the airport (your estimate)`,
      mode: 'drive',
      durationMinutes: d.departure.estimatedTravelMinutes,
      emphasis: 'critical',
    },
    {
      id: 'm-airport',
      time: airportIso,
      title: `Arrive at ${originAirport ? `${originAirport} ` : 'the '}airport`,
      subtitle: `${rec.airportLeadTimeMinutes} min before departure`,
      mode: 'wait',
    },
    {
      id: 'm-depart',
      time: flightDep,
      title: d.flight
        ? `${d.flight.airlineName ?? 'Flight'} ${d.flight.flightNumber ?? ''} departs`.replace(/\s+/g, ' ').trim()
        : 'Scheduled departure',
      mode: 'flight',
    },
  ];
  if (d.flight?.scheduledArrivalAt) {
    timeline.push({
      id: 'm-arrive',
      time: d.flight.scheduledArrivalAt,
      title: `Arrive ${destAirport ?? d.destinationCity}`,
      mode: 'flight',
    });
  }

  const segments: RouteSegment[] = [
    {
      id: 'm-seg-access',
      mode: 'drive',
      title: `To the airport from ${d.departure.startingLocation}`,
      from: d.departure.startingLocation,
      to: originAirport ? `${d.originCity} (${originAirport})` : d.originCity,
      departureTime: leaveIso,
      arrivalTime: airportIso,
      durationMinutes: d.departure.estimatedTravelMinutes,
      notes: ['Travel time entered by you'],
    },
    {
      id: 'm-seg-flight',
      mode: 'flight',
      title: d.flight
        ? `${d.flight.airlineName ?? 'Flight'} ${d.flight.flightNumber ?? ''}`.replace(/\s+/g, ' ').trim()
        : `${d.originCity} → ${d.destinationCity}`,
      from: originAirport ? `${d.originCity} (${originAirport})` : d.originCity,
      to: destAirport ? `${d.destinationCity} (${destAirport})` : d.destinationCity,
      departureTime: flightDep,
      arrivalTime: flightArr,
      durationMinutes: Math.max(
        30,
        Math.round((new Date(flightArr).getTime() - new Date(flightDep).getTime()) / 60_000),
      ),
      provider: d.flight?.airlineName,
      vehicleId: d.flight?.flightNumber,
    },
  ];

  const totalMinutes = Math.max(
    60,
    Math.round((new Date(flightArr).getTime() - new Date(leaveIso).getTime()) / 60_000),
  );

  const route: RouteOption = {
    id: `manual-${id}`,
    title: d.name,
    summary: `${d.originCity} → ${d.destinationCity} · entered by you`,
    modeMix: ['drive', 'flight'],
    primaryMode: 'flight',
    totalPriceUsd: undefined,
    totalDurationMinutes: totalMinutes,
    departureTime: flightDep,
    arrivalTime: flightArr,
    walkingMinutes: 0,
    transferCount: 0,
    reliabilityScore: 80,
    comfortScore: 70,
    delayRisk: 0.2,
    weatherWarnings: [],
    warnings: [],
    priceBreakdown: { items: [], totalUsd: undefined, currency: 'USD', incomplete: true },
    segments,
    timeline,
    bookingLinks: d.lodging?.bookingUrl
      ? [
          {
            id: 'm-lodging-link',
            label: `Open ${d.lodging.propertyName} booking page`,
            provider: d.lodging.propertyName,
            webUrl: d.lodging.bookingUrl,
            kind: 'maps',
          },
        ]
      : [],
    airportIntel: undefined,
    walkAdvice: [],
    recommendedLeaveTime: leaveIso,
    arrivalBufferMinutes: rec.uncertaintyBufferMinutes,
    badges: [],
    backupPlans: [],
  };

  return {
    id,
    savedAt: new Date().toISOString(),
    search: {
      origin: { address: d.departure.startingLocation, label: d.originCity },
      destination: { address: d.destinationCity, label: d.destinationCity },
      departureTime: flightDep,
      travelers: 1,
      bags: d.checkedBag ? 1 : 0,
      preference: 'easiest',
    },
    route,
    manual: d,
  };
}

// ---------------------------------------------------------------------------
// Create / edit / duplicate — with honest change sentences on edit.
// ---------------------------------------------------------------------------

export async function createManualTrip(
  d: ManualTripDetails,
  profile: TravelerProfile,
): Promise<SavedTrip | undefined> {
  const trip = buildManualTrip(d, profile);
  const saved = await storage.upsertTrip(trip);
  return saved.ok ? saved.data : undefined;
}

/** Sentences describing what an edit changed — old value → new value. */
export function describeManualEdit(
  before: SavedTrip,
  after: SavedTrip,
  recBefore: DepartureRecommendationOutput,
  recAfter: DepartureRecommendationOutput,
): string[] {
  const messages: string[] = [];
  const b = before.manual;
  const a = after.manual;
  if (!b || !a) return messages;

  const bDep = b.flight?.estimatedDepartureAt ?? b.flight?.scheduledDepartureAt ?? b.startsAt;
  const aDep = a.flight?.estimatedDepartureAt ?? a.flight?.scheduledDepartureAt ?? a.startsAt;
  if (Math.abs(new Date(aDep).getTime() - new Date(bDep).getTime()) >= 5 * 60_000) {
    messages.push(`Departure changed from ${fmtTime(bDep)} to ${fmtTime(aDep)}.`);
  }
  if (b.flight?.gate !== a.flight?.gate && (b.flight?.gate || a.flight?.gate)) {
    messages.push(`Gate changed from ${b.flight?.gate ?? '—'} to ${a.flight?.gate ?? '—'}.`);
  }
  if (b.flight?.terminal !== a.flight?.terminal && (b.flight?.terminal || a.flight?.terminal)) {
    messages.push(`Terminal changed from ${b.flight?.terminal ?? '—'} to ${a.flight?.terminal ?? '—'}.`);
  }
  if (b.flight?.status !== a.flight?.status && a.flight) {
    messages.push(`You marked the flight ${a.flight.status}.`);
  }
  const bTravel = b.departure.currentTrafficMinutes ?? b.departure.estimatedTravelMinutes;
  const aTravel = a.departure.currentTrafficMinutes ?? a.departure.estimatedTravelMinutes;
  const leaveDelta = Math.round(
    (recAfter.recommendedLeaveAt.getTime() - recBefore.recommendedLeaveAt.getTime()) / 60_000,
  );
  if (Math.abs(leaveDelta) >= 5) {
    const why =
      aTravel !== bTravel
        ? `the estimated trip to the airport ${aTravel > bTravel ? 'increased' : 'decreased'} from ${bTravel} to ${aTravel} minutes`
        : 'your flight timing changed';
    messages.push(
      `Your recommended leave time moved from ${fmtTime(recBefore.recommendedLeaveAt.toISOString())} to ${fmtTime(recAfter.recommendedLeaveAt.toISOString())} because ${why}.`,
    );
  } else {
    const generic = describeDepartureChange(recBefore, recAfter);
    if (generic) messages.push(generic);
  }
  return messages;
}

/**
 * Rebuild an existing manual trip from edited details, persist it, and
 * append what-changed sentences. Returns the updated trip.
 */
export async function updateManualTrip(
  before: SavedTrip,
  d: ManualTripDetails,
  profile: TravelerProfile,
): Promise<SavedTrip | undefined> {
  if (!before.manual) return undefined;
  const recBefore = departureForManual(before.manual, profile);
  const after = buildManualTrip(d, profile, before.id);
  const recAfter = departureForManual(d, profile);
  const saved = await storage.upsertTrip({ ...after, savedAt: before.savedAt, demo: before.demo });
  if (!saved.ok) return undefined;
  for (const message of describeManualEdit(before, saved.data, recBefore, recAfter)) {
    await recordManualChange(before.id, message);
  }
  return saved.data;
}

/**
 * Copy any trip into a fresh, editable, user-owned trip. Demo labeling is
 * dropped on the copy (the copy is yours); the original is untouched.
 */
export async function duplicateTrip(trip: SavedTrip): Promise<SavedTrip | undefined> {
  const id = `trip-${Date.now()}`;
  const copy: SavedTrip = {
    ...trip,
    id,
    savedAt: new Date().toISOString(),
    demo: undefined,
    route: { ...trip.route, id: `${trip.route.id}-copy-${id}` },
    manual: trip.manual ? { ...trip.manual, name: `${trip.manual.name} (copy)` } : undefined,
  };
  const saved = await storage.upsertTrip(copy);
  return saved.ok ? saved.data : undefined;
}

/** Delete a trip plus its per-trip tracking state. */
export async function removeTripCompletely(tripId: string): Promise<void> {
  await storage.deleteTrip(tripId);
  await clearTimelineTracking(tripId);
}
