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
  { code: 'MSY', name: 'Louis Armstrong New Orleans', city: 'New Orleans', lat: 29.9934, lng: -90.258, busy: false },
  { code: 'TPA', name: 'Tampa International', city: 'Tampa', lat: 27.9755, lng: -82.5332, busy: false },
  { code: 'JAX', name: 'Jacksonville International', city: 'Jacksonville', lat: 30.4941, lng: -81.6879, busy: false },
  { code: 'RSW', name: 'Southwest Florida', city: 'Fort Myers', lat: 26.5362, lng: -81.7552, busy: false },
  { code: 'SAT', name: 'San Antonio International', city: 'San Antonio', lat: 29.5337, lng: -98.4698, busy: false },
  { code: 'STL', name: 'St. Louis Lambert', city: 'St. Louis', lat: 38.7487, lng: -90.37, busy: false },
  { code: 'MCI', name: 'Kansas City International', city: 'Kansas City', lat: 39.2976, lng: -94.7139, busy: false },
  { code: 'RDU', name: 'Raleigh–Durham', city: 'Raleigh', lat: 35.8801, lng: -78.788, busy: false },
  { code: 'PIT', name: 'Pittsburgh International', city: 'Pittsburgh', lat: 40.4915, lng: -80.2329, busy: false },
  { code: 'CLE', name: 'Cleveland Hopkins', city: 'Cleveland', lat: 41.4058, lng: -81.8539, busy: false },
  { code: 'CMH', name: 'John Glenn Columbus', city: 'Columbus', lat: 39.998, lng: -82.8919, busy: false },
  { code: 'IND', name: 'Indianapolis International', city: 'Indianapolis', lat: 39.7169, lng: -86.2956, busy: false },
  { code: 'MKE', name: 'Milwaukee Mitchell', city: 'Milwaukee', lat: 42.9472, lng: -87.8966, busy: false },
  { code: 'MEM', name: 'Memphis International', city: 'Memphis', lat: 35.0424, lng: -89.9767, busy: false },
  { code: 'OKC', name: 'Will Rogers Oklahoma City', city: 'Oklahoma City', lat: 35.3931, lng: -97.6007, busy: false },
  { code: 'ABQ', name: 'Albuquerque Sunport', city: 'Albuquerque', lat: 35.0402, lng: -106.6091, busy: false },
  { code: 'ELP', name: 'El Paso International', city: 'El Paso', lat: 31.8072, lng: -106.3776, busy: false },
  { code: 'TUS', name: 'Tucson International', city: 'Tucson', lat: 32.1161, lng: -110.9411, busy: false },
  { code: 'SMF', name: 'Sacramento International', city: 'Sacramento', lat: 38.6954, lng: -121.5908, busy: false },
  { code: 'SJC', name: 'San Jose Mineta', city: 'San Jose', lat: 37.3639, lng: -121.9289, busy: false },
  { code: 'BWI', name: 'Baltimore/Washington International', city: 'Baltimore', lat: 39.1774, lng: -76.6684, busy: true },
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
  { city: 'Tampa', lat: 27.9506, lng: -82.4572, aliases: ['tampa'], amtrak: true },
  { city: 'Jacksonville', lat: 30.3322, lng: -81.6557, aliases: ['jacksonville'], amtrak: true },
  { city: 'Fort Myers', lat: 26.6406, lng: -81.8723, aliases: ['fort myers', 'ft myers'], amtrak: false },
  { city: 'San Antonio', lat: 29.4241, lng: -98.4936, aliases: ['san antonio'], amtrak: true },
  { city: 'St. Louis', lat: 38.627, lng: -90.1994, aliases: ['st louis', 'st. louis', 'saint louis'], amtrak: true },
  { city: 'Kansas City', lat: 39.0997, lng: -94.5786, aliases: ['kansas city'], amtrak: true },
  { city: 'Raleigh', lat: 35.7796, lng: -78.6382, aliases: ['raleigh', 'durham'], amtrak: true },
  { city: 'Pittsburgh', lat: 40.4406, lng: -79.9959, aliases: ['pittsburgh'], amtrak: true },
  { city: 'Cleveland', lat: 41.4993, lng: -81.6944, aliases: ['cleveland'], amtrak: true },
  { city: 'Columbus', lat: 39.9612, lng: -82.9988, aliases: ['columbus, oh', 'columbus ohio'], amtrak: false },
  { city: 'Indianapolis', lat: 39.7684, lng: -86.1581, aliases: ['indianapolis', 'indy'], amtrak: true },
  { city: 'Milwaukee', lat: 43.0389, lng: -87.9065, aliases: ['milwaukee'], amtrak: true },
  { city: 'Memphis', lat: 35.1495, lng: -90.049, aliases: ['memphis'], amtrak: true },
  { city: 'Oklahoma City', lat: 35.4676, lng: -97.5164, aliases: ['oklahoma city', 'okc'], amtrak: true },
  { city: 'Albuquerque', lat: 35.0844, lng: -106.6504, aliases: ['albuquerque'], amtrak: true },
  { city: 'El Paso', lat: 31.7619, lng: -106.485, aliases: ['el paso'], amtrak: true },
  { city: 'Tucson', lat: 32.2226, lng: -110.9747, aliases: ['tucson'], amtrak: true },
  { city: 'Sacramento', lat: 38.5816, lng: -121.4944, aliases: ['sacramento'], amtrak: true },
  { city: 'San Jose', lat: 37.3382, lng: -121.8863, aliases: ['san jose'], amtrak: true },
  { city: 'Orlando (Kissimmee)', lat: 28.2919, lng: -81.4076, aliases: ['kissimmee'], amtrak: true },
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

/** Nearest known city to a coordinate, with its distance. */
export function nearestCity(coords: { lat: number; lng: number }): { entry: CityEntry; miles: number } {
  let best = CITY_COORDS[0];
  let bestMiles = haversineMiles(coords, best);
  for (const entry of CITY_COORDS) {
    const d = haversineMiles(coords, entry);
    if (d < bestMiles) {
      best = entry;
      bestMiles = d;
    }
  }
  return { entry: best, miles: bestMiles };
}

export type { CityEntry };
