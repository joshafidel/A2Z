/**
 * Shared shape returned by the line-haul search services
 * (flightService, trainService, busService). The trip orchestrator
 * turns these into full door-to-door RouteOptions.
 */

import type { TransportMode } from '../types';

export interface LineHaulOption {
  id: string;
  mode: Extract<TransportMode, 'flight' | 'train' | 'bus'>;
  provider: string; // "Delta", "Amtrak", "FlixBus"
  serviceName: string; // "Acela 2153", "DL 2368", "Bus 421"
  fromStation: string; // "Moynihan Train Hall", "LGA Terminal C"
  toStation: string;
  /** Minutes after the requested departure that this service leaves. */
  departOffsetMinutes: number;
  durationMinutes: number;
  /** Per-person base fare. undefined = provider pricing unavailable. */
  farePerPersonUsd?: number;
  /** Per-bag checked baggage fee (flights mostly). */
  bagFeeUsd: number;
  /** Optional seat-selection fee per person. */
  seatFeeUsd?: number;
  reliabilityScore: number; // 0–100 historical on-time
  comfortScore: number; // 0–100
  baseDelayRisk: number; // 0–1 before weather adjustments
  bookingUrl: string;
  notes?: string[];
}
