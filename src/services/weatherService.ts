/**
 * Weather service.
 *
 * LIVE (default): Open-Meteo — a free, keyless, CORS-enabled forecast API
 * called from the visitor's browser. The city is geocoded, then the daily
 * forecast for the travel date is mapped into WeatherCondition.
 *
 * MOCK (fallback): deterministic per city + date, used automatically when
 * the live call fails, the date is beyond the 16-day forecast window, or
 * EXPO_PUBLIC_LIVE_DATA=off.
 *
 * REAL API (paid tier): OpenWeather One Call via apiConfig.openWeatherApiKey
 * plugs in here the same way.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ExpectedConditions, ServiceResult, WeatherCondition, WeatherKind } from '../types';
import { fetchWithTimeout, liveDataEnabled, mockDelay } from './config';
import { geocode } from './geoService';

interface WeatherFacts {
  kind: WeatherKind;
  tempF: number;
  precipChance: number;
  windMph: number;
  summary: string;
}

// ---------------------------------------------------------------------------
// Shared interpretation (used by both live and mock data)
// ---------------------------------------------------------------------------

function buildAdvisories(t: WeatherFacts): string[] {
  const tips: string[] = [];
  if (t.kind === 'rain' || t.kind === 'heavy-rain' || t.kind === 'storm') {
    tips.push('Umbrella recommended.');
    tips.push('Allow extra time — wet roads slow traffic.');
  }
  if (t.kind === 'storm') tips.push('Storms may increase flight delays.');
  if (t.kind === 'snow') tips.push('Snow risk may increase airport delays.');
  if (t.kind === 'heat') tips.push(`It is ${t.tempF}°F — walking with luggage may be uncomfortable.`);
  if (t.kind === 'cold') tips.push('Bundle up — waiting outdoors will feel very cold.');
  if (t.kind === 'wind') tips.push('Strong winds may cause minor flight delays.');
  if (t.kind === 'fog') tips.push('Fog may slow morning flights and driving.');
  return tips;
}

function discomfort(t: WeatherFacts): number {
  switch (t.kind) {
    case 'heavy-rain':
    case 'storm':
      return 0.9;
    case 'rain':
    case 'snow':
      return 0.7;
    case 'heat':
      return 0.65;
    case 'cold':
    case 'wind':
      return 0.45;
    case 'fog':
    case 'clouds':
      return 0.15;
    default:
      return 0.05;
  }
}

function delayImpact(t: WeatherFacts): number {
  switch (t.kind) {
    case 'storm':
      return 0.8;
    case 'snow':
      return 0.75;
    case 'heavy-rain':
      return 0.55;
    case 'fog':
      return 0.5;
    case 'rain':
      return 0.35;
    case 'wind':
      return 0.3;
    default:
      return 0.05;
  }
}

function toCondition(cityName: string, t: WeatherFacts): WeatherCondition {
  return {
    locationLabel: cityName,
    kind: t.kind,
    tempF: t.tempF,
    precipChance: t.precipChance,
    windMph: t.windMph,
    summary: `${t.summary}, ${t.tempF}°F`,
    advisories: buildAdvisories(t),
    discomfortScore: discomfort(t),
    delayImpact: delayImpact(t),
  };
}

// ---------------------------------------------------------------------------
// Live path: Open-Meteo
// ---------------------------------------------------------------------------

/** Map WMO weather codes (Open-Meteo) to our WeatherKind. */
function fromWmoCode(code: number, tempF: number, windMph: number): { kind: WeatherKind; summary: string } {
  if (code >= 95) return { kind: 'storm', summary: 'Thunderstorms' };
  if (code >= 71 && code <= 86) return { kind: 'snow', summary: 'Snow' };
  if (code === 65 || code === 82) return { kind: 'heavy-rain', summary: 'Heavy rain' };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 81)) return { kind: 'rain', summary: 'Rain' };
  if (code >= 45 && code <= 48) return { kind: 'fog', summary: 'Fog' };
  if (tempF >= 88) return { kind: 'heat', summary: 'Hot' };
  if (tempF <= 25) return { kind: 'cold', summary: 'Very cold' };
  if (windMph >= 24) return { kind: 'wind', summary: 'Windy' };
  if (code >= 2) return { kind: 'clouds', summary: 'Cloudy' };
  return { kind: 'clear', summary: 'Clear' };
}

