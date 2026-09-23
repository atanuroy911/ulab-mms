import Semester from '@/models/Semester';

/** Trims and collapses inner whitespace: "  Fall   2026 " -> "Fall 2026". */
export function cleanSemesterName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Matches a stored name equal to `name` ignoring case and spacing ("fall  2026" ~ "Fall 2026"). */
export function semesterNamePattern(name: string): RegExp {
  const escaped = cleanSemesterName(name)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/ /g, '\\s+');
  return new RegExp(`^\\s*${escaped}\\s*$`, 'i');
}

/**
 * Finds a semester whose name matches ignoring case and spacing, so "fall 2026" can't be
 * created next to "Fall 2026". The unique index on `name` only catches exact duplicates.
 */
export async function findSemesterByName(name: string, excludeId?: string) {
  return Semester.findOne({
    name: semesterNamePattern(name),
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });
}
