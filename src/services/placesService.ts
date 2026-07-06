/**
 * Smart place resolution — the "know where you're trying to go" layer.
 *
 * As the user types, `suggestPlaces` fuzzy-matches against a curated index
 * of airports, stations, and cities (name, IATA code, and alias aware:
 * "loga" → Logan Airport, "jfk" → JFK, "penn" → Moynihan/Penn Station),
 * then merges live Nominatim geocoder results for arbitrary addresses.
 *
 * REAL API (smarter resolution): route free-text through an LLM via your
 * backend (e.g. the Claude API with a "resolve this travel destination"
 * prompt) to handle inputs like "my sister's place in back bay". The
 * client-side fuzzy matcher below stays as the instant/offline path.
 */

import type { ServiceResult } from '../types';
import { fetchWithTimeout, liveDataEnabled } from './config';

export type PlaceKind = 'airport' | 'station' | 'city' | 'poi' | 'address' | 'home';

export interface PlaceSuggestion {
  id: string;
  /** Primary display label: "Logan International Airport (BOS)". */
  label: string;
  /** Secondary line: "Boston, MA · Airport". */
  sublabel: string;
  /** Full address handed to the trip search. */
  address: string;
  kind: PlaceKind;
}

interface IndexedPlace {
  label: string;
  sublabel: string;
  address: string;
  kind: PlaceKind;
  /** Lowercase alternative names/codes users actually type. */
  aliases: string[];
}

const PLACE_INDEX: IndexedPlace[] = [
  // Airports -----------------------------------------------------------
  {
    label: 'Logan International Airport (BOS)',
    sublabel: 'Boston, MA · Airport',
    address: 'Boston Logan Airport, Terminal A',
    kind: 'airport',
    aliases: ['logan', 'logan airport', 'bos', 'boston airport', 'boston logan'],
  },
  {
    label: 'JFK International Airport (JFK)',
    sublabel: 'Queens, NY · Airport',
    address: 'JFK Airport, Terminal 4',
    kind: 'airport',
    aliases: ['jfk', 'kennedy', 'john f kennedy', 'new york jfk'],
  },
  {
    label: 'LaGuardia Airport (LGA)',
    sublabel: 'Queens, NY · Airport',
    address: 'LaGuardia Airport, Terminal C',
    kind: 'airport',
    aliases: ['lga', 'laguardia', 'la guardia'],
  },
  {
    label: 'Newark Liberty Airport (EWR)',
    sublabel: 'Newark, NJ · Airport',
    address: 'Newark Airport (EWR), Terminal B',
    kind: 'airport',
    aliases: ['ewr', 'newark', 'newark airport', 'newark liberty'],
  },
  {
    label: 'Reagan National Airport (DCA)',
    sublabel: 'Arlington, VA · Airport',
    address: 'Reagan National Airport (DCA), Terminal 2',
    kind: 'airport',
    aliases: ['dca', 'reagan', 'national airport', 'reagan national'],
  },
  // Stations -----------------------------------------------------------
  {
    label: 'Moynihan Train Hall / Penn Station',
    sublabel: 'Manhattan, NY · Train station',
    address: 'Moynihan Train Hall, New York, NY',
    kind: 'station',
    aliases: ['penn', 'penn station', 'moynihan', 'nyp', 'new york penn'],
  },
  {
    label: 'Boston South Station',
    sublabel: 'Boston, MA · Train & bus station',
    address: 'South Station, Boston, MA',
    kind: 'station',
    aliases: ['south station', 'boston south'],
  },
  {
    label: 'Washington Union Station',
    sublabel: 'Washington, DC · Train station',
    address: 'Union Station, Washington, DC',
    kind: 'station',
    aliases: ['union station', 'was', 'dc union'],
  },
  // Cities ---------------------------------------------------------------
  {
    label: 'New York City',
    sublabel: 'New York, NY · City',
    address: 'Manhattan, New York, NY',
    kind: 'city',
    aliases: ['nyc', 'new york', 'manhattan', 'brooklyn'],
  },
  {
    label: 'Boston',
    sublabel: 'Massachusetts · City',
    address: 'Downtown Boston, MA',
    kind: 'city',
    aliases: ['boston', 'bos downtown', 'downtown boston'],
  },
  {
    label: 'Washington, DC',
    sublabel: 'District of Columbia · City',
    address: 'Downtown Washington, DC',
    kind: 'city',
    aliases: ['dc', 'washington', 'washington dc', 'the district'],
  },
  {
    label: 'Newark',
    sublabel: 'New Jersey · City',
    address: 'Downtown Newark, NJ',
    kind: 'city',
    aliases: ['newark nj', 'newark city'],
  },
  {
    label: 'Philadelphia',
    sublabel: 'Pennsylvania · City',
    address: 'Center City, Philadelphia, PA',
    kind: 'city',
    aliases: ['philly', 'philadelphia', 'phl'],
  },
];

