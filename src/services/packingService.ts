/**
 * Packing list service (Phase 10 of the product brief).
 *
 * AI generates suggestions from destination + dates + weather + bag
 * situation, as STRUCTURED output that is validated before anything is
 * shown — an invalid or unavailable model response falls back to a
 * deterministic rules engine, clearly labeled as such. User-added items
 * and packed state survive regeneration. No airline baggage policies are
 * invented: warnings say when a rule is unverified.
 */

import Anthropic from '@anthropic-ai/sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { WeatherCondition } from '../types';

const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

export interface PackingItem {
  id: string;
  category: string;
  name: string;
  quantity: number;
  reason: string;
  essential: boolean;
  packed: boolean;
  source: 'ai' | 'rules' | 'user';
}

export interface PackingList {
  tripId: string;
  summary: string;
  items: PackingItem[];
  weatherWarnings: string[];
  baggageWarnings: string[];
  generatedBy: 'ai' | 'rules';
  generatedAt: string;
}

export interface PackingInput {
  tripId: string;
  destination: string;
  nights: number;
  travelers: number;
  purpose?: string;
  checksBag: boolean;
  weather?: WeatherCondition;
}

// ---------------------------------------------------------------------------
// Validation of the model's structured output — nothing unvalidated renders.
// ---------------------------------------------------------------------------

interface RawPayload {
  summary?: unknown;
  categories?: unknown;
  weatherWarnings?: unknown;
  baggageWarnings?: unknown;
}

function validatePayload(raw: RawPayload): {
  summary: string;
  items: Array<Omit<PackingItem, 'id' | 'packed' | 'source'>>;
  weatherWarnings: string[];
  baggageWarnings: string[];
} | undefined {
  if (typeof raw.summary !== 'string' || !Array.isArray(raw.categories)) return undefined;
  const items: Array<Omit<PackingItem, 'id' | 'packed' | 'source'>> = [];
  for (const cat of raw.categories as Array<{ name?: unknown; items?: unknown }>) {
    if (typeof cat?.name !== 'string' || !Array.isArray(cat.items)) return undefined;
    for (const it of cat.items as Array<Record<string, unknown>>) {
      if (
        typeof it?.name !== 'string' ||
        typeof it?.quantity !== 'number' ||
        !Number.isInteger(it.quantity) ||
        it.quantity <= 0 ||
        it.quantity > 30 ||
        typeof it?.reason !== 'string' ||
        typeof it?.essential !== 'boolean'
      ) {
        return undefined;
      }
      items.push({
        category: cat.name,
        name: it.name,
        quantity: it.quantity,
        reason: it.reason,
        essential: it.essential,
      });
    }
  }
  if (items.length === 0 || items.length > 80) return undefined;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 6) : [];
  return {
    summary: raw.summary,
    items,
    weatherWarnings: strings(raw.weatherWarnings),
    baggageWarnings: strings(raw.baggageWarnings),
  };
}

// ---------------------------------------------------------------------------
// Deterministic rules engine — the honest fallback.
// ---------------------------------------------------------------------------

