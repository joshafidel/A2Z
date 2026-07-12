/**
 * Chat trip-curation parser, onboarding profile fields, and the return
 * flight's timeline items.
 */

import { buildManualTrip } from '../src/services/manualTripService';
import { DEFAULT_PROFILE, sanitizeProfile } from '../src/services/preferencesService';
import { deriveLivingTimeline } from '../src/services/timelineService';
import {
  buildReply,
  EMPTY_REQUEST,
  extractRequestWithRules,
  mergeRequest,
  missingFields,
  parseDatePhrase,
} from '../src/services/tripChatService';
import type { ManualTripDetails } from '../src/types';

// Fixed "now": Friday, July 10 2026 (local time).
const NOW = new Date(2026, 6, 10, 9, 0, 0);

describe('chat rules parser', () => {
  it('parses a full request in one message', () => {
    const f = extractRequestWithRules(
      'I need to get from New York to Boston next Friday morning, cheap, with 1 bag and a hotel for 2 people',
      NOW,
    );
    expect(f.originCity).toBe('New York');
    expect(f.destinationCity).toBe('Boston');
    expect(f.dateIso).toBe('2026-07-17'); // the Friday after the 10th
    expect(f.timeOfDay).toBe('morning');
    expect(f.preference).toBe('cheapest');
    expect(f.bags).toBe(1);
    expect(f.travelers).toBe(2);
    expect(f.wantsHotel).toBe(true);
  });

  it('understands aliases, airport codes, and "to X" with one city', () => {
    expect(extractRequestWithRules('get me to vegas tomorrow', NOW)).toMatchObject({
      destinationCity: 'Las Vegas',
      dateIso: '2026-07-11',
    });
    expect(extractRequestWithRules('flying from JFK to LAX', NOW)).toMatchObject({
      originCity: 'New York',
      destinationCity: 'Los Angeles',
    });
    // lowercase words never match IATA codes ("was" ≠ "WAS")
    expect(extractRequestWithRules('i was hoping to go somewhere', NOW).destinationCity).toBeUndefined();
  });

  it('date phrases: today, tomorrow, weekday, bare month-day roll forward', () => {
    expect(parseDatePhrase('leaving today', NOW)).toBe('2026-07-10');
    expect(parseDatePhrase('day after tomorrow', NOW)).toBe('2026-07-12');
    expect(parseDatePhrase('on monday', NOW)).toBe('2026-07-13');
    expect(parseDatePhrase('friday', NOW)).toBe('2026-07-17'); // said on a Friday → next week
    expect(parseDatePhrase('around Jan 5', NOW)).toBe('2027-01-05'); // already passed → next year
    expect(parseDatePhrase('no date here', NOW)).toBeNull();
  });

  it('merges across turns and knows what is still missing', () => {
    let fields = mergeRequest({ ...EMPTY_REQUEST }, extractRequestWithRules('I need to get to Boston, carry-on only', NOW));
    expect(missingFields(fields)).toEqual(['origin', 'date']); // destination already known
    expect(missingFields(fields, 'New York')).toEqual(['date']); // home city fills origin
    fields = mergeRequest(fields, extractRequestWithRules('leaving tomorrow', NOW));
    expect(missingFields(fields, 'New York')).toEqual([]);
    expect(fields.bags).toBe(0);
    const reply = buildReply(fields, 'New York');
    expect(reply).toContain('New York to Boston');
    expect(reply).toContain('Curate my options');
  });

  it('asks exactly one follow-up question when something is missing', () => {
    const f = mergeRequest({ ...EMPTY_REQUEST }, extractRequestWithRules('somewhere warm, cheap', NOW));
    expect(buildReply(f)).toBe('Where are you headed?');
  });
});

