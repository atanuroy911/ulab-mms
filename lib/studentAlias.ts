// Student IDs start with a 2-digit admission batch/year, e.g. "25101234" is batch 25.
// Auto-categorize treats batch 25 and any later batch (26, 27, ...) as alias candidates.
const ALIAS_BATCH_THRESHOLD = 25;

export function getStudentBatch(studentId: string): number | null {
  const match = studentId.trim().match(/^(\d{2})/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

export function isAliasBatchCandidate(studentId: string): boolean {
  const batch = getStudentBatch(studentId);
  return batch !== null && batch >= ALIAS_BATCH_THRESHOLD;
}