async function fetchLiveWeather(cityName: string, dateIso: string): Promise<WeatherCondition | undefined> {
  const geo = await geocode(cityName);
  if (!geo.ok) return undefined;

  const date = new Date(dateIso);
  const dayDiff = Math.floor((date.getTime() - Date.now()) / 86_400_000);
  if (dayDiff < -1 || dayDiff > 15) return undefined; // outside forecast window → mock

  const day = date.toISOString().slice(0, 10);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.data.lat}&longitude=${geo.data.lng}` +
    `&daily=weathercode,temperature_2m_max,precipitation_probability_max,windspeed_10m_max` +
    `&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto&start_date=${day}&end_date=${day}`;

  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return undefined;
    const body = (await res.json()) as {
      daily?: {
        weathercode: number[];
        temperature_2m_max: number[];
        precipitation_probability_max: Array<number | null>;
        windspeed_10m_max: number[];
      };
    };
    const d = body.daily;
    if (!d || d.weathercode.length === 0) return undefined;

    const tempF = Math.round(d.temperature_2m_max[0]);
    const windMph = Math.round(d.windspeed_10m_max[0]);
    const { kind, summary } = fromWmoCode(d.weathercode[0], tempF, windMph);
    return toCondition(cityName, {
      kind,
      tempF,
      precipChance: d.precipitation_probability_max[0] ?? 0,
      windMph,
      summary,
    });
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Mock fallback (deterministic per city + date)
// ---------------------------------------------------------------------------

const MOCK_FORECASTS: Record<string, WeatherFacts[]> = {
  'New York': [
    { kind: 'rain', tempF: 54, precipChance: 78, windMph: 12, summary: 'Light rain' },
    { kind: 'clear', tempF: 72, precipChance: 5, windMph: 7, summary: 'Sunny' },
    { kind: 'heat', tempF: 91, precipChance: 10, windMph: 6, summary: 'Hot and humid' },
    { kind: 'clouds', tempF: 63, precipChance: 20, windMph: 10, summary: 'Mostly cloudy' },
  ],
  Boston: [
    { kind: 'clouds', tempF: 58, precipChance: 30, windMph: 14, summary: 'Overcast' },
    { kind: 'rain', tempF: 51, precipChance: 82, windMph: 18, summary: 'Steady rain' },
    { kind: 'clear', tempF: 68, precipChance: 5, windMph: 9, summary: 'Clear skies' },
    { kind: 'wind', tempF: 55, precipChance: 15, windMph: 26, summary: 'Very windy' },
  ],
  Washington: [
    { kind: 'clear', tempF: 76, precipChance: 5, windMph: 6, summary: 'Sunny' },
    { kind: 'storm', tempF: 71, precipChance: 88, windMph: 22, summary: 'Thunderstorms possible' },
    { kind: 'heat', tempF: 94, precipChance: 15, windMph: 5, summary: 'Very hot' },
    { kind: 'clouds', tempF: 66, precipChance: 25, windMph: 8, summary: 'Partly cloudy' },
  ],
  Newark: [
    { kind: 'clouds', tempF: 60, precipChance: 25, windMph: 11, summary: 'Cloudy' },
    { kind: 'rain', tempF: 53, precipChance: 74, windMph: 13, summary: 'Showers' },
    { kind: 'clear', tempF: 70, precipChance: 5, windMph: 8, summary: 'Sunny' },
    { kind: 'fog', tempF: 57, precipChance: 35, windMph: 4, summary: 'Morning fog' },
  ],
};

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Per-trip snapshot: the last successful forecast, with when it was
// checked — so the card can say "Last checked 4:12 PM" and never claim a
// stale value is current.
// ---------------------------------------------------------------------------

const SNAPSHOT_KEY = '@a2z/weather-snapshots';

export interface WeatherSnapshot {
  condition: WeatherCondition;
  checkedAt: string; // ISO
}

export async function getStoredWeatherSnapshot(tripId: string): Promise<WeatherSnapshot | undefined> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, WeatherSnapshot>) : {};
    return all[tripId];
  } catch {
    return undefined;
  }
}

export async function storeWeatherSnapshot(
  tripId: string,
  condition: WeatherCondition,
): Promise<WeatherSnapshot> {
  const snapshot: WeatherSnapshot = { condition, checkedAt: new Date().toISOString() };
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, WeatherSnapshot>) : {};
    all[tripId] = snapshot;
    await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(all));
  } catch {
    // best effort
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// Manual fallback: when no forecast is available (trip too far out, or the
// network failed), the user picks rough conditions and packing/advice use
// this synthetic condition — always labeled "Entered by you", never live.
// ---------------------------------------------------------------------------

const EXPECTED_FACTS: Record<ExpectedConditions, WeatherFacts> = {
  hot: { kind: 'heat', tempF: 92, precipChance: 10, windMph: 6, summary: 'Hot (your estimate)' },
  mild: { kind: 'clear', tempF: 70, precipChance: 10, windMph: 8, summary: 'Mild (your estimate)' },
  cold: { kind: 'cold', tempF: 30, precipChance: 15, windMph: 10, summary: 'Cold (your estimate)' },
  rainy: { kind: 'rain', tempF: 55, precipChance: 80, windMph: 12, summary: 'Rainy (your estimate)' },
  snowy: { kind: 'snow', tempF: 28, precipChance: 70, windMph: 12, summary: 'Snowy (your estimate)' },
  mixed: { kind: 'clouds', tempF: 60, precipChance: 45, windMph: 10, summary: 'Mixed (your estimate)' },
};

/** Build a WeatherCondition from the user's expected-conditions pick. */
export function conditionFromExpected(
  expected: ExpectedConditions,
  cityName: string,
): WeatherCondition {
  return toCondition(cityName, EXPECTED_FACTS[expected]);
}

/**
 * Live-only fetch: returns the real Open-Meteo forecast or an honest
 * failure — never a mock. Used by the trip weather card, which must show
 * "unavailable" (with the manual fallback) rather than pretend.
 */
export async function getLiveWeatherOnly(
  cityName: string,
  dateIso: string,
): Promise<ServiceResult<WeatherCondition>> {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'Invalid date for weather lookup', code: 'NOT_FOUND' };
  }
  const dayDiff = Math.floor((date.getTime() - Date.now()) / 86_400_000);
  if (dayDiff > 15) {
    return {
      ok: false,
      error: 'This date is beyond the 16-day forecast range.',
      code: 'NOT_FOUND',
    };
  }
  if (!liveDataEnabled()) {
    return { ok: false, error: 'Live data is turned off in this build.', code: 'CONFIG' };
  }
  const live = await fetchLiveWeather(cityName, dateIso);
  return live
    ? { ok: true, data: live }
    : { ok: false, error: 'Could not reach the forecast service.', code: 'NETWORK' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getWeather(
  cityName: string,
  dateIso: string,
): Promise<ServiceResult<WeatherCondition>> {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'Invalid date for weather lookup', code: 'NOT_FOUND' };
  }

  // Live first — real forecast for the actual travel date.
  if (liveDataEnabled()) {
    const live = await fetchLiveWeather(cityName, dateIso);
    if (live) return { ok: true, data: live };
  }

  // Mock fallback.
  await mockDelay(150);
  const templates = MOCK_FORECASTS[cityName] ?? MOCK_FORECASTS['New York'];
  const t = templates[dayOfYear(date) % templates.length];
  return { ok: true, data: toCondition(cityName, t) };
}
