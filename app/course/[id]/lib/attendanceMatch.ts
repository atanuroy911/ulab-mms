export interface RosterStudent {
  _id: string;
  studentId: string;
  name: string;
}

export interface RawCandidate {
  /** The original text this candidate was parsed from, shown to the teacher for review. */
  rawText: string;
  extractedId?: string;
  /** True if extractedId ends in an ellipsis/truncation marker in the source text. */
  extractedIdTruncated?: boolean;
  extractedName?: string;
}

export type MatchStatus = 'matched' | 'ambiguous' | 'unmatched';

export interface MatchResult {
  candidate: RawCandidate;
  status: MatchStatus;
  /** The chosen/best-guess student. For 'ambiguous', this is the top-ranked option (still needs confirmation). */
  student?: RosterStudent;
  /** Other plausible candidates, used to populate an override picker for ambiguous/unmatched rows. */
  alternatives: RosterStudent[];
}

const ID_TRUNCATION_SUFFIX = /\.{2,}$|…$/;
// "Name (ID)" or "Name (ID...)" - the common Meet caption format shown under a tile or in the participant list.
const NAME_WITH_ID_PATTERN = /^(.*?)\(([^()]*)\)\s*$/;
// A bare ID: digits, possibly hyphenated, optionally cut off with an ellipsis.
const BARE_ID_PATTERN = /^[0-9][0-9-]{2,}(\.{2,}|…)?$/;

function stripTrailingIcons(text: string): string {
  // OCR sometimes reads a trailing mic/pin icon as stray punctuation; trim leftover junk characters.
  return text.replace(/[|•·»«]+$/g, '').trim();
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bmd\.?\b/g, 'md')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits raw OCR text (or pasted text) into individual candidate lines/tokens. */
export function parseCandidates(rawText: string): RawCandidate[] {
  const lines = rawText
    .split(/\r?\n|,(?=\s*[A-Za-z0-9])/)
    .map((line) => stripTrailingIcons(line.trim()))
    .filter((line) => line.length > 1);

  const candidates: RawCandidate[] = [];

  for (const line of lines) {
    const nameIdMatch = line.match(NAME_WITH_ID_PATTERN);
    if (nameIdMatch) {
      const name = nameIdMatch[1].trim();
      const idPart = nameIdMatch[2].trim();
      const truncated = ID_TRUNCATION_SUFFIX.test(idPart);
      const cleanId = idPart.replace(ID_TRUNCATION_SUFFIX, '').trim();

      candidates.push({
        rawText: line,
        extractedName: name || undefined,
        extractedId: cleanId || undefined,
        extractedIdTruncated: truncated,
      });
      continue;
    }

    if (BARE_ID_PATTERN.test(line)) {
      const truncated = ID_TRUNCATION_SUFFIX.test(line);
      candidates.push({
        rawText: line,
        extractedId: line.replace(ID_TRUNCATION_SUFFIX, '').trim(),
        extractedIdTruncated: truncated,
      });
      continue;
    }

    // Otherwise treat the whole line as a name.
    candidates.push({
      rawText: line,
      extractedName: line,
    });
  }

  return candidates;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const currRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow.push(
        Math.min(
          currRow[j - 1] + 1, // insertion
          prevRow[j] + 1, // deletion
          prevRow[j - 1] + cost // substitution
        )
      );
    }
    prevRow = currRow;
  }

  return prevRow[b.length];
}

/** 0..1, where 1 is an exact match. */
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

const SIMILARITY_THRESHOLD = 0.75;
const AMBIGUITY_MARGIN = 0.05;

function matchById(candidate: RawCandidate, roster: RosterStudent[]): MatchResult | null {
  if (!candidate.extractedId) return null;
  const normalizedId = candidate.extractedId.toLowerCase();

  const exact = roster.filter((s) => s.studentId.trim().toLowerCase() === normalizedId);
  if (exact.length === 1) {
    return { candidate, status: 'matched', student: exact[0], alternatives: [] };
  }

  if (candidate.extractedIdTruncated) {
    const prefixMatches = roster.filter((s) => s.studentId.trim().toLowerCase().startsWith(normalizedId));
    if (prefixMatches.length === 1) {
      return { candidate, status: 'matched', student: prefixMatches[0], alternatives: [] };
    }
    if (prefixMatches.length > 1) {
      return { candidate, status: 'ambiguous', student: prefixMatches[0], alternatives: prefixMatches.slice(1) };
    }
  }

  return null;
}

function matchByName(candidate: RawCandidate, roster: RosterStudent[]): MatchResult | null {
  if (!candidate.extractedName) return null;
  const normalizedCandidate = normalizeName(candidate.extractedName);
  if (!normalizedCandidate) return null;

  const exact = roster.filter((s) => normalizeName(s.name) === normalizedCandidate);
  if (exact.length === 1) {
    return { candidate, status: 'matched', student: exact[0], alternatives: [] };
  }

  const candidateTokens = new Set(normalizedCandidate.split(' ').filter(Boolean));
  const tokenSubsetMatches = roster.filter((s) => {
    const rosterTokens = new Set(normalizeName(s.name).split(' ').filter(Boolean));
    const isSubset = (small: Set<string>, big: Set<string>) => [...small].every((t) => big.has(t));
    return (
      candidateTokens.size > 0 &&
      rosterTokens.size > 0 &&
      (isSubset(candidateTokens, rosterTokens) || isSubset(rosterTokens, candidateTokens))
    );
  });
  if (tokenSubsetMatches.length === 1) {
    return { candidate, status: 'matched', student: tokenSubsetMatches[0], alternatives: [] };
  }
  if (tokenSubsetMatches.length > 1) {
    const ranked = [...tokenSubsetMatches].sort(
      (a, b) => similarity(normalizeName(b.name), normalizedCandidate) - similarity(normalizeName(a.name), normalizedCandidate)
    );
    return { candidate, status: 'ambiguous', student: ranked[0], alternatives: ranked.slice(1) };
  }

  const scored = roster
    .map((s) => ({ student: s, score: similarity(normalizeName(s.name), normalizedCandidate) }))
    .filter((entry) => entry.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const best = scored[0];
  const runnerUp = scored[1];
  if (!runnerUp || best.score - runnerUp.score >= AMBIGUITY_MARGIN) {
    return { candidate, status: 'matched', student: best.student, alternatives: scored.slice(1).map((e) => e.student) };
  }

  return {
    candidate,
    status: 'ambiguous',
    student: best.student,
    alternatives: scored.slice(1).map((e) => e.student),
  };
}

/** Matches OCR/paste candidates against the course roster. ID matches take priority over name matches. */
export function matchStudents(candidates: RawCandidate[], roster: RosterStudent[]): MatchResult[] {
  return candidates.map((candidate) => {
    const byId = matchById(candidate, roster);
    if (byId) return byId;

    const byName = matchByName(candidate, roster);
    if (byName) return byName;

    return { candidate, status: 'unmatched', alternatives: [] };
  });
}

/** De-dupes results that resolved (or were confirmed) to the same student, keeping the first occurrence. */
export function dedupeByStudent(results: MatchResult[]): MatchResult[] {
  const seen = new Set<string>();
  const deduped: MatchResult[] = [];

  for (const result of results) {
    if (result.student) {
      if (seen.has(result.student._id)) continue;
      seen.add(result.student._id);
    }
    deduped.push(result);
  }

  return deduped;
}
