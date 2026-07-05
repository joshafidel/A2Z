/**
 * Weather service.
 *
 * MOCK: deterministic per city + date so the same search always shows the
 * same forecast (and different dates show different weather).
 *
 * REAL API: swap `fetchLiveWeather` in for OpenWeather One Call
 *   GET https://api.openweathermap.org/data/3.0/onecall?lat=..&lon=..&appid=${apiConfig.openWeatherApiKey}
 * or WeatherAPI forecast.json — map the response into `WeatherCondition`.
 */

import type { ServiceResult, WeatherCondition, WeatherKind } from '../types';
import { isLive, mockDelay } from './config';

interface WeatherTemplate {
  kind: WeatherKind;
  tempF: number;
  precipChance: number;
  windMph: number;
  summary: string;
}

/** Rotating mock forecasts per city; index chosen by day-of-year. */
const MOCK_FORECASTS: Record<string, WeatherTemplate[]> = {
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

function buildAdvisories(t: WeatherTemplate): string[] {
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

function discomfort(t: WeatherTemplate): number {
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

function delayImpact(t: WeatherTemplate): number {
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

export async function getWeather(
  cityName: string,
  dateIso: string,
): Promise<ServiceResult<WeatherCondition>> {
  if (isLive('openWeatherApiKey')) {
    // REAL API: call OpenWeather here and map into WeatherCondition.
    // Falls through to mock until implemented.
  }

  await mockDelay(150);

  const templates = MOCK_FORECASTS[cityName] ?? MOCK_FORECASTS['New York'];
  if (!templates) {
    return { ok: false, error: `No forecast available for ${cityName}`, code: 'NOT_FOUND' };
  }

  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'Invalid date for weather lookup', code: 'NOT_FOUND' };
  }

  const t = templates[dayOfYear(date) % templates.length];
  return {
    ok: true,
    data: {
      locationLabel: cityName,
      kind: t.kind,
      tempF: t.tempF,
      precipChance: t.precipChance,
      windMph: t.windMph,
      summary: `${t.summary}, ${t.tempF}°F`,
      advisories: buildAdvisories(t),
      discomfortScore: discomfort(t),
      delayImpact: delayImpact(t),
    },
  };
}
