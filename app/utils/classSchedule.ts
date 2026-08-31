import { addDays, format } from 'date-fns';

// Typical total class count for a semester, used to stop projecting "missed class" dates once
// the course would realistically be over - without this, the missed-class count keeps growing
// indefinitely past the end of the semester (e.g. over a break, or after the course wrapped).
export const THEORY_CLASS_CAP = 24;
export const LAB_CLASS_CAP = 12;

export function getClassSessionCap(courseType?: 'Theory' | 'Lab'): number {
  return courseType === 'Lab' ? LAB_CLASS_CAP : THEORY_CLASS_CAP;
}

/** Randomly splits `total` into `parts` positive integers that sum to exactly `total` (requires
 *  total >= parts). Used to fill in a per-topic session breakdown from just the overall count. */
export function randomPartition(total: number, parts: number): number[] {
  if (parts <= 1) return [total];
  const cuts = new Set<number>();
  while (cuts.size < parts - 1) {
    cuts.add(1 + Math.floor(Math.random() * (total - 1)));
  }
  const boundaries = [0, ...Array.from(cuts).sort((a, b) => a - b), total];
  const result: number[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    result.push(boundaries[i] - boundaries[i - 1]);
  }
  return result;
}

/**
 * Dates matching the course's configured weekly class days, between the first session and today,
 * that have no session at all - i.e. classes that appear to have been skipped. Stops counting
 * once the total number of scheduled class-day occurrences (held + missed) reaches the course's
 * typical class cap, so a course past its semester doesn't accumulate endless "missed" days.
 */
export function computeMissedClassDates(
  firstSessionDate: Date,
  sessionDateKeys: Set<string>,
  classDays: string[] | undefined,
  courseType?: 'Theory' | 'Lab',
  today: Date = new Date()
): Date[] {
  if (!classDays || classDays.length === 0) return [];

  const cap = getClassSessionCap(courseType);
  const missed: Date[] = [];
  let scheduledCount = 0;
  let cursor = firstSessionDate;
  let guard = 0;

  while (cursor <= today && scheduledCount < cap && guard < 3660) {
    guard++;
    if (classDays.includes(format(cursor, 'EEEE'))) {
      scheduledCount++;
      const key = format(cursor, 'yyyy-MM-dd');
      if (!sessionDateKeys.has(key)) {
        missed.push(cursor);
      }
    }
    cursor = addDays(cursor, 1);
  }

  return missed;
}
