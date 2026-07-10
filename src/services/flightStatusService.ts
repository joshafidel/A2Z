/**
 * Real-time flight status via aviationstack (free tier: 100 req/month).
 *
 * REAL API: GET https://api.aviationstack.com/v1/flights
 *   ?access_key=${apiConfig.aviationstackApiKey}&flight_iata=DL1232
 *
 * Used by My Trip to alert the traveler when their flight is delayed,
 * cancelled, or gets a gate assignment. Without a key this returns
 * undefined and the UI simply shows no status card — no fake statuses.
 */

import { apiConfig, fetchWithTimeout, isLive } from './config';

export interface FlightStatus {
  flight: string; // "DL 1232"
  status: 'scheduled' | 'active' | 'landed' | 'cancelled' | 'incident' | 'diverted' | 'unknown';
  delayMinutes?: number;
  departureGate?: string;
  departureTerminal?: string;
  scheduledIso?: string;
  estimatedIso?: string;
  /** True when the traveler should act on this (delay ≥ 15 min, cancel…). */
  important: boolean;
  headline: string; // "DL 1232 delayed 45 min — new departure 4:45 PM"
}

const statusCache = new Map<string, { at: number; value: FlightStatus | undefined }>();
const TTL_MS = 5 * 60_000; // aviationstack free tier is rate-limited — cache 5 min

export async function getFlightStatus(flightNumber: string): Promise<FlightStatus | undefined> {
  if (!isLive('aviationstackApiKey')) return undefined;
  const iata = flightNumber.replace(/\s+/g, '').toUpperCase(); // "DL 1232" → "DL1232"
  const cached = statusCache.get(iata);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  try {
    const res = await fetchWithTimeout(
      `https://api.aviationstack.com/v1/flights?access_key=${apiConfig.aviationstackApiKey}&flight_iata=${iata}`,
      6000,
    );
    if (!res.ok) return undefined;
    const body = (await res.json()) as {
      data?: Array<{
        flight_status?: string;
        departure?: {
          gate?: string;
          terminal?: string;
          delay?: number;
          scheduled?: string;
          estimated?: string;
        };
      }>;
    };
    const row = body.data?.[0];
    if (!row) return undefined;

    const delay = row.departure?.delay ?? 0;
    const rawStatus = (row.flight_status ?? 'unknown') as FlightStatus['status'];
    const status: FlightStatus['status'] = [
      'scheduled',
      'active',
      'landed',
      'cancelled',
      'incident',
      'diverted',
    ].includes(rawStatus)
      ? rawStatus
      : 'unknown';
    const important = status === 'cancelled' || status === 'diverted' || status === 'incident' || delay >= 15;

    const est = row.departure?.estimated;
    const headline =
      status === 'cancelled'
        ? `${flightNumber} is CANCELLED — rebook now`
        : status === 'diverted'
          ? `${flightNumber} has been diverted`
          : delay >= 15
            ? `${flightNumber} delayed ${delay} min${est ? ` — new departure ${new Date(est).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`
            : `${flightNumber} on time${row.departure?.gate ? ` · Gate ${row.departure.gate}` : ''}`;

    const value: FlightStatus = {
      flight: flightNumber,
      status,
      delayMinutes: delay > 0 ? delay : undefined,
      departureGate: row.departure?.gate,
      departureTerminal: row.departure?.terminal,
      scheduledIso: row.departure?.scheduled,
      estimatedIso: est,
      important,
      headline,
    };
    statusCache.set(iata, { at: Date.now(), value });
    return value;
  } catch {
    return undefined;
  }
}

/** Fire a browser notification for an important update (web PWA). */
export function notifyFlightUpdate(status: FlightStatus): void {
  if (!status.important) return;
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification('A2Z flight update', { body: status.headline, icon: '/icon-192.png' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') {
          new Notification('A2Z flight update', { body: status.headline, icon: '/icon-192.png' });
        }
      });
    }
  } catch {
    // notifications unsupported — the in-app banner still shows
  }
}
