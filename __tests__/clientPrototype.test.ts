/**
 * Client-prototype brief tests: traveler profile sanitizing, the extended
 * departure calculator, manual trip build/edit/duplicate, export/import
 * validation, timeline overrides, deterministic advice, manual transport
 * comparison, and the expected-conditions weather fallback.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { recommendDeparture } from '../src/services/departureService';
import {
  buildManualTrip,
  describeManualEdit,
  departureForManual,
  duplicateTrip,
  validateManualTrip,
} from '../src/services/manualTripService';
import { DEFAULT_PROFILE, sanitizeProfile } from '../src/services/preferencesService';
import {
  exportAllData,
  importAllData,
  upsertTrip,
  validateImportPayload,
} from '../src/services/storageService';
import {
  applyCompleted,
  applyOverrides,
  assignStatuses,
  deriveLivingTimeline,
} from '../src/services/timelineService';
import { decideAdvice, generateAdvice, getAdviceDecisions, restoreAdvice } from '../src/services/adviceService';
import { compareTransportOptions, type ManualTransportOption } from '../src/services/transportOptionsService';
import { conditionFromExpected } from '../src/services/weatherService';
import { generatePackingList } from '../src/services/packingService';
import type { ManualTripDetails } from '../src/types';

const PROFILE = { ...DEFAULT_PROFILE };

const DETAILS: ManualTripDetails = {
  name: 'Boston work trip',
  purpose: 'business',
  originCity: 'New York',
  originAirportCode: 'JFK',
  destinationCity: 'Boston',
  destinationAirportCode: 'BOS',
  isInternational: false,
  checkedBag: true,
  hasTsaPrecheck: false,
  hasClear: false,
  startsAt: '2026-08-01T18:05:00.000Z',
  endsAt: '2026-08-03T21:00:00.000Z',
  flight: {
    airlineName: 'Delta',
    flightNumber: 'DL 1232',
    scheduledDepartureAt: '2026-08-01T18:05:00.000Z',
    scheduledArrivalAt: '2026-08-01T19:30:00.000Z',
    status: 'scheduled',
  },
  lodging: {
    propertyName: 'Grand Hyatt Boston',
    checkInAt: '2026-08-02T02:00:00.000Z',
    checkOutAt: '2026-08-03T15:00:00.000Z',
  },
  departure: { startingLocation: 'Home', estimatedTravelMinutes: 45 },
};

beforeEach(() => AsyncStorage.clear());

// ---------------------------------------------------------------------------

describe('traveler profile sanitizing', () => {
  it('corrupt blobs fall back to defaults field by field', () => {
    const p = sanitizeProfile({ temperatureUnit: 'kelvin', domesticBufferMinutes: 'lots', hasClear: true });
    expect(p.temperatureUnit).toBe('fahrenheit');
    expect(p.domesticBufferMinutes).toBe(120);
    expect(p.hasClear).toBe(true);
  });

  it('clamps out-of-range numbers and non-objects', () => {
    expect(sanitizeProfile(null)).toEqual(DEFAULT_PROFILE);
    expect(sanitizeProfile({ domesticBufferMinutes: 10 }).domesticBufferMinutes).toBe(75);
    expect(sanitizeProfile({ trafficUncertaintyMinutes: 900 }).trafficUncertaintyMinutes).toBe(90);
  });
});

describe('departure calculator extensions', () => {
  const base = {
    scheduledDepartureAt: new Date('2026-08-01T18:00:00Z'),
    routeDurationMinutes: 30,
    isInternational: false,
    hasTsaPrecheck: false,
    hasClear: false,
    checksBag: false,
    routeConfidence: 'high' as const,
  };

  it('international lead time never drops below 120 minutes', () => {
    const out = recommendDeparture({
      ...base,
      isInternational: true,
      hasTsaPrecheck: true,
      hasClear: true,
      baseLeadOverrideMinutes: 120, // user set an aggressive buffer
    });
    expect(out.airportLeadTimeMinutes).toBeGreaterThanOrEqual(120);
  });

  it('the user buffer replaces the base lead time', () => {
    const out = recommendDeparture({ ...base, baseLeadOverrideMinutes: 150 });
    expect(out.airportLeadTimeMinutes).toBe(150);
  });

  it('the uncertainty override replaces the confidence buffer', () => {
    const out = recommendDeparture({ ...base, uncertaintyOverrideMinutes: 25 });
    expect(out.uncertaintyBufferMinutes).toBe(25);
  });
});

describe('manual trips', () => {
  it('validation catches every missing required field with plain English', () => {
    const errors = validateManualTrip({
      ...DETAILS,
      name: '',
      originCity: '',
      departure: { startingLocation: '', estimatedTravelMinutes: 0 },
    });
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(errors.join(' ')).toMatch(/name/i);
    expect(errors.join(' ')).toMatch(/travel time/i);
  });

  it('builds a SavedTrip whose route the whole app understands', () => {
    const trip = buildManualTrip(DETAILS, PROFILE, 'trip-fixed');
    expect(trip.id).toBe('trip-fixed');
    expect(trip.manual).toBe(DETAILS);
    expect(trip.search.bags).toBe(1); // checked bag
    expect(trip.route.segments.some((s) => s.mode === 'flight' && s.vehicleId === 'DL 1232')).toBe(true);
    // Leave time = departure - lead(120 base + 20 bag) - travel(45) - buffer(15)
    const rec = departureForManual(DETAILS, PROFILE);
    expect(trip.route.recommendedLeaveTime).toBe(rec.recommendedLeaveAt.toISOString());
    expect(rec.airportLeadTimeMinutes).toBe(140);
    // Timeline includes leaving, airport arrival, and the flight.
    const titles = trip.route.timeline.map((t) => t.title).join(' | ');
    expect(titles).toContain('Leave Home');
    expect(titles).toContain('Delta DL 1232 departs');
  });

  it('living timeline derives lodging check-in/out from manual details', () => {
    const trip = buildManualTrip(DETAILS, PROFILE, 'trip-fixed');
    const ids = deriveLivingTimeline(trip).map((i) => i.id);
    expect(ids).toContain('trip-fixed:lodging-checkin');
    expect(ids).toContain('trip-fixed:lodging-checkout');
    expect(ids).toContain('trip-fixed:bagdrop');
  });

  it('edits produce old→new sentences for departure and leave time', () => {
    const before = buildManualTrip(DETAILS, PROFILE, 'trip-fixed');
    const editedDetails: ManualTripDetails = {
      ...DETAILS,
      flight: { ...DETAILS.flight!, estimatedDepartureAt: '2026-08-01T18:42:00.000Z' },
      departure: { ...DETAILS.departure, estimatedTravelMinutes: 75 },
    };
    const after = buildManualTrip(editedDetails, PROFILE, 'trip-fixed');
    const messages = describeManualEdit(
      before,
      after,
      departureForManual(DETAILS, PROFILE),
      departureForManual(editedDetails, PROFILE),
    );
    expect(messages.some((s) => s.startsWith('Departure changed from'))).toBe(true);
    expect(messages.some((s) => s.includes('increased from 45 to 75 minutes'))).toBe(true);
  });

  it('duplicating gives a fresh id and drops the demo label', async () => {
    const original = { ...buildManualTrip(DETAILS, PROFILE, 'trip-fixed'), demo: true };
    await upsertTrip(original);
    const copy = await duplicateTrip(original);
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe(original.id);
    expect(copy!.demo).toBeUndefined();
    expect(copy!.manual?.name).toBe('Boston work trip (copy)');
  });
});

describe('export / import', () => {
  it('round-trips everything under @a2z keys', async () => {
    const trip = buildManualTrip(DETAILS, PROFILE, 'trip-fixed');
    await upsertTrip(trip);
    await AsyncStorage.setItem('@a2z/traveler-profile', JSON.stringify(PROFILE));
    const exported = await exportAllData();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    await AsyncStorage.clear();
    const imported = await importAllData(exported.data);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.data.trips).toBe(1);
    const raw = await AsyncStorage.getItem('@a2z/saved-trips');
    expect(JSON.parse(raw!)[0].id).toBe('trip-fixed');
  });

  it('rejects garbage, foreign documents, and corrupted trips', () => {
    expect(validateImportPayload('not json at all').ok).toBe(false);
    expect(validateImportPayload('{"hello":1}').ok).toBe(false);
    const corrupt = JSON.stringify({
      app: 'A2Z',
      version: 1,
      exportedAt: 'x',
      data: { '@a2z/saved-trips': JSON.stringify([{ notATrip: true }]) },
    });
    const result = validateImportPayload(corrupt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/missing required fields/);
  });
});

describe('timeline overrides', () => {
  it('removes hidden items, adds custom ones in order, and forces completed', () => {
    const trip = buildManualTrip(DETAILS, PROFILE, 'trip-fixed');
    const base = deriveLivingTimeline(trip);
    const overrides = {
      added: [
        { id: 'trip-fixed:custom:1', time: '2026-08-01T12:00:00.000Z', title: 'Charge power bank' },
      ],
      removed: ['trip-fixed:packing'],
      completed: ['trip-fixed:custom:1'],
    };
    const merged = applyOverrides(base, overrides);
    const ids = merged.map((i) => i.id);
    expect(ids).not.toContain('trip-fixed:packing');
    expect(ids).toContain('trip-fixed:custom:1');
    const times = merged.map((i) => new Date(i.time).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    const statused = applyCompleted(
      assignStatuses(merged, new Date('2026-07-01T00:00:00Z')),
      overrides,
    );
    expect(statused.find((i) => i.id === 'trip-fixed:custom:1')!.status).toBe('completed');
  });
});

describe('deterministic advice', () => {
  it('flags rain, international documents, and the hotel gap with stable ids', () => {
    const intl: ManualTripDetails = { ...DETAILS, isInternational: true };
    const trip = buildManualTrip(intl, PROFILE, 'trip-fixed');
    const advice = generateAdvice(trip, {
      weather: conditionFromExpected('rainy', 'Boston'),
      transportOptionCount: 0,
    });
    const ids = advice.map((a) => a.id);
    expect(ids).toContain('trip-fixed:advice:rain');
    expect(ids).toContain('trip-fixed:advice:intl-docs');
    expect(ids).toContain('trip-fixed:advice:hotel-gap');
    expect(ids).toContain('trip-fixed:advice:no-transport');
    // Regeneration yields identical ids — no duplicates possible.
    expect(generateAdvice(trip, { weather: conditionFromExpected('rainy', 'Boston'), transportOptionCount: 0 }).map((a) => a.id)).toEqual(ids);
  });

  it('dismiss hides, restore brings it back', async () => {
    await decideAdvice('trip-fixed:advice:rain', 'dismissed');
    expect((await getAdviceDecisions())['trip-fixed:advice:rain']).toBe('dismissed');
    await restoreAdvice('trip-fixed:advice:rain');
    expect((await getAdviceDecisions())['trip-fixed:advice:rain']).toBeUndefined();
  });
});

describe('manual transport comparison', () => {
  const options: ManualTransportOption[] = [
    { id: 'a', tripId: 't', kind: 'rideshare', providerName: 'Uber', durationMinutes: 28, priceUsd: 62 },
    { id: 'b', tripId: 't', kind: 'public-transit', providerName: 'Train', durationMinutes: 42, priceUsd: 20 },
    { id: 'c', tripId: 't', kind: 'drive', providerName: 'My car + parking', durationMinutes: 35, priceUsd: 48 },
  ];

  it('marks cheapest and fastest correctly', () => {
    const cmp = compareTransportOptions(options, 'balanced');
    expect(cmp.cheapestId).toBe('b');
    expect(cmp.fastestId).toBe('a');
  });

  it('weights by the user priority and explains why', () => {
    expect(compareTransportOptions(options, 'cheapest').recommendedId).toBe('b');
    expect(compareTransportOptions(options, 'fastest').recommendedId).toBe('a');
    const cmp = compareTransportOptions(options, 'cheapest');
    expect(cmp.explanation).toMatch(
      /Train is recommended because it is \$42 cheaper than Uber and only 14 min slower/,
    );
  });

  it('an option with no price scores mid-pack instead of winning by omission', () => {
    const withUnknown = [
      ...options,
      { id: 'd', tripId: 't', kind: 'other' as const, providerName: 'Mystery', durationMinutes: 20 },
    ];
    expect(compareTransportOptions(withUnknown, 'cheapest').recommendedId).toBe('b');
  });
});

describe('expected-conditions fallback feeds packing', () => {
  it('a rainy pick produces an umbrella suggestion without any network', async () => {
    const list = await generatePackingList({
      tripId: 't',
      destination: 'Boston',
      nights: 2,
      travelers: 1,
      checksBag: false,
      weather: conditionFromExpected('rainy', 'Boston'),
    });
    expect(list.generatedBy).toBe('rules');
    expect(list.items.some((i) => i.name.toLowerCase().includes('umbrella'))).toBe(true);
  });
});