describe('onboarding profile fields', () => {
  it('home city/airport round-trip through sanitize; bad codes dropped', () => {
    const p = sanitizeProfile({ ...DEFAULT_PROFILE, homeCity: ' New York ', homeAirportCode: 'jfk', onboardingDone: true });
    expect(p.homeCity).toBe('New York');
    expect(p.homeAirportCode).toBe('JFK');
    expect(p.onboardingDone).toBe(true);
    expect(sanitizeProfile({ homeAirportCode: 'NEWARK' }).homeAirportCode).toBeUndefined();
    expect(sanitizeProfile({}).onboardingDone).toBe(false); // first open → questions run
  });

  it('airport ranking keeps only valid codes in order; bag habit + comfort survive', () => {
    const p = sanitizeProfile({
      airportRanking: ['lga', 'JFK', 'Newark??', 'ewr'],
      bagHabit: 'always',
      transportationPriority: 'comfort',
    });
    expect(p.airportRanking).toEqual(['LGA', 'JFK', 'EWR']);
    expect(p.bagHabit).toBe('always');
    expect(p.transportationPriority).toBe('comfort');
    expect(sanitizeProfile({ bagHabit: 'huge' }).bagHabit).toBeUndefined();
  });
});

describe('comfort priority in transport comparison', () => {
  it('comfort priority can pick the comfortable ride over the cheap transit', async () => {
    const { compareTransportOptions } = await import('../src/services/transportOptionsService');
    const options = [
      { id: 'r', tripId: 't', kind: 'rideshare' as const, providerName: 'Uber', durationMinutes: 30, priceUsd: 60 },
      { id: 't', tripId: 't', kind: 'public-transit' as const, providerName: 'Subway', durationMinutes: 45, priceUsd: 3 },
    ];
    expect(compareTransportOptions(options, 'cheapest').recommendedId).toBe('t');
    expect(compareTransportOptions(options, 'comfort').recommendedId).toBe('r');
  });
});

describe('round-trip search fields', () => {
  it('TripSearch carries roundTrip + returnDate through a manual save', async () => {
    const { upsertTrip } = await import('../src/services/storageService');
    const trip = buildManualTrip(
      {
        name: 'x', purpose: 'other', originCity: 'New York', destinationCity: 'Boston',
        isInternational: false, checkedBag: false, hasTsaPrecheck: false, hasClear: false,
        startsAt: '2026-08-01T13:00:00.000Z',
        departure: { startingLocation: 'Home', estimatedTravelMinutes: 30 },
      },
      DEFAULT_PROFILE,
      'trip-round',
    );
    trip.search.roundTrip = true;
    trip.search.returnDate = '2026-08-04';
    await upsertTrip(trip);
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem('@a2z/saved-trips');
    const stored = JSON.parse(raw!)[0];
    expect(stored.search.roundTrip).toBe(true);
    expect(stored.search.returnDate).toBe('2026-08-04');
  });
});

describe('return flight timeline', () => {
  const details: ManualTripDetails = {
    name: 'Boston + back',
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
    endsAt: '2026-08-03T21:30:00.000Z',
    flight: { airlineName: 'Delta', flightNumber: 'DL 1232', scheduledDepartureAt: '2026-08-01T18:05:00.000Z', status: 'scheduled' },
    returnFlight: { airlineName: 'Delta', flightNumber: 'DL 1233', scheduledDepartureAt: '2026-08-03T21:30:00.000Z', status: 'scheduled' },
    departure: { startingLocation: 'Home', estimatedTravelMinutes: 45 },
  };

  it('derives return check-in, bag drop, boarding, and departure with stable ids', () => {
    const trip = buildManualTrip(details, DEFAULT_PROFILE, 'trip-rt');
    const items = deriveLivingTimeline(trip);
    const ids = items.map((i) => i.id);
    expect(ids).toContain('trip-rt:ret-checkin');
    expect(ids).toContain('trip-rt:ret-bagdrop'); // checked bag
    expect(ids).toContain('trip-rt:ret-boarding');
    expect(ids).toContain('trip-rt:ret-depart');
    const retDepart = items.find((i) => i.id === 'trip-rt:ret-depart')!;
    expect(retDepart.time).toBe('2026-08-03T21:30:00.000Z');
    expect(retDepart.title).toContain('DL 1233');
    // Still chronological and duplicate-free.
    const times = items.map((i) => new Date(i.time).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('skips return items entirely when no return flight was entered', () => {
    const oneWay = { ...details, returnFlight: undefined };
    const trip = buildManualTrip(oneWay, DEFAULT_PROFILE, 'trip-ow');
    expect(deriveLivingTimeline(trip).map((i) => i.id).join(' ')).not.toContain('ret-');
  });
});
