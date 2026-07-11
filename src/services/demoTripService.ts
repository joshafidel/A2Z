/**
 * Demo trip (Step 6): a complete, clearly-labeled NYC → Boston trip so an
 * empty app has something to explore. Built through the REAL planning
 * services (same code path as a user trip), then stamped `demo: true` —
 * every card that renders it shows the Demo data badge, and deleting it
 * removes its approvals/notifications/tracking too.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SavedTrip, TripSearch } from '../types';
import { audit, clearDemoApprovals, createApproval } from './approvalService';
import { getHotelRecommendations } from './hotelService';
import { clearDemoNotifications, pushNotification } from './notificationCenterService';
import { clearTimelineTracking } from './timelineService';
import { buildRouteForTicket, getTicketsForMode } from './tripService';

export const DEMO_TRIP_ID = 'demo-trip';
const TRIPS_KEY = '@a2z/saved-trips';

const DEMO_SEARCH: TripSearch = {
  origin: { address: '215 W 75th St, New York, NY', label: 'Home (Upper West Side)' },
  destination: { address: 'Downtown Boston, MA', label: 'Boston' },
  departureTime: new Date(Date.now() + 3 * 86_400_000).toISOString(), // 3 days out
  travelers: 1,
  bags: 1,
  preference: 'easiest',
};

/** Build and persist the demo trip. Returns it, or undefined on failure. */
export async function seedDemoTrip(): Promise<SavedTrip | undefined> {
  const board = await getTicketsForMode('nyc-boston', 'train', DEMO_SEARCH);
  if (!board.ok || board.data.length === 0) return undefined;
  const ticket = board.data.find((t) => t.recommended) ?? board.data[0];
  const built = await buildRouteForTicket(DEMO_SEARCH, 'nyc-boston', ticket);
  if (!built.ok) return undefined;
  const hotels = await getHotelRecommendations('boston', {
    destinationQuery: DEMO_SEARCH.destination.address,
    checkinIso: DEMO_SEARCH.departureTime,
  });

  const trip: SavedTrip = {
    id: DEMO_TRIP_ID,
    savedAt: new Date().toISOString(),
    search: DEMO_SEARCH,
    route: built.data,
    hotel: hotels.ok ? hotels.data[0] : undefined,
    demo: true,
  };

  try {
    const raw = await AsyncStorage.getItem(TRIPS_KEY);
    const trips = raw ? (JSON.parse(raw) as SavedTrip[]) : [];
    await AsyncStorage.setItem(
      TRIPS_KEY,
      JSON.stringify([trip, ...trips.filter((t) => t.id !== DEMO_TRIP_ID)]),
    );
  } catch {
    return undefined;
  }

  // One what-changed entry + one pending approval + a notification, all
  // demo-flagged so they vanish with the trip.
  await pushNotification({
    id: `demo-change:${DEMO_TRIP_ID}`,
    tripId: DEMO_TRIP_ID,
    title: 'Demo: departure moved 15 minutes',
    body: 'Demo data — your train now leaves 15 minutes later than first planned. The timeline shows the previous time.',
    severity: 'warning',
    demo: true,
  });
  await createApproval({
    tripId: DEMO_TRIP_ID,
    provider: 'Amtrak',
    title: `Demo: ${ticket.haul.provider} ${ticket.haul.serviceName} · New York → Boston`,
    description:
      'Demo data — approving opens amtrak.com to finish the purchase there. A2Z never completes purchases for you.',
    amountLabel:
      ticket.farePerPersonUsd !== undefined ? `$${ticket.farePerPersonUsd} per person (estimate)` : 'Estimate',
    amountIsEstimate: true,
    handoffUrl: 'https://www.amtrak.com/tickets/departure.html',
    expiresAt: DEMO_SEARCH.departureTime,
    demo: true,
  });
  await audit('system', 'demo.seeded', 'Demo trip created (New York → Boston) — all data labeled Demo');
  return trip;
}

/** Remove the demo trip and every demo-flagged record it created. */
export async function deleteDemoTrip(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(TRIPS_KEY);
    const trips = raw ? (JSON.parse(raw) as SavedTrip[]) : [];
    await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify(trips.filter((t) => t.id !== DEMO_TRIP_ID)));
  } catch {
    // best effort
  }
  await clearDemoApprovals();
  await clearDemoNotifications();
  await clearTimelineTracking(DEMO_TRIP_ID);
  await audit('user', 'demo.deleted', 'Demo trip and all demo records removed');
}
