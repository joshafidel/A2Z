/**
 * "Tell A2Z what you need" — the chat trip curator.
 *
 * The user describes the trip in plain English; this service extracts a
 * structured request (origin, destination, date, time of day, travelers,
 * bags, preference, hotel) and the chat screen hands it to the planner,
 * which curates the actual options.
 *
 * Parsing uses Claude when EXPO_PUBLIC_ANTHROPIC_API_KEY is set; without
 * a key an honest rules parser (known city names, date phrases, counts)
 * does the job and the UI says so. Fields are merged across messages so
 * the user can answer follow-up questions one at a time. Nothing is ever
 * invented: unknown fields stay empty and get asked about.
 */

import Anthropic from '@anthropic-ai/sdk';

import { AIRPORTS } from '../data/airports';
import { extractDate } from './importService';
import type { TravelPreference } from '../types';

const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

export function chatAiConfigured(): boolean {
  return apiKey.length > 0;
}

export interface TripRequestFields {
  originCity: string | null;
  destinationCity: string | null;
  dateIso: string | null; // YYYY-MM-DD
  timeOfDay: 'morning' | 'midday' | 'night' | null;
  travelers: number | null;
  bags: number | null;
  preference: TravelPreference | null;
  wantsHotel: boolean;
}

export const EMPTY_REQUEST: TripRequestFields = {
  originCity: null,
  destinationCity: null,
  dateIso: null,
  timeOfDay: null,
  travelers: null,
  bags: null,
  preference: null,
  wantsHotel: false,
};

// ---------------------------------------------------------------------------
// City vocabulary: airport cities + everyday aliases + IATA codes.
// ---------------------------------------------------------------------------

const CITY_ALIASES: Record<string, string> = {
  nyc: 'New York',
  'new york city': 'New York',
  manhattan: 'New York',
  brooklyn: 'New York',
  la: 'Los Angeles',
  sf: 'San Francisco',
  'san fran': 'San Francisco',
  dc: 'Washington',
  'washington dc': 'Washington',
  'washington d.c.': 'Washington',
  vegas: 'Las Vegas',
  philly: 'Philadelphia',
  chi: 'Chicago',
};

interface CityHit {
  city: string;
  index: number;
  length: number;
}

