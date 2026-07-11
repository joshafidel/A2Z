/**
 * Travel-OS client brief tests: living-timeline derivation (stable IDs,
 * no duplicates, statuses, change tracking), the paste-import regex
 * extractor, approval state transitions, and notification coalescing.
 */

import {
  applyExpiry,
  canTransition,
  createApproval,
  decideApproval,
  listApprovals,
  type Approval,
} from '../src/services/approvalService';
import { extractWithRules } from '../src/services/importService';
import {
  unreadCount,
  upsertNotification,
  type AppNotification,
} from '../src/services/notificationCenterService';
import {
  assignStatuses,
  deriveLivingTimeline,
  headlineFor,
  withChangeTracking,
} from '../src/services/timelineService';
import type { SavedTrip } from '../src/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEP = '2026-08-01T13:00:00.000Z';
const trip: SavedTrip = {
  id: 'trip-1',
  savedAt: '2026-07-25T00:00:00.000Z',
  search: {
    origin: { address: 'New York, NY', label: 'Home' },
    destination: { address: 'Miami, FL', label: 'Miami' },
    departureTime: DEP,
    travelers: 1,
    bags: 1,
    preference: 'easiest',
  },
  route: {
    id: 'r1',
    title: 'Fly to Miami',
    summary: 'JFK → MIA',
    primaryMode: 'flight',
    departureTime: DEP,
    arrivalTime: '2026-08-01T20:30:00.000Z',
    recommendedLeaveTime: '2026-08-01T10:00:00.000Z',
    totalDurationMinutes: 450,
    totalPriceUsd: 250,
    priceBreakdown: { items: [], totalUsd: 250, partial: false },
    segments: [
      {
        id: 's1',
        mode: 'flight',
        title: 'Delta DL 1232',
        from: 'JFK International (JFK)',
        to: 'Miami International (MIA)',
        departureTime: '2026-08-01T13:30:00.000Z',
        arrivalTime: '2026-08-01T16:45:00.000Z',
        durationMinutes: 195,
        provider: 'Delta',
        vehicleId: 'DL 1232',
      },
    ],
    timeline: [
      {
        id: 't1',
        time: '2026-08-01T10:00:00.000Z',
        title: 'Leave home',
        mode: 'walk',
        emphasis: 'critical',
      },
      {
        id: 't2',
        time: '2026-08-01T13:30:00.000Z',
        title: 'Flight departs',
        mode: 'flight',
      },
    ],
    bookingLinks: [],
    warnings: [],
    backupPlans: [],
  } as unknown as SavedTrip['route'],
};

// ---------------------------------------------------------------------------

