/**
 * Deterministic airport-departure engine (no AI, no guessing).
 *
 * Given the flight, the route to the airport, and the traveler's own
 * profile (bags, TSA PreCheck, CLEAR, personal buffer), produces a
 * recommended leave-home time with EVERY adjustment itemized, so the UI
 * can show exactly why: "Leave by 3:52 PM — includes 41 min of current
 * traffic, a 15-min uncertainty buffer, and a 2h airport lead time."
 */

export interface DepartureRecommendationInput {
  scheduledDepartureAt: Date;
  estimatedDepartureAt?: Date | null;
  routeDurationMinutes: number;
  routeTrafficDurationMinutes?: number | null;
  isInternational: boolean;
  hasTsaPrecheck: boolean;
  hasClear: boolean;
  checksBag: boolean;
  airportArrivalPreferenceMinutes?: number | null;
  routeConfidence: 'high' | 'medium' | 'low';
  /** Replaces the 120/180-min base lead time (e.g. the user's own airport
   * buffer from Settings). Adjustments and floors still apply. */
  baseLeadOverrideMinutes?: number | null;
  /** Replaces the confidence-derived uncertainty buffer when set. */
  uncertaintyOverrideMinutes?: number | null;
}

export interface DepartureFactor {
  label: string;
  value: string;
  impactMinutes?: number;
}

export interface DepartureRecommendationOutput {
  recommendedLeaveAt: Date;
  targetAirportArrivalAt: Date;
  airportLeadTimeMinutes: number;
  routeTimeMinutes: number;
  uncertaintyBufferMinutes: number;
  explanation: string;
  factors: DepartureFactor[];
}

const DOMESTIC_BASE_MINUTES = 120;
const INTERNATIONAL_BASE_MINUTES = 180;
const CHECKED_BAG_MINUTES = 20;
const PRECHECK_SAVINGS_MINUTES = -15;
const CLEAR_SAVINGS_MINUTES = -5;
/** Lead time never drops below this, no matter how many programs you have. */
const SAFE_MINIMUM_LEAD_MINUTES = 75;
/** International floor is higher — document checks can't be pre-cleared. */
const INTERNATIONAL_MINIMUM_LEAD_MINUTES = 120;
const CONFIDENCE_BUFFER: Record<DepartureRecommendationInput['routeConfidence'], number> = {
  high: 5,
  medium: 10,
  low: 20,
};

