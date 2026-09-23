/**
 * Estimated total time for a recipe, in minutes.
 *
 * TheMealDB has no prep/cook time field, so this reads the method text and
 * adds up the durations it mentions ("simmer for 20 minutes", "bake 1 hour
 * 30 mins", "marinate overnight"). It's an estimate: steps that happen at
 * the same time are counted twice, and unstated steps aren't counted at all.
 * Returns null when the method mentions no durations.
 */

const NUMBER = String.raw`(\d+(?:[.,]\d+)?|a|an|one|two|three|four|five|six|ten|fifteen|twenty|thirty|forty|forty-five|half an?)`;
const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, 'half a': 0.5, 'half an': 0.5
};

// "20 minutes", "5-6 mins", "1 to 2 hours", "1½ hrs", "an hour", "half an hour"
const DURATION = new RegExp(
  String.raw`\b${NUMBER}(?:\s*(?:½|\.5))?(?:\s*(?:-|–|to|or)\s*${NUMBER})?\s*(hours?|hrs?|minutes?|mins?)\b`,
  'gi'
);
const OVERNIGHT = /\bovernight\b/i;
const OVERNIGHT_MINUTES = 8 * 60;
const MAX_MINUTES = 24 * 60;

function toNumber(text: string | undefined): number {
  if (!text) return NaN;
  const lower = text.toLowerCase();
  if (lower in WORDS) return WORDS[lower];
  return Number(lower.replace(',', '.'));
}

export function estimateCookMinutes(instructions: string | null | undefined): number | null {
  if (!instructions) return null;
  let total = 0;
  let found = false;

  for (const match of instructions.matchAll(DURATION)) {
    const [whole, low, high, unit] = match;
    // For a range ("5-6 minutes") use the upper end
    let amount = toNumber(high) || toNumber(low);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (/½|\.5/.test(whole) && !/[.,]/.test(low)) amount += 0.5;
    const minutes = /^h/i.test(unit) ? amount * 60 : amount;
    // "cook for 400 minutes" is almost certainly a typo or an oven temperature misread
    if (minutes > MAX_MINUTES) continue;
    total += minutes;
    found = true;
  }

  if (OVERNIGHT.test(instructions)) {
    total += OVERNIGHT_MINUTES;
    found = true;
  }

  if (!found) return null;
  // Round to the nearest 5 minutes; an estimate shouldn't look precise
  return Math.min(MAX_MINUTES, Math.max(5, Math.round(total / 5) * 5));
}

/** Filter buckets, shared by the index queries and the API. */
export const TIME_BUCKETS = {
  under30: { label: 'Under 30 min', min: 0, max: 30 },
  '30to60': { label: '30–60 min', min: 31, max: 60 },
  over60: { label: 'Over 1 hour', min: 61, max: Number.MAX_SAFE_INTEGER }
} as const;

export type TimeBucket = keyof typeof TIME_BUCKETS;