// ---------------------------------------------------------------------------
// Fuzzy matching
// ---------------------------------------------------------------------------

/**
 * Score how well `query` matches `candidate` (higher = better, 0 = no match).
 * Prefix beats substring beats subsequence; short aliases (codes) match hard.
 */
function matchScore(query: string, candidate: string): number {
  if (candidate === query) return 100;
  if (candidate.startsWith(query)) return 80 + Math.min(19, query.length * 2);
  if (candidate.includes(query)) return 60 + Math.min(19, query.length * 2);
  // Subsequence ("lgn arprt" → "logan airport"): tolerant of dropped letters.
  let qi = 0;
  for (const ch of candidate) {
    if (qi < query.length && ch === query[qi]) qi += 1;
  }
  if (qi === query.length && query.length >= 3) return 30 + query.length;
  return 0;
}

function scorePlace(query: string, place: IndexedPlace): number {
  const q = query.toLowerCase().trim();
  let best = matchScore(q, place.label.toLowerCase());
  for (const alias of place.aliases) {
    best = Math.max(best, matchScore(q, alias));
  }
  return best;
}

/** Instant local suggestions (airports, stations, cities). */
export function suggestLocalPlaces(query: string, limit = 5): PlaceSuggestion[] {
  const q = query.trim();
  if (q.length < 2) return [];
  return PLACE_INDEX.map((p) => ({ place: p, score: scorePlace(q, p) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r, i) => ({
      id: `local-${i}-${r.place.label}`,
      label: r.place.label,
      sublabel: r.place.sublabel,
      address: r.place.address,
      kind: r.place.kind,
    }));
}

/** Live address suggestions from the Nominatim geocoder. */
export async function suggestLiveAddresses(query: string, limit = 3): Promise<PlaceSuggestion[]> {
  if (!liveDataEnabled() || query.trim().length < 4) return [];
  try {
    const res = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${limit}&addressdetails=0`,
      4000,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ place_id: number; display_name: string }>;
    return rows.map((r) => {
      const parts = r.display_name.split(', ');
      return {
        id: `osm-${r.place_id}`,
        label: parts.slice(0, 2).join(', '),
        sublabel: parts.slice(2, 5).join(', ') || 'Address',
        address: r.display_name,
        kind: 'address' as const,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Combined suggestions: instant local matches first, live addresses after.
 */
export async function suggestPlaces(query: string): Promise<ServiceResult<PlaceSuggestion[]>> {
  const local = suggestLocalPlaces(query);
  const live = local.length >= 4 ? [] : await suggestLiveAddresses(query);
  const seen = new Set(local.map((s) => s.label));
  return { ok: true, data: [...local, ...live.filter((s) => !seen.has(s.label))] };
}

/**
 * Resolve free text to the best-known place, tolerating typos and partial
 * names ("loga" → Logan Airport). Falls back to the raw text as an address.
 */
export function resolvePlace(text: string): { address: string; label: string } {
  const [top] = suggestLocalPlaces(text, 1);
  if (top && scorePlace(text, PLACE_INDEX.find((p) => p.label === top.label)!) >= 60) {
    return { address: top.address, label: top.label };
  }
  return { address: text.trim(), label: text.trim().split(',')[0] };
}