describe('living timeline derivation', () => {
  it('derives packing, check-in, bag-drop, boarding + route steps with stable ids', () => {
    const items = deriveLivingTimeline(trip);
    const ids = items.map((i) => i.id);
    expect(ids).toContain('trip-1:packing');
    expect(ids).toContain('trip-1:checkin');
    expect(ids).toContain('trip-1:bagdrop'); // bags: 1
    expect(ids).toContain('trip-1:boarding');
    expect(ids).toContain('trip-1:route:t1');
    // Chronological + unique.
    const times = items.map((i) => new Date(i.time).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is idempotent — deriving twice yields identical items, never duplicates', () => {
    expect(deriveLivingTimeline(trip)).toEqual(deriveLivingTimeline(trip));
  });

  it('skips bag-drop when traveling carry-on only', () => {
    const noBags = { ...trip, search: { ...trip.search, bags: 0 } };
    expect(deriveLivingTimeline(noBags).map((i) => i.id)).not.toContain('trip-1:bagdrop');
  });

  it('a ≥10-min flight estimate moves boarding and cites Flight status', () => {
    const items = deriveLivingTimeline(trip, { flightEstimatedIso: '2026-08-01T14:10:00.000Z' });
    const boarding = items.find((i) => i.id === 'trip-1:boarding')!;
    expect(boarding.time).toBe('2026-08-01T13:35:00.000Z'); // estimate -35min
    expect(boarding.source).toBe('Flight status');
    // Check-in stays anchored to the SCHEDULE.
    const checkin = items.find((i) => i.id === 'trip-1:checkin')!;
    expect(checkin.time).toBe('2026-07-31T13:30:00.000Z');
  });

  it('assigns completed / now / next / upcoming around the clock', () => {
    const items = deriveLivingTimeline(trip);
    const at = new Date('2026-08-01T10:30:00.000Z'); // after leaving home
    const statused = assignStatuses(items, at);
    const leave = statused.find((i) => i.id === 'trip-1:route:t1')!;
    expect(leave.status).toBe('now');
    expect(statused.filter((i) => i.status === 'next')).toHaveLength(1);
    expect(statused[0].status).toBe('completed'); // packing long past
    const { current } = headlineFor(statused);
    expect(current?.id).toBe('trip-1:route:t1');
  });

  it('flags moved items as changed with the previous time', async () => {
    const first = deriveLivingTimeline(trip);
    await withChangeTracking('trip-1', first);
    const moved = deriveLivingTimeline(trip, { flightEstimatedIso: '2026-08-01T14:10:00.000Z' });
    const tracked = await withChangeTracking('trip-1', moved);
    const boarding = tracked.find((i) => i.id === 'trip-1:boarding')!;
    expect(boarding.previousTime).toBe('2026-08-01T12:55:00.000Z'); // scheduled -35
    const statused = assignStatuses(tracked, new Date('2026-07-26T00:00:00.000Z'));
    expect(statused.find((i) => i.id === 'trip-1:boarding')!.status).toBe('changed');
  });
});

describe('paste-import regex extractor', () => {
  it('parses a Delta-style confirmation', () => {
    const r = extractWithRules(
      'Your Delta confirmation ABC123\nFlight DL 1232\nJFK to MIA\nDeparts Jul 25, 2026 1:30 PM',
    );
    expect(r.fields.flightNumber).toBe('DL 1232');
    expect(r.fields.airlineCode).toBe('DL');
    expect(r.fields.originAirportCode).toBe('JFK');
    expect(r.fields.destinationAirportCode).toBe('MIA');
    expect(r.fields.departureDate).toBe('2026-07-25');
    expect(r.fields.confirmationCode).toBe('ABC123');
  });

  it('parses a hotel confirmation with slash dates', () => {
    const r = extractWithRules(
      'Booking reference: XY99Z8\nGrand Hyatt Boston\nCheck-in 08/14/2026\nThank you for booking.',
    );
    expect(r.fields.hotelName).toContain('Grand Hyatt');
    expect(r.fields.departureDate).toBe('2026-08-14');
    expect(r.fields.confirmationCode).toBe('XY99Z8');
  });

  it('never invents: garbage text yields nulls, and guessed airports are low-confidence', () => {
    const junk = extractWithRules('hello there, see you next week at the party');
    expect(junk.fields.flightNumber).toBeNull();
    expect(junk.fields.originAirportCode).toBeNull();
    expect(junk.fields.confirmationCode).toBeNull();

    const unordered = extractWithRules('Airports on this trip: BOS and also LAX mentioned.');
    expect(unordered.confidence.originAirportCode).toBeLessThan(0.7); // flagged for review
  });
});

describe('approval state transitions', () => {
  it('only legal transitions pass', () => {
    expect(canTransition('pending', 'approved_handoff')).toBe(true);
    expect(canTransition('pending', 'rejected')).toBe(true);
    expect(canTransition('pending', 'expired')).toBe(true);
    expect(canTransition('approved_handoff', 'rejected')).toBe(false);
    expect(canTransition('rejected', 'approved_handoff')).toBe(false);
    expect(canTransition('expired', 'approved_handoff')).toBe(false);
  });

  it('expires overdue pending approvals, leaves decided ones alone', () => {
    const base: Approval = {
      id: 'a1',
      provider: 'Amtrak',
      title: 'Ticket',
      description: '',
      amountLabel: '$59 (estimate)',
      amountIsEstimate: true,
      handoffUrl: 'https://example.com',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00Z',
      expiresAt: '2026-01-02T00:00:00Z',
    };
    const out = applyExpiry(
      [base, { ...base, id: 'a2', status: 'rejected' }],
      new Date('2026-01-03T00:00:00Z'),
    );
    expect(out[0].status).toBe('expired');
    expect(out[1].status).toBe('rejected');
  });

  it('create → decide → immutable history (with audit)', async () => {
    const created = await createApproval({
      provider: 'Expedia',
      title: 'Flight DL 1232',
      description: 'Approving opens Expedia.',
      amountLabel: '$148 per person (estimate)',
      amountIsEstimate: true,
      handoffUrl: 'https://expedia.com',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(created.status).toBe('pending');
    const decided = await decideApproval(created.id, 'approved_handoff');
    expect(decided?.status).toBe('approved_handoff');
    // Second decision on a decided record is refused.
    expect(await decideApproval(created.id, 'rejected')).toBeUndefined();
    const all = await listApprovals();
    expect(all.find((a) => a.id === created.id)?.status).toBe('approved_handoff');
  });
});

describe('notification coalescing', () => {
  const incoming = (body: string): Omit<AppNotification, 'updatedAt' | 'read' | 'updates'> => ({
    id: 'flight:trip-1',
    tripId: 'trip-1',
    title: 'Flight update',
    body,
    severity: 'warning',
  });

  it('five delay tweaks become ONE row with an update count', () => {
    let list: AppNotification[] = [];
    for (const d of [15, 20, 25, 30, 37]) {
      list = upsertNotification(list, incoming(`Delayed ${d} minutes`));
    }
    expect(list).toHaveLength(1);
    expect(list[0].updates).toBe(5);
    expect(list[0].body).toBe('Delayed 37 minutes');
    expect(unreadCount(list)).toBe(1);
  });

  it('an identical repeat changes nothing (no fake unread)', () => {
    let list = upsertNotification([], incoming('Delayed 15 minutes'));
    list = list.map((n) => ({ ...n, read: true }));
    const after = upsertNotification(list, incoming('Delayed 15 minutes'));
    expect(after).toBe(list); // untouched
    expect(unreadCount(after)).toBe(0);
  });

  it('different topics stay separate rows', () => {
    let list = upsertNotification([], incoming('Delayed 15 minutes'));
    list = upsertNotification(list, { ...incoming('Line is long'), id: 'tsa:trip-1', title: 'Security' });
    expect(list).toHaveLength(2);
  });
});
