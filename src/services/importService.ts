/**
 * Trip import from pasted confirmation text (Step 2).
 *
 * Extraction runs through Claude (structured JSON, validated field by
 * field) when a key is configured, with a pure regex extractor as the
 * no-key fallback — flight numbers, IATA codes, dates, and confirmation
 * codes are all regex-able. Nothing is ever invented: missing fields stay
 * null, low-confidence fields get flagged, and nothing is saved until the
 * traveler confirms on the review screen.
 */

import Anthropic from '@anthropic-ai/sdk';

import { AIRPORTS } from '../data/airports';

const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

export interface ImportedTripFields {
  originAirportCode: string | null;
  destinationAirportCode: string | null;
  airlineCode: string | null;
  flightNumber: string | null; // "DL 1232"
  departureDate: string | null; // YYYY-MM-DD
  confirmationCode: string | null;
  hotelName: string | null;
}

export interface ImportResult {
  fields: ImportedTripFields;
  /** 0–1 per field; the review screen flags anything below 0.7. */
  confidence: Partial<Record<keyof ImportedTripFields, number>>;
  source: 'ai' | 'rules';
}

export const EMPTY_FIELDS: ImportedTripFields = {
  originAirportCode: null,
  destinationAirportCode: null,
  airlineCode: null,
  flightNumber: null,
  departureDate: null,
  confirmationCode: null,
  hotelName: null,
};

// ---------------------------------------------------------------------------
// Regex extractor — deterministic, keyless, never invents.
// ---------------------------------------------------------------------------

const AIRLINE_CODES = new Set([
  'AA', 'DL', 'UA', 'WN', 'B6', 'AS', 'NK', 'F9', 'HA', 'G4', 'SY', 'BA', 'LH', 'AF', 'KL', 'EK', 'QR',
]);
const IATA = new Set(AIRPORTS.map((a) => a.code));

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Find a departure date in common confirmation formats → YYYY-MM-DD. */
export function extractDate(text: string): string | null {
  // 2026-07-25
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // 07/25/2026 (US order)
  const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (us) return `${us[3]}-${pad(Number(us[1]))}-${pad(Number(us[2]))}`;
  // "Jul 25, 2026" / "July 25 2026" / "25 Jul 2026"
  const mdY = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/);
  if (mdY) {
    const m = MONTHS[mdY[1].slice(0, 3).toLowerCase()];
    if (m) return `${mdY[3]}-${pad(m)}-${pad(Number(mdY[2]))}`;
  }
  const dMY = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/);
  if (dMY) {
    const m = MONTHS[dMY[2].slice(0, 3).toLowerCase()];
    if (m) return `${dMY[3]}-${pad(m)}-${pad(Number(dMY[1]))}`;
  }
  return null;
}