function fmt(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function recommendDeparture(
  input: DepartureRecommendationInput,
): DepartureRecommendationOutput {
  const factors: DepartureFactor[] = [];

  // Effective departure: use a verified estimate when it's LATER than
  // scheduled, but never leave later just because the flight is delayed —
  // airlines can and do claw delays back, so the airport target stays
  // anchored to the earlier of scheduled/estimated for safety.
  const scheduled = input.scheduledDepartureAt;
  const estimated = input.estimatedDepartureAt ?? undefined;
  const effectiveDepartureAt =
    estimated && estimated.getTime() < scheduled.getTime() ? estimated : scheduled;
  if (estimated && estimated.getTime() > scheduled.getTime()) {
    factors.push({
      label: 'Flight delay',
      value: `Estimated ${fmt(estimated)} vs scheduled ${fmt(scheduled)} — keeping the original timing in case the delay shrinks`,
      impactMinutes: 0,
    });
  }

  // Airport lead time: base + itemized adjustments, floored at the safe minimum.
  const defaultBase = input.isInternational ? INTERNATIONAL_BASE_MINUTES : DOMESTIC_BASE_MINUTES;
  const baseOverride = input.baseLeadOverrideMinutes ?? undefined;
  let lead = baseOverride ?? defaultBase;
  factors.push({
    label: input.isInternational ? 'International flight' : 'Domestic flight',
    value:
      baseOverride !== undefined && baseOverride !== defaultBase
        ? `${lead} min airport lead time (your setting; default ${defaultBase})`
        : `${lead} min base airport lead time`,
    impactMinutes: lead,
  });
  if (input.checksBag) {
    lead += CHECKED_BAG_MINUTES;
    factors.push({ label: 'Checked bag', value: 'Bag-drop line and cutoff', impactMinutes: CHECKED_BAG_MINUTES });
  }
  if (input.hasTsaPrecheck) {
    lead += PRECHECK_SAVINGS_MINUTES;
    factors.push({ label: 'TSA PreCheck', value: 'Shorter security line', impactMinutes: PRECHECK_SAVINGS_MINUTES });
  }
  if (input.hasClear) {
    lead += CLEAR_SAVINGS_MINUTES;
    factors.push({ label: 'CLEAR', value: 'Front of the ID check', impactMinutes: CLEAR_SAVINGS_MINUTES });
  }
  if (input.airportArrivalPreferenceMinutes) {
    lead += input.airportArrivalPreferenceMinutes;
    factors.push({
      label: 'Your preference',
      value: `${input.airportArrivalPreferenceMinutes > 0 ? 'Extra' : 'Less'} personal buffer`,
      impactMinutes: input.airportArrivalPreferenceMinutes,
    });
  }
  const floor = input.isInternational ? INTERNATIONAL_MINIMUM_LEAD_MINUTES : SAFE_MINIMUM_LEAD_MINUTES;
  if (lead < floor) {
    factors.push({
      label: 'Safety floor',
      value: `Lead time raised to the ${floor}-min ${input.isInternational ? 'international' : ''} safe minimum`.replace('  ', ' '),
      impactMinutes: floor - lead,
    });
    lead = floor;
  }

  // Route time: live traffic duration when available, otherwise baseline.
  const traffic = input.routeTrafficDurationMinutes ?? undefined;
  const routeTime = Math.max(traffic ?? input.routeDurationMinutes, input.routeDurationMinutes);
  if (traffic !== undefined && traffic > input.routeDurationMinutes) {
    factors.push({
      label: 'Current traffic',
      value: `${traffic - input.routeDurationMinutes} min slower than usual`,
      impactMinutes: traffic - input.routeDurationMinutes,
    });
  }

  // Uncertainty buffer scales with how much we trust the route estimate,
  // unless the user set their own preference in Settings.
  const buffer = input.uncertaintyOverrideMinutes ?? CONFIDENCE_BUFFER[input.routeConfidence];
  factors.push({
    label:
      input.uncertaintyOverrideMinutes != null
        ? 'Your uncertainty setting'
        : `Route confidence: ${input.routeConfidence}`,
    value: `${buffer} min uncertainty buffer`,
    impactMinutes: buffer,
  });

  const targetAirportArrivalAt = new Date(effectiveDepartureAt.getTime() - lead * 60_000);
  const recommendedLeaveAt = new Date(
    targetAirportArrivalAt.getTime() - (routeTime + buffer) * 60_000,
  );

  const explanation =
    `Leave by ${fmt(recommendedLeaveAt)}. That covers ${routeTime} min to the airport` +
    (traffic !== undefined && traffic > input.routeDurationMinutes
      ? ` (including ${traffic - input.routeDurationMinutes} min of current traffic)`
      : '') +
    `, a ${buffer}-min uncertainty buffer, and arriving ${Math.round(lead / 60) >= 1 ? `${(lead / 60).toFixed(1).replace(/\.0$/, '')}h` : `${lead} min`} before departure.`;

  return {
    recommendedLeaveAt,
    targetAirportArrivalAt,
    airportLeadTimeMinutes: lead,
    routeTimeMinutes: routeTime,
    uncertaintyBufferMinutes: buffer,
    explanation,
    factors,
  };
}

/**
 * Plain-English comparison when the recommendation moves — the "what
 * changed" sentence: "Your recommended departure time moved from 3:34 PM
 * to 3:52 PM because traffic added 18 minutes." Returns undefined when
 * the move is under the meaningful-change threshold (10 min).
 */
export function describeDepartureChange(
  previous: DepartureRecommendationOutput,
  next: DepartureRecommendationOutput,
): string | undefined {
  const deltaMin = Math.round(
    (next.recommendedLeaveAt.getTime() - previous.recommendedLeaveAt.getTime()) / 60_000,
  );
  if (Math.abs(deltaMin) < 10) return undefined;
  const trafficDelta = next.routeTimeMinutes - previous.routeTimeMinutes;
  const reason =
    Math.abs(trafficDelta) >= 5
      ? trafficDelta > 0
        ? `traffic added ${trafficDelta} minutes`
        : `traffic eased by ${-trafficDelta} minutes`
      : 'your flight timing changed';
  return `Your recommended departure time moved from ${fmt(previous.recommendedLeaveAt)} to ${fmt(next.recommendedLeaveAt)} because ${reason}.`;
}
