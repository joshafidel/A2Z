/**
 * Real geographical data: major US airports and city coordinates.
 * Distances come from the haversine formula on true lat/lng, so flight
 * times and fares scale with actual geography (NYC→Miami ≈ 1,090 mi).
 *
 * REAL API: replace `findCityCoords` keyword matching with live geocoding
 * (geoService.geocode) — the airport lookup below already works from raw
 * coordinates.
 */

export interface Airport {
  code: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  busy: boolean;
}

export const AIRPORTS: Airport[] = [
  { code: 'JFK', name: 'JFK International', city: 'New York', lat: 40.6413, lng: -73.7781, busy: true },
  { code: 'LGA', name: 'LaGuardia', city: 'New York', lat: 40.7769, lng: -73.874, busy: true },
  { code: 'EWR', name: 'Newark Liberty', city: 'Newark', lat: 40.6895, lng: -74.1745, busy: true },
  { code: 'BOS', name: 'Boston Logan', city: 'Boston', lat: 42.3656, lng: -71.0096, busy: true },
  { code: 'DCA', name: 'Reagan National', city: 'Washington', lat: 38.8512, lng: -77.0402, busy: false },
  { code: 'PHL', name: 'Philadelphia International', city: 'Philadelphia', lat: 39.8729, lng: -75.2437, busy: false },
  { code: 'MIA', name: 'Miami International', city: 'Miami', lat: 25.7959, lng: -80.287, busy: true },
  { code: 'FLL', name: 'Fort Lauderdale', city: 'Fort Lauderdale', lat: 26.0742, lng: -80.1506, busy: false },
  { code: 'MCO', name: 'Orlando International', city: 'Orlando', lat: 28.4312, lng: -81.3081, busy: true },
  { code: 'ATL', name: 'Hartsfield–Jackson Atlanta', city: 'Atlanta', lat: 33.6407, lng: -84.4277, busy: true },
  { code: 'ORD', name: "Chicago O'Hare", city: 'Chicago', lat: 41.9742, lng: -87.9073, busy: true },
  { code: 'DFW', name: 'Dallas/Fort Worth', city: 'Dallas', lat: 32.8998, lng: -97.0403, busy: true },
  { code: 'IAH', name: 'Houston Bush', city: 'Houston', lat: 29.9902, lng: -95.3368, busy: true },
  { code: 'DEN', name: 'Denver International', city: 'Denver', lat: 39.8561, lng: -104.6737, busy: true },
  { code: 'PHX', name: 'Phoenix Sky Harbor', city: 'Phoenix', lat: 33.4373, lng: -112.0078, busy: false },
  { code: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', lat: 33.9416, lng: -118.4085, busy: true },
  { code: 'SFO', name: 'San Francisco International', city: 'San Francisco', lat: 37.6213, lng: -122.379, busy: true },
  { code: 'SEA', name: 'Seattle–Tacoma', city: 'Seattle', lat: 47.4502, lng: -122.3088, busy: true },
  { code: 'LAS', name: 'Harry Reid Las Vegas', city: 'Las Vegas', lat: 36.086, lng: -115.1537, busy: true },
  { code: 'AUS', name: 'Austin–Bergstrom', city: 'Austin', lat: 30.1945, lng: -97.6699, busy: false },
  { code: 'BNA', name: 'Nashville International', city: 'Nashville', lat: 36.1263, lng: -86.6774, busy: false },
  { code: 'MSP', name: 'Minneapolis–St. Paul', city: 'Minneapolis', lat: 44.8848, lng: -93.2223, busy: false },
  { code: 'DTW', name: 'Detroit Metro', city: 'Detroit', lat: 42.2162, lng: -83.3554, busy: false },
  { code: 'CLT', name: 'Charlotte Douglas', city: 'Charlotte', lat: 35.2144, lng: -80.9473, busy: false },
  { code: 'SAN', name: 'San Diego International', city: 'San Diego', lat: 32.7338, lng: -117.1933, busy: false },
  { code: 'PDX', name: 'Portland International', city: 'Portland', lat: 45.5898, lng: -122.5951, busy: false },
  { code: 'SLC', name: 'Salt Lake City International', city: 'Salt Lake City', lat: 40.7899, lng: -111.9791, busy: false },
  { code: 'NOLA', name: 'Louis Armstrong New Orleans', city: 'New Orleans', lat: 29.9934, lng: -90.258, busy: false },
];

interface CityEntry {
  city: string;
  lat: number;
  lng: number;
  aliases: string[];
  /** Served by useful Amtrak routes (so trains populate as an option). */
  amtrak: boolean;
}

export const CITY_COORDS: CityEntry[] = [
  { city: 'New York', lat: 40.7128, lng: -74.006, aliases: ['new york', 'nyc', 'manhattan', 'brooklyn', 'queens'], amtrak: true },
  { city: 'Boston', lat: 42.3601, lng: -71.0589, aliases: ['boston', 'cambridge, ma', 'back bay'], amtrak: true },
  { city: 'Washington', lat: 38.9072, lng: -77.0369, aliases: ['washington', 'dc'], amtrak: true },
  { city: 'Philadelphia', lat: 39.9526, lng: -75.1652, aliases: ['philadelphia', 'philly'], amtrak: true },
  { city: 'Newark', lat: 40.7357, lng: -74.1724, aliases: ['newark'], amtrak: true },
  { city: 'Baltimore', lat: 39.2904, lng: -76.6122, aliases: ['baltimore'], amtrak: true },
  { city: 'Miami', lat: 25.7617, lng: -80.1918, aliases: ['miami', 'south beach', 'miami beach'], amtrak: true },
  { city: 'Fort Lauderdale', lat: 26.1224, lng: -80.1373, aliases: ['fort lauderdale', 'ft lauderdale'], amtrak: true },
  { city: 'Orlando', lat: 28.5384, lng: -81.3789, aliases: ['orlando', 'disney world'], amtrak: true },
  { city: 'Atlanta', lat: 33.749, lng: -84.388, aliases: ['atlanta'], amtrak: true },
  { city: 'Chicago', lat: 41.8781, lng: -87.6298, aliases: ['chicago'], amtrak: true },
  { city: 'Dallas', lat: 32.7767, lng: -96.797, aliases: ['dallas'], amtrak: true },
  { city: 'Houston', lat: 29.7604, lng: -95.3698, aliases: ['houston'], amtrak: false },
  { city: 'Denver', lat: 39.7392, lng: -104.9903, aliases: ['denver'], amtrak: true },
  { city: 'Phoenix', lat: 33.4484, lng: -112.074, aliases: ['phoenix'], amtrak: false },
  { city: 'Los Angeles', lat: 34.0522, lng: -118.2437, aliases: ['los angeles', 'la, ca', 'hollywood', 'santa monica'], amtrak: true },
  { city: 'San Francisco', lat: 37.7749, lng: -122.4194, aliases: ['san francisco', 'sf'], amtrak: true },
  { city: 'Seattle', lat: 47.6062, lng: -122.3321, aliases: ['seattle'], amtrak: true },
  { city: 'Las Vegas', lat: 36.1699, lng: -115.1398, aliases: ['las vegas', 'vegas'], amtrak: false },
  { city: 'Austin', lat: 30.2672, lng: -97.7431, aliases: ['austin'], amtrak: true },
  { city: 'Nashville', lat: 36.1627, lng: -86.7816, aliases: ['nashville'], amtrak: false },
  { city: 'Minneapolis', lat: 44.9778, lng: -93.265, aliases: ['minneapolis', 'twin cities'], amtrak: true },
  { city: 'Detroit', lat: 42.3314, lng: -83.0458, aliases: ['detroit'], amtrak: true },
  { city: 'Charlotte', lat: 35.2271, lng: -80.8431, aliases: ['charlotte'], amtrak: true },
  { city: 'San Diego', lat: 32.7157, lng: -117.1611, aliases: ['san diego'], amtrak: true },
  { city: 'Portland', lat: 45.5152, lng: -122.6784, aliases: ['portland'], amtrak: true },
  { city: 'Salt Lake City', lat: 40.7608, lng: -111.891, aliases: ['salt lake'], amtrak: true },
  { city: 'New Orleans', lat: 29.9511, lng: -90.0715, aliases: ['new orleans', 'nola'], amtrak: true },
];

export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Keyword-match a free-text address to a known city (offline geocoding). */
export function findCityCoords(address: string): CityEntry | undefined {
  const q = address.toLowerCase();
  let best: { entry: CityEntry; len: number } | undefined;
  for (const entry of CITY_COORDS) {
    for (const alias of entry.aliases) {
      if (q.includes(alias) && (!best || alias.length > best.len)) {
        best = { entry, len: alias.length };
      }
    }
  }
  return best?.entry;
}

/** Nearest airport to a coordinate (great-circle distance). */
export function nearestAirport(coords: { lat: number; lng: number }): Airport {
  return AIRPORTS.reduce((best, a) =>
    haversineMiles(coords, a) < haversineMiles(coords, best) ? a : best,
  );
}
