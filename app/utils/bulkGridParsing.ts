// Pure parsing/matching helpers for the multi-column bulk paste & Excel import flow.

export interface GridStudent {
  _id: string;
  studentId: string;
  name: string;
}

export type RowType = 'header' | 'metadata' | 'data';

/**
 * Splits raw pasted or sheet-derived text into a rectangular grid of cells.
 * Column position is preserved (empty cells are kept) so blank marks don't
 * shift subsequent columns out of alignment.
 */
export function splitIntoGrid(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.length > 0);
  const delimiter = lines.some(l => l.includes('\t')) ? '\t' : ',';
  return lines.map(line => line.split(delimiter).map(cell => cell.trim()));
}

/** Trims, collapses internal whitespace, and strips a single leading '-' (Excel paste artifact). */
export function normalizeId(raw: string): string {
  const trimmed = (raw || '').trim().replace(/\s+/g, ' ');
  return trimmed.startsWith('-') ? trimmed.slice(1).trim() : trimmed;
}

function normalizeName(raw: string): string {
  return (raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const DATE_RE = /^\d{1,2}[-/][A-Za-z0-9]{1,4}[-/]\d{2,4}$|^[A-Za-z]{3,9}\s+\d{1,2},?\s*\d{2,4}$/;

function looksLikeDate(cell: string): boolean {
  if (!cell) return false;
  return DATE_RE.test(cell.trim()) || !isNaN(Date.parse(cell)) && /[A-Za-z]/.test(cell);
}

function looksLikeNumber(cell: string): boolean {
  if (!cell) return false;
  return !isNaN(parseFloat(cell)) && isFinite(Number(cell));
}

/**
 * Best-guess classification of a row as the header row, a metadata row (e.g. a
 * "Date" or "Points" row sitting between the header and actual student rows),
 * or a data row. This is only a default — the UI lets the user override it.
 */
export function classifyRow(cells: string[], idColIndex: number, rowIndex: number): RowType {
  if (rowIndex === 0) return 'header';

  const idCell = cells[idColIndex] || '';
  const otherCells = cells.filter((_, i) => i !== idColIndex && cells[i] !== undefined && cells[i] !== '');

  if (otherCells.length === 0) return 'metadata';

  const dateCount = otherCells.filter(looksLikeDate).length;
  const numberCount = otherCells.filter(looksLikeNumber).length;

  const idLooksNumeric = looksLikeNumber(normalizeId(idCell));

  if (!idLooksNumeric && (dateCount === otherCells.length || numberCount === otherCells.length)) {
    return 'metadata';
  }

  return 'data';
}

/**
 * Normalizes an exam/column header for fuzzy comparison: lowercase, trimmed,
 * whitespace-collapsed, punctuation stripped.
 */
function normalizeHeader(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Suggests an existing exam whose displayName best matches a pasted column
 * header. Returns the exam _id on an exact or high-confidence match, else null.
 */
export function suggestExamMatch(header: string, exams: { _id: string; displayName: string }[]): string | null {
  const normalizedHeader = normalizeHeader(header);
  if (!normalizedHeader) return null;

  let bestMatch: { _id: string; score: number } | null = null;

  for (const exam of exams) {
    const normalizedName = normalizeHeader(exam.displayName);
    if (!normalizedName) continue;

    let score = 0;
    if (normalizedName === normalizedHeader) {
      score = 100;
    } else if (normalizedName.includes(normalizedHeader) || normalizedHeader.includes(normalizedName)) {
      score = Math.min(normalizedName.length, normalizedHeader.length) / Math.max(normalizedName.length, normalizedHeader.length) * 90;
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { _id: exam._id, score };
    }
  }

  return bestMatch && bestMatch.score >= 50 ? bestMatch._id : null;
}

/** Column headers commonly present in Google Classroom exports that are never mark columns. */
const NON_MARK_HEADER_PATTERNS = [
  /^last\s*name$/i,
  /^first\s*name$/i,
  /^email/i,
  /^grade$/i,
  /^assignment\s*state$/i,
  /^comments?$/i,
  /^date$/i,
  /^points?$/i,
  /^name$/i,
  /^student\s*id$/i,
  /^id$/i,
];

export function isLikelyNonMarkColumn(header: string): boolean {
  const trimmed = (header || '').trim();
  return NON_MARK_HEADER_PATTERNS.some(re => re.test(trimmed));
}

/**
 * Matches a pasted row to a student. Tries a normalized-ID match first; if
 * that fails, falls back to a case-insensitive name match.
 */
export function matchStudent(
  idCellRaw: string,
  nameCellsRaw: string[],
  students: GridStudent[]
): GridStudent | undefined {
  const normalizedId = normalizeId(idCellRaw);
  if (normalizedId) {
    const byId = students.find(s => normalizeId(s.studentId) === normalizedId);
    if (byId) return byId;
  }

  const joinedName = normalizeName(nameCellsRaw.filter(Boolean).join(' '));
  if (!joinedName) return undefined;

  return students.find(s => normalizeName(s.name) === joinedName);
}

/**
 * Computes CO-mark breakdown for a raw mark, mirroring the all-or-nothing
 * heuristic used across the bulk paste flows: full marks distribute across
 * configured CO max marks, zero marks zero out every CO, anything else is
 * left for manual CO entry.
 */
export function computeCoMarks(
  rawMarkNum: number,
  numberOfCOs: number,
  totalMarks: number,
  examMaxMarks?: number[]
): { coMarks?: number[]; nonCoMark?: number } {
  if (numberOfCOs <= 0) return {};

  if (rawMarkNum === totalMarks) {
    const coMarks = Array.from({ length: numberOfCOs }, (_, i) => {
      const coMax = examMaxMarks?.[i];
      return coMax !== undefined && coMax > 0 ? coMax : 0;
    });
    const configured = examMaxMarks && examMaxMarks.slice(0, numberOfCOs).some(m => m > 0);
    return configured ? { coMarks } : {};
  }

  if (rawMarkNum === 0) {
    return { coMarks: new Array(numberOfCOs).fill(0), nonCoMark: 0 };
  }

  return {};
}