/** Every known city mentioned in the text, with its position. */
export function findCities(text: string): CityHit[] {
  const lower = text.toLowerCase();
  const hits: CityHit[] = [];
  const tryTerm = (term: string, city: string) => {
    let from = 0;
    while (true) {
      const idx = lower.indexOf(term, from);
      if (idx === -1) break;
      const before = idx === 0 ? ' ' : lower[idx - 1];
      const after = idx + term.length >= lower.length ? ' ' : lower[idx + term.length];
      if (!/[a-z]/.test(before) && !/[a-z]/.test(after)) {
        hits.push({ city, index: idx, length: term.length });
      }
      from = idx + term.length;
    }
  };
  const cities = [...new Set(AIRPORTS.map((a) => a.city))];
  for (const city of cities) tryTerm(city.toLowerCase(), city);
  for (const [alias, city] of Object.entries(CITY_ALIASES)) tryTerm(alias, city);
  // IATA codes ("from JFK") — only uppercase in the ORIGINAL text, so the
  // word "was" never matches a code.
  for (const a of AIRPORTS) {
    let from = 0;
    while (true) {
      const idx = text.indexOf(a.code, from);
      if (idx === -1) break;
      const before = idx === 0 ? ' ' : text[idx - 1];
      const after = idx + 3 >= text.length ? ' ' : text[idx + 3];
      if (!/[A-Za-z]/.test(before) && !/[A-Za-z]/.test(after)) {
        hits.push({ city: a.city, index: idx, length: 3 });
      }
      from = idx + 3;
    }
  }
  // Longest match wins at overlapping positions ("new york city" over "new york").
  hits.sort((x, y) => x.index - y.index || y.length - x.length);
  const out: CityHit[] = [];
  for (const h of hits) {
    const last = out[out.length - 1];
    if (last && h.index < last.index + last.length) continue;
    out.push(h);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dates: absolute formats via extractDate, plus everyday phrases.
// ---------------------------------------------------------------------------

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function parseDatePhrase(text: string, now: Date = new Date()): string | null {
  const absolute = extractDate(text);
  if (absolute) return absolute;
  const lower = text.toLowerCase();
  const toIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d;
  };
  if (/\bday after tomorrow\b/.test(lower)) return toIso(addDays(2));
  if (/\btomorrow\b/.test(lower)) return toIso(addDays(1));
  if (/\btoday\b|\btonight\b/.test(lower)) return toIso(addDays(0));
  const wd = lower.match(/\b(?:next|this|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  const bare = wd ?? lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (bare) {
    const target = WEEKDAYS.indexOf(bare[1]);
    let delta = (target - now.getDay() + 7) % 7;
    if (delta === 0) delta = 7; // "Friday" said on a Friday = next week
    return toIso(addDays(delta));
  }
  // "Jul 25" / "July 25" without a year → next occurrence.
  const md = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (md) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(md[1]);
    const day = Number(md[2]);
    if (day >= 1 && day <= 31) {
      const d = new Date(now.getFullYear(), month, day);
      if (d.getTime() < now.getTime() - 86_400_000) d.setFullYear(d.getFullYear() + 1);
      return toIso(d);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rules extraction + merging
// ---------------------------------------------------------------------------

export function extractRequestWithRules(
  text: string,
  now: Date = new Date(),
): Partial<TripRequestFields> {
  const lower = text.toLowerCase();
  const out: Partial<TripRequestFields> = {};

  const cities = findCities(text);
  // "to <city>" pins the destination; "from <city>" pins the origin.
  for (const hit of cities) {
    const prefix = lower.slice(Math.max(0, hit.index - 8), hit.index);
    if (/\bfrom\s*$/.test(prefix) && out.originCity === undefined) out.originCity = hit.city;
    else if (/\b(to|in|for)\s*$/.test(prefix) && out.destinationCity === undefined) out.destinationCity = hit.city;
  }
  const unclaimed = cities.filter((c) => c.city !== out.originCity && c.city !== out.destinationCity);
  if (out.destinationCity === undefined && unclaimed.length > 0) {
    // With two unpinned cities the first is the origin; with one, it's the destination.
    if (unclaimed.length >= 2 && out.originCity === undefined) {
      out.originCity = unclaimed[0].city;
      out.destinationCity = unclaimed[1].city;
    } else {
      out.destinationCity = unclaimed[unclaimed.length - 1].city;
    }
  } else if (out.originCity === undefined && unclaimed.length > 0) {
    out.originCity = unclaimed[0].city;
  }

  const dateIso = parseDatePhrase(text, now);
  if (dateIso) out.dateIso = dateIso;

  if (/\bmorning\b|\bearly\b|\bam flight\b/.test(lower)) out.timeOfDay = 'morning';
  else if (/\bafternoon\b|\bmidday\b|\bnoon\b/.test(lower)) out.timeOfDay = 'midday';
  else if (/\bevening\b|\bnight\b|\btonight\b|\bred[- ]?eye\b/.test(lower)) out.timeOfDay = 'night';

  const travelers = lower.match(/\b(\d{1,2})\s+(?:people|persons|travelers|passengers|adults|of us)\b/);
  if (travelers) out.travelers = Number(travelers[1]);
  else if (/\b(?:my (?:wife|husband|partner) and i|the two of us|both of us)\b/.test(lower)) out.travelers = 2;

  const bags = lower.match(/\b(\d{1,2})\s+(?:checked\s+)?(?:bags?|suitcases?)\b/);
  if (bags) out.bags = Number(bags[1]);
  else if (/\bcarry[- ]?on only\b|\bno (?:checked )?bags?\b/.test(lower)) out.bags = 0;
  else if (/\ba (?:checked )?(?:bag|suitcase)\b/.test(lower)) out.bags = 1;

  if (/\bcheap|\bbudget|\bsave money|\baffordable/.test(lower)) out.preference = 'cheapest';
  else if (/\bfast|\bquick|\basap|\bsoonest/.test(lower)) out.preference = 'fastest';
  else if (/\beasy|\bcomfortable|\bsimple|\bleast hassle/.test(lower)) out.preference = 'easiest';

  if (/\bhotel\b|\bplace to stay\b|\bsomewhere to stay\b|\baccommodation\b|\bneed a room\b/.test(lower)) {
    out.wantsHotel = true;
  }

  return out;
}

/** Later answers fill gaps; explicit new values override old ones. */
export function mergeRequest(
  prev: TripRequestFields,
  next: Partial<TripRequestFields>,
): TripRequestFields {
  return {
    originCity: next.originCity ?? prev.originCity,
    destinationCity: next.destinationCity ?? prev.destinationCity,
    dateIso: next.dateIso ?? prev.dateIso,
    timeOfDay: next.timeOfDay ?? prev.timeOfDay,
    travelers: next.travelers ?? prev.travelers,
    bags: next.bags ?? prev.bags,
    preference: next.preference ?? prev.preference,
    wantsHotel: next.wantsHotel || prev.wantsHotel,
  };
}

/** What still blocks planning (origin can fall back to the profile). */
export function missingFields(fields: TripRequestFields, homeCity?: string): string[] {
  const missing: string[] = [];
  if (!fields.destinationCity) missing.push('destination');
  if (!fields.originCity && !homeCity) missing.push('origin');
  if (!fields.dateIso) missing.push('date');
  return missing;
}

/** The assistant's reply: an honest summary plus ONE follow-up question. */
export function buildReply(fields: TripRequestFields, homeCity?: string): string {
  const missing = missingFields(fields, homeCity);
  const origin = fields.originCity ?? homeCity;
  const parts: string[] = [];
  if (fields.destinationCity && origin) {
    parts.push(`Got it — ${origin} to ${fields.destinationCity}`);
  } else if (fields.destinationCity) {
    parts.push(`Got it — heading to ${fields.destinationCity}`);
  }
  if (fields.dateIso) {
    const d = new Date(`${fields.dateIso}T12:00:00`);
    parts.push(
      `on ${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}${fields.timeOfDay ? ` (${fields.timeOfDay})` : ''}`,
    );
  }
  const extras: string[] = [];
  if (fields.travelers) extras.push(`${fields.travelers} traveler${fields.travelers === 1 ? '' : 's'}`);
  if (fields.bags !== null) extras.push(fields.bags === 0 ? 'carry-on only' : `${fields.bags} bag${fields.bags === 1 ? '' : 's'}`);
  if (fields.preference) extras.push(`optimizing for ${fields.preference}`);
  if (fields.wantsHotel) extras.push('with a hotel');
  const summary =
    parts.length > 0 ? `${parts.join(' ')}${extras.length > 0 ? ` — ${extras.join(', ')}` : ''}.` : '';

  if (missing.length === 0) {
    return `${summary} Tap "Curate my options" and I'll build the door-to-door choices.`.trim();
  }
  const question =
    missing[0] === 'destination'
      ? 'Where are you headed?'
      : missing[0] === 'origin'
        ? 'Where are you starting from?'
        : 'Which day are you leaving?';
  return summary === '' ? question : `${summary} ${question}`;
}

// ---------------------------------------------------------------------------
// AI path (validated, rules fallback)
// ---------------------------------------------------------------------------

function validAiFields(raw: unknown): Partial<TripRequestFields> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
  const out: Partial<TripRequestFields> = {};
  const origin = str(r.originCity);
  const dest = str(r.destinationCity);
  if (origin) out.originCity = origin;
  if (dest) out.destinationCity = dest;
  const date = str(r.date);
  if (date && /^20\d{2}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date).getTime())) {
    out.dateIso = date;
  }
  if (r.timeOfDay === 'morning' || r.timeOfDay === 'midday' || r.timeOfDay === 'night') out.timeOfDay = r.timeOfDay;
  if (typeof r.travelers === 'number' && r.travelers >= 1 && r.travelers <= 12) out.travelers = Math.round(r.travelers);
  if (typeof r.bags === 'number' && r.bags >= 0 && r.bags <= 8) out.bags = Math.round(r.bags);
  if (r.preference === 'cheapest' || r.preference === 'fastest' || r.preference === 'easiest') out.preference = r.preference;
  if (typeof r.wantsHotel === 'boolean') out.wantsHotel = r.wantsHotel;
  return out;
}

/**
 * Parse one chat message into structured fields. Returns which engine
 * actually answered so the UI can label it honestly.
 */
export async function parseTripMessage(
  text: string,
  now: Date = new Date(),
): Promise<{ fields: Partial<TripRequestFields>; via: 'ai' | 'rules' }> {
  const rules = extractRequestWithRules(text, now);
  if (!apiKey) return { fields: rules, via: 'rules' };
  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 300,
      output_config: { effort: 'low' },
      system:
        'Extract travel-request fields from the user message. Reply with ONLY JSON: ' +
        '{"originCity":string|null,"destinationCity":string|null,"date":"YYYY-MM-DD"|null,' +
        '"timeOfDay":"morning"|"midday"|"night"|null,"travelers":int|null,"bags":int|null,' +
        '"preference":"cheapest"|"fastest"|"easiest"|null,"wantsHotel":bool}. ' +
        `Today is ${now.toISOString().slice(0, 10)} (${WEEKDAYS[now.getDay()]}). ` +
        'Use null for anything the user did not say — never guess.',
      messages: [{ role: 'user', content: text.slice(0, 2000) }],
    });
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = validAiFields(JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)));
    if (!parsed) return { fields: rules, via: 'rules' };
    return { fields: parsed, via: 'ai' };
  } catch {
    return { fields: rules, via: 'rules' };
  }
}
