/**
 * Lightweight geocoding for the mock data layer.
 *
 * REAL API: replace `detectCityKey` with Google Maps Geocoding
 * (mapsService.geocode) and resolve corridors from actual coordinates.
 */

export type CityKey =
  | 'nyc'
  | 'boston'
  | 'dc'
  | 'jfk'
  | 'ewr'
  | 'lga'
  | 'bos-airport'
  | 'unknown';

const MATCHERS: Array<{ key: CityKey; patterns: RegExp }> = [
  { key: 'jfk', patterns: /\bjfk\b|kennedy/i },
  { key: 'ewr', patterns: /\bewr\b|newark/i },
  { key: 'lga', patterns: /\blga\b|laguardia|la guardia/i },
  { key: 'bos-airport', patterns: /logan|\bbos airport\b|boston airport/i },
  { key: 'boston', patterns: /boston|back bay|cambridge, ma|seaport/i },
  { key: 'dc', patterns: /washington|\bd\.?c\.?\b|union station dc|capitol/i },
  { key: 'nyc', patterns: /new york|\bnyc\b|manhattan|brooklyn|queens|penn station|midtown|soho|harlem/i },
];

export function detectCityKey(address: string): CityKey {
  for (const m of MATCHERS) {
    if (m.patterns.test(address)) return m.key;
  }
  return 'unknown';
}

export const CITY_NAMES: Record<CityKey, string> = {
  nyc: 'New York City',
  boston: 'Boston',
  dc: 'Washington, DC',
  jfk: 'JFK Airport',
  ewr: 'Newark Airport',
  lga: 'LaGuardia Airport',
  'bos-airport': 'Boston Logan Airport',
  unknown: 'your area',
};

/** City used for weather lookups at a given key. */
export const WEATHER_CITY: Record<CityKey, string> = {
  nyc: 'New York',
  boston: 'Boston',
  dc: 'Washington',
  jfk: 'New York',
  ewr: 'Newark',
  lga: 'New York',
  'bos-airport': 'Boston',
  unknown: 'New York',
};

export type CorridorKey =
  | 'nyc-boston'
  | 'nyc-dc'
  | 'nyc-jfk'
  | 'nyc-ewr'
  | 'bosairport-boston'
  | 'generic';

export function resolveCorridor(origin: CityKey, destination: CityKey): CorridorKey {
  const pair = `${origin}>${destination}`;
  switch (pair) {
    case 'nyc>boston':
    case 'boston>nyc':
      return 'nyc-boston';
    case 'nyc>dc':
    case 'dc>nyc':
      return 'nyc-dc';
    case 'nyc>jfk':
    case 'jfk>nyc':
      return 'nyc-jfk';
    case 'nyc>ewr':
    case 'ewr>nyc':
      return 'nyc-ewr';
    case 'bos-airport>boston':
    case 'boston>bos-airport':
      return 'bosairport-boston';
    default:
      return 'generic';
  }
}