function rulesList(input: PackingInput): PackingList {
  const n = Math.max(1, input.nights);
  const wet = (input.weather?.precipChance ?? 0) >= 40;
  const hot = (input.weather?.tempF ?? 70) >= 82;
  const cold = (input.weather?.tempF ?? 70) <= 45;
  const items: Array<Omit<PackingItem, 'id' | 'packed' | 'source'>> = [
    { category: 'Essentials', name: 'ID / passport', quantity: 1, reason: 'Required to fly', essential: true },
    { category: 'Essentials', name: 'Phone charger', quantity: 1, reason: 'Daily use', essential: true },
    { category: 'Essentials', name: 'Medications', quantity: 1, reason: 'Keep in your carry-on', essential: true },
    { category: 'Clothing', name: 'Shirts/tops', quantity: Math.min(n + 1, 8), reason: `${n} night${n === 1 ? '' : 's'} + one spare`, essential: true },
    { category: 'Clothing', name: 'Underwear & socks', quantity: Math.min(n + 1, 9), reason: 'One per day + spare', essential: true },
    { category: 'Clothing', name: 'Comfortable walking shoes', quantity: 1, reason: 'City distances add up', essential: true },
    { category: 'Toiletries', name: 'Toiletry kit', quantity: 1, reason: input.checksBag ? 'Full sizes OK in a checked bag' : 'Carry-on: containers must be 3.4 oz / 100 ml or less', essential: true },
  ];
  if (wet) items.push({ category: 'Weather', name: 'Compact umbrella or rain shell', quantity: 1, reason: `${Math.round(input.weather?.precipChance ?? 0)}% chance of rain in the forecast`, essential: true });
  if (hot) items.push({ category: 'Weather', name: 'Sunscreen', quantity: 1, reason: `Forecast around ${Math.round(input.weather?.tempF ?? 0)}°F`, essential: false });
  if (cold) items.push({ category: 'Weather', name: 'Warm layer / coat', quantity: 1, reason: `Forecast around ${Math.round(input.weather?.tempF ?? 0)}°F`, essential: true });
  if ((input.purpose ?? '') === 'work') items.push({ category: 'Work', name: 'Laptop + charger', quantity: 1, reason: 'Work trip', essential: true });

  return {
    tripId: input.tripId,
    summary: `${n}-night trip to ${input.destination}${input.weather ? ` — ${input.weather.summary.toLowerCase()}` : ''}. Basics below; adjust for your plans.`,
    items: items.map((it, i) => ({ ...it, id: `rule-${i}`, packed: false, source: 'rules' as const })),
    weatherWarnings: wet ? ['Rain is likely — pack waterproof outerwear.'] : [],
    baggageWarnings: [
      input.checksBag
        ? 'Airline bag fees and weight limits vary — not verified here; check your airline.'
        : 'Carry-on only: liquids over 3.4 oz / 100 ml will be confiscated at security.',
    ],
    generatedBy: 'rules',
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// AI path (validated) with rules fallback.
// ---------------------------------------------------------------------------

export async function generatePackingList(input: PackingInput): Promise<PackingList> {
  if (!apiKey) return rulesList(input);
  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1200,
      output_config: { effort: 'low' },
      system:
        'You generate travel packing lists. Reply with ONLY JSON: {"summary":string,"categories":[{"name":string,"items":[{"name":string,"quantity":int,"reason":string,"essential":bool}]}],"weatherWarnings":[string],"baggageWarnings":[string]}. Practical items only — never restricted/dangerous goods, never medical advice, never invented airline baggage policies (if unknown, say so in baggageWarnings). 15-30 items.',
      messages: [
        {
          role: 'user',
          content:
            `Destination: ${input.destination}. Nights: ${input.nights}. Travelers: ${input.travelers}. ` +
            `Purpose: ${input.purpose ?? 'unspecified'}. Bag: ${input.checksBag ? 'checked bag' : 'carry-on only'}. ` +
            `Forecast: ${input.weather ? `${input.weather.summary}, ~${Math.round(input.weather.tempF)}°F, ${Math.round(input.weather.precipChance)}% precip` : 'unknown'}.`,
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = validatePayload(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
    if (!parsed) return rulesList(input);
    return {
      tripId: input.tripId,
      summary: parsed.summary,
      items: parsed.items.map((it, i) => ({ ...it, id: `ai-${i}`, packed: false, source: 'ai' as const })),
      weatherWarnings: parsed.weatherWarnings,
      baggageWarnings: parsed.baggageWarnings,
      generatedBy: 'ai',
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return rulesList(input);
  }
}

/** Regenerate suggestions but keep the user's own items and packed state. */
export function mergeRegenerated(previous: PackingList, next: PackingList): PackingList {
  const packedByName = new Map(previous.items.map((i) => [i.name.toLowerCase(), i.packed]));
  const userItems = previous.items.filter((i) => i.source === 'user');
  return {
    ...next,
    items: [
      ...next.items.map((i) => ({ ...i, packed: packedByName.get(i.name.toLowerCase()) ?? false })),
      ...userItems,
    ],
  };
}

// ---------------------------------------------------------------------------
// Persistence (AsyncStorage — survives reloads on this device).
// ---------------------------------------------------------------------------

const KEY = '@a2z/packing-lists';

export async function getStoredPackingList(tripId: string): Promise<PackingList | undefined> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, PackingList>) : {};
    return all[tripId];
  } catch {
    return undefined;
  }
}

export async function storePackingList(list: PackingList): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, PackingList>) : {};
    all[list.tripId] = list;
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage full/unavailable — the in-memory list still renders
  }
}
