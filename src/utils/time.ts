/** Time helpers shared by services and UI. All app times are ISO strings. */

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);
}

/** "7:15 AM" */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "Sat, Jul 11" */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

/** 195 -> "3h 15m", 45 -> "45m" */
export function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}

/** "in 1h 12m" or "now" — for countdowns. Negative -> "overdue". */
export function formatCountdown(targetIso: string, now: Date = new Date()): string {
  const mins = Math.round((new Date(targetIso).getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return 'now';
  return `in ${formatDuration(mins)}`;
}

export function formatMoney(usd?: number): string {
  if (usd === undefined || Number.isNaN(usd)) return '—';
  return usd % 1 === 0 ? `$${usd.toFixed(0)}` : `$${usd.toFixed(2)}`;
}

export function formatMoneyRange(low: number, high: number): string {
  return `$${Math.round(low)}–$${Math.round(high)}`;
}
