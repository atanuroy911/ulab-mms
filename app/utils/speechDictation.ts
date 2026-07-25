// Utilities for parsing spoken text into numbers and voice commands
// used by the "Add Marks via Dictation" flow.

const ONES: Record<string, number> = {
  zero: 0, oh: 0, no: 0, none: 0, nil: 0, skip: 0,
  one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5,
  six: 6, seven: 7, eight: 8, ate: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const SCALES: Record<string, number> = {
  hundred: 100,
};

/** Words that mean "this field has no value / enter zero". */
const ZERO_WORDS = new Set(['zero', 'none', 'nil', 'skip', 'nothing', 'blank']);

/** Words that mean "commit the current field and move to the next one". */
const NEXT_WORDS = new Set(['next', 'done', 'confirm', 'ok', 'okay', 'submit']);

/** Words that mean "I misspoke, let me redo this field". */
const REPEAT_WORDS = new Set(['repeat', 'redo', 'again', 'undo', 'clear', 'reset']);

/** Words that mean "go back to the previous field/step". */
const BACK_WORDS = new Set(['back', 'previous']);

export type SpokenCommand = 'next' | 'repeat' | 'back' | null;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Detects a navigation command in a spoken phrase, e.g. "next", "repeat", "back". */
export function detectCommand(text: string): SpokenCommand {
  const norm = normalize(text);
  const words = norm.split(' ');
  const last = words[words.length - 1];
  if (NEXT_WORDS.has(norm) || NEXT_WORDS.has(last)) return 'next';
  if (REPEAT_WORDS.has(norm) || REPEAT_WORDS.has(last)) return 'repeat';
  if (BACK_WORDS.has(norm) || BACK_WORDS.has(last)) return 'back';
  return null;
}

/**
 * Parses a spoken phrase into a numeric value.
 * Handles plain digits ("85", "8 5"), number words ("eighty five"),
 * decimals ("eighty five point five"), and zero-words ("none", "skip" -> 0).
 * Returns null if no number could be extracted.
 */
export function parseSpokenNumber(text: string): number | null {
  const norm = normalize(text);
  if (!norm) return null;

  if (ZERO_WORDS.has(norm)) return 0;

  // Direct digit form, e.g. "85", "85.5" - browsers often return this verbatim.
  const digitMatch = norm.match(/-?\d+(\.\d+)?/);
  if (digitMatch && /^-?\d+(\.\d+)?$/.test(norm)) {
    return parseFloat(digitMatch[0]);
  }

  // Split "point"/"decimal" for fractional part, e.g. "eighty five point five"
  const pointSplit = norm.split(/\bpoint\b|\bdecimal\b/);
  const wholePart = wordsToNumber(pointSplit[0].trim());
  if (wholePart === null) {
    // Fall back: maybe it's a mixed string containing a digit somewhere
    return digitMatch ? parseFloat(digitMatch[0]) : null;
  }

  if (pointSplit.length > 1 && pointSplit[1].trim()) {
    const fractionalWords = pointSplit[1].trim().split(' ');
    const fractionalDigits = fractionalWords.map(w => {
      if (/^\d$/.test(w)) return w;
      const val = ONES[w];
      return val !== undefined && val <= 9 ? String(val) : '';
    }).join('');
    if (fractionalDigits) {
      return parseFloat(`${wholePart}.${fractionalDigits}`);
    }
  }

  return wholePart;
}

/** A single spoken value that names its own target field. */
export interface FieldDirective {
  field: 'raw' | 'nonco' | `co-${number}`;
  value: string;
}

/**
 * Parses one spoken phrase that names its own field, e.g. "CO1 is 24",
 * "co2 24", "raw is 50", "mark 50", "non co is 3". Lets the user fill in
 * fields by pausing between them and naming each one, in any order,
 * instead of only accepting a bare number for whatever step is focused.
 * Returns null if the phrase isn't a field directive (falls back to
 * treating it as a plain number for the current step).
 */
export function parseFieldDirective(text: string): FieldDirective | null {
  const norm = normalize(text);
  if (!norm) return null;

  const coMatch = norm.match(/^co\s*(\d+)\s*(?:is|=)?\s*([\w.]+)$/);
  if (coMatch) {
    const num = parseSpokenNumber(coMatch[2]);
    if (num !== null) return { field: `co-${parseInt(coMatch[1], 10) - 1}`, value: String(num) };
  }

  const nonCoMatch = norm.match(/^non\s*co\s*(?:is|=)?\s*([\w.]+)$/);
  if (nonCoMatch) {
    const num = parseSpokenNumber(nonCoMatch[1]);
    if (num !== null) return { field: 'nonco', value: String(num) };
  }

  const rawMatch = norm.match(/^(?:raw|mark|marks|score)\s*(?:is|=|of)?\s*([\w.]+)$/);
  if (rawMatch) {
    const num = parseSpokenNumber(rawMatch[1]);
    if (num !== null) return { field: 'raw', value: String(num) };
  }

  return null;
}

function wordsToNumber(phrase: string): number | null {
  if (!phrase) return null;
  const words = phrase.split(' ').filter(Boolean);
  if (words.length === 0) return null;

  let total = 0;
  let current = 0;
  let matchedAny = false;

  for (const word of words) {
    if (/^\d+$/.test(word)) {
      current += parseInt(word, 10);
      matchedAny = true;
    } else if (word in ONES) {
      current += ONES[word];
      matchedAny = true;
    } else if (word in TENS) {
      current += TENS[word];
      matchedAny = true;
    } else if (word in SCALES) {
      current = (current || 1) * SCALES[word];
      matchedAny = true;
    } else if (word === 'and') {
      continue;
    } else {
      // Unrecognized word breaks the number sequence
      continue;
    }
  }

  total += current;
  return matchedAny ? total : null;
}