export function extractWithRules(text: string): ImportResult {
  const fields: ImportedTripFields = { ...EMPTY_FIELDS };
  const confidence: ImportResult['confidence'] = {};

  // Flight number: known airline prefix + 1-4 digits.
  for (const m of text.matchAll(/\b([A-Z]{2})\s?(\d{1,4})\b/g)) {
    if (AIRLINE_CODES.has(m[1])) {
      fields.airlineCode = m[1];
      fields.flightNumber = `${m[1]} ${m[2]}`;
      confidence.flightNumber = 0.9;
      confidence.airlineCode = 0.9;
      break;
    }
  }

  // Airports: prefer explicit "JFK to MIA" / "JFK → MIA" / "JFK - MIA".
  const pair = text.match(/\b([A-Z]{3})\s*(?:to|→|–|-|>)\s*([A-Z]{3})\b/);
  if (pair && IATA.has(pair[1]) && IATA.has(pair[2])) {
    fields.originAirportCode = pair[1];
    fields.destinationAirportCode = pair[2];
    confidence.originAirportCode = 0.85;
    confidence.destinationAirportCode = 0.85;
  } else {
    // Fall back to the first two DISTINCT known codes in reading order —
    // order is a guess, so confidence is low.
    const seen: string[] = [];
    for (const m of text.matchAll(/\b([A-Z]{3})\b/g)) {
      if (IATA.has(m[1]) && !seen.includes(m[1])) seen.push(m[1]);
      if (seen.length === 2) break;
    }
    if (seen.length === 2) {
      fields.originAirportCode = seen[0];
      fields.destinationAirportCode = seen[1];
      confidence.originAirportCode = 0.5;
      confidence.destinationAirportCode = 0.5;
    }
  }

  fields.departureDate = extractDate(text);
  if (fields.departureDate) confidence.departureDate = 0.75;

  // Confirmation / record locator: 6-char airline PNR or labeled code.
  const labeled = text.match(
    /(?:confirmation|record locator|booking reference|conf(?:irmation)?\s*(?:code|number|#)?)[:\s#]*([A-Z0-9]{5,8})\b/i,
  );
  if (labeled) {
    fields.confirmationCode = labeled[1].toUpperCase();
    confidence.confirmationCode = 0.85;
  }

  // Hotel: a line naming a property.
  const hotelLine = text
    .split(/\n/)
    .map((l) => l.trim())
    .find((l) => /\b(hotel|inn|resort|suites|lodge|hyatt|marriott|hilton)\b/i.test(l) && l.length < 80);
  if (hotelLine) {
    fields.hotelName = hotelLine.replace(/^(hotel|property)[:\s]+/i, '').trim();
    confidence.hotelName = 0.6;
  }

  return { fields, confidence, source: 'rules' };
}

// ---------------------------------------------------------------------------
// AI extractor (validated) with rules fallback.
// ---------------------------------------------------------------------------

function validAiFields(raw: Record<string, unknown>): ImportedTripFields | undefined {
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const code = (v: unknown): string | null => {
    const s = str(v)?.toUpperCase() ?? null;
    return s && IATA.has(s) ? s : null;
  };
  const date = (v: unknown): string | null => {
    const s = str(v);
    return s && /^20\d{2}-\d{2}-\d{2}$/.test(s) ? s : null;
  };
  return {
    originAirportCode: code(raw.originAirportCode),
    destinationAirportCode: code(raw.destinationAirportCode),
    airlineCode: str(raw.airlineCode)?.toUpperCase().slice(0, 2) ?? null,
    flightNumber: str(raw.flightNumber),
    departureDate: date(raw.departureDate),
    confirmationCode: str(raw.confirmationCode)?.toUpperCase() ?? null,
    hotelName: str(raw.hotelName),
  };
}

export async function extractTrip(text: string): Promise<ImportResult> {
  const rules = extractWithRules(text);
  if (!apiKey) return rules;
  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 400,
      output_config: { effort: 'low' },
      system:
        'Extract travel-confirmation fields. Reply with ONLY JSON: {"originAirportCode":string|null,"destinationAirportCode":string|null,"airlineCode":string|null,"flightNumber":string|null,"departureDate":"YYYY-MM-DD"|null,"confirmationCode":string|null,"hotelName":string|null,"confidenceByField":{field:number 0-1}}. NEVER invent a value — null when absent or unsure.',
      messages: [{ role: 'user', content: text.slice(0, 6000) }],
    });
    const out = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)) as Record<string, unknown>;
    const fields = validAiFields(parsed);
    if (!fields) return rules;
    const conf = (parsed.confidenceByField ?? {}) as Record<string, number>;
    const confidence: ImportResult['confidence'] = {};
    for (const k of Object.keys(fields) as Array<keyof ImportedTripFields>) {
      if (fields[k] !== null) confidence[k] = typeof conf[k] === 'number' ? Math.max(0, Math.min(1, conf[k])) : 0.6;
    }
    return { fields, confidence, source: 'ai' };
  } catch {
    return rules;
  }
}
