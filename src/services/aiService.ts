/**
 * A2Z AI Concierge — turns the computed route + choices into a curated,
 * ChatGPT-style travel plan for the exact start and end points given.
 *
 * LIVE: calls Claude (Anthropic API) when EXPO_PUBLIC_ANTHROPIC_API_KEY is
 * set. ⚠ An EXPO_PUBLIC_* key ships in the browser bundle — fine for a
 * personal demo, but production should proxy this call through a backend
 * so the key stays server-side.
 *
 * FALLBACK: without a key, a deterministic concierge writes the plan from
 * the same computed data, so the feature works out of the box.
 */

import Anthropic from '@anthropic-ai/sdk';

import type { HotelOption, RouteOption, ServiceResult, TripSearch, WeatherCondition } from '../types';
import { formatDuration, formatMoney, formatTime } from '../utils/time';

const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

export function aiConfigured(): boolean {
  return apiKey.length > 0;
}

interface ConciergeInput {
  search: TripSearch;
  route: RouteOption;
  hotel?: HotelOption;
  originWeather?: WeatherCondition;
  destinationWeather?: WeatherCondition;
}

function describeTrip(input: ConciergeInput): string {
  const { search, route, hotel } = input;
  const steps = route.timeline
    .map((s) => `${formatTime(s.time)} — ${s.title}${s.subtitle ? ` (${s.subtitle})` : ''}`)
    .join('\n');
  return [
    `Trip: ${search.origin.address} → ${search.destination.address}`,
    `Date: ${new Date(search.departureTime).toDateString()}, ${search.travelers} traveler(s), ${search.bags} bag(s)`,
    `Chosen plan: ${route.title} — ${formatDuration(route.totalDurationMinutes)}, ${formatMoney(route.totalPriceUsd)} total`,
    `Timeline:\n${steps}`,
    hotel ? `Hotel: ${hotel.name} (${hotel.area}, $${hotel.pricePerNightUsd}/night, ${hotel.distanceLabel})` : 'No hotel booked.',
    input.originWeather ? `Weather at origin: ${input.originWeather.summary}` : '',
    input.destinationWeather ? `Weather at destination: ${input.destinationWeather.summary}` : '',
    route.warnings.length > 0
      ? `Warnings: ${route.warnings.map((w) => w.message).join(' | ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Live Claude call — the real AI curation path. */
async function generateWithClaude(input: ConciergeInput): Promise<string> {
  const client = new Anthropic({
    apiKey,
    // Client-side call for the demo; move behind a backend for production.
    dangerouslyAllowBrowser: true,
  });

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1500,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    system:
      'You are the A2Z travel concierge. Given a computed door-to-door travel plan, write a short, warm, practical briefing for the traveler: what their day looks like, the two or three moments that need attention (cutoffs, transfers, weather), one local tip for the destination, and what to do if something slips. Use plain language, no markdown headers, under 220 words.',
    messages: [{ role: 'user', content: describeTrip(input) }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('Empty response');
  return text;
}

/** Deterministic fallback so the concierge works without an API key. */
function generateLocally(input: ConciergeInput): string {
  const { search, route, hotel } = input;
  const first = route.timeline[0];
  const last = route.timeline[route.timeline.length - 1];
  const critical = route.timeline.filter((s) => s.emphasis === 'critical').slice(1, 3);
  const wx = input.destinationWeather;

  const lines: string[] = [
    `Here's your day: leave ${search.origin.label ?? 'home'} at ${formatTime(first?.time ?? route.departureTime)} and you'll reach ${search.destination.label ?? 'your destination'} by ${formatTime(last?.time ?? route.arrivalTime)} — ${formatDuration(route.totalDurationMinutes)} door to door on ${route.title} for about ${formatMoney(route.totalPriceUsd)}.`,
  ];
  if (critical.length > 0) {
    lines.push(
      `The moments that matter: ${critical
        .map((s) => `${s.title.toLowerCase()} at ${formatTime(s.time)}`)
        .join(', and ')}. Build your day around those two times and everything else takes care of itself.`,
    );
  }
  if (route.warnings.length > 0) {
    lines.push(`Heads up: ${route.warnings[0].message}`);
  }
  if (wx) {
    lines.push(`On arrival expect ${wx.summary.toLowerCase()}.${wx.advisories[0] ? ` ${wx.advisories[0]}` : ''}`);
  }
  if (hotel) {
    lines.push(
      `You're staying at ${hotel.name} — ${hotel.distanceLabel.toLowerCase()}, so check-in is an easy finish to the day.`,
    );
  }
  if (route.backupPlans.length > 0) {
    lines.push(`If something slips: ${route.backupPlans[0].description}`);
  }
  return lines.join('\n\n');
}

export async function generateConciergePlan(
  input: ConciergeInput,
): Promise<ServiceResult<{ text: string; source: 'claude' | 'local' }>> {
  if (aiConfigured()) {
    try {
      const text = await generateWithClaude(input);
      return { ok: true, data: { text, source: 'claude' } };
    } catch {
      // Fall through to the local concierge — never leave the user planless.
    }
  }
  return { ok: true, data: { text: generateLocally(input), source: 'local' } };
}
