import ExcelJS from 'exceljs';

// Parses a hand-filled CO-PO course-file gradesheet (every real-world example we've seen is a
// copy of this system's own Sample CO PO.xlsx template, filled in by hand) into a normalized,
// review-ready structure. Nothing here writes to the database - this is a pure, side-effect-free
// read of an uploaded workbook. Every anchor below was chosen by empirically inspecting 9 real
// hand-filled files cell-by-cell; see the "Import Course File (Alpha)" plan for the audit this
// was built from. Anything that varied between files is *searched for*, never assumed at a fixed
// coordinate - only the handful of offsets confirmed identical across every file are hard-coded.

export class CourseFileParseError extends Error {}

export interface ParsedStudent {
  studentId: string;
  name: string;
}

export interface ParsedAssessment {
  label: string;
  weightage: number | null;
  totalMarksGuess: number;
  rawMarksByStudentId: Record<string, number>;
  /** Best-guess exam category/type from the assessment's label text - a default for the wizard, not a final decision. */
  suggestedCategory: 'Quiz' | 'Assignment' | 'Project' | 'Attendance' | 'MainExam' | 'ClassPerformance' | 'Others';
  suggestedExamType: 'midterm' | 'final' | 'labFinal' | 'oel' | 'custom';
  /** Best-guess CO-PO group match (by label similarity), if any - null means "no CO tracking suggested". */
  suggestedCoGroupLabel: string | null;
}

export interface CoPoGroup {
  label: string;
  /** Up to 6 entries, one per CO; null where the cell was blank. */
  maxMarks: (number | null)[];
  marksByStudentId: Record<string, (number | null)[]>;
}

export interface ParsedMeta {
  courseCode: string | null;
  courseTitle: string | null;
  credit: number | null;
  instructor: string | null;
  section: string | null;
  semester: string | null;
  looksLikeBlankTemplate: boolean;
}

export interface ParsedCourseFile {
  meta: ParsedMeta;
  warnings: string[];
  students: ParsedStudent[];
  assessments: ParsedAssessment[];
  coGroups: CoPoGroup[];
  attainmentThresholdPct: number | null;
}

const META_LABELS = ['Course Code', 'Course Title', 'Credit', 'Instructor', 'Section', 'Semester'] as const;

// Known signature of an unfilled copy of this system's own blank template (Sample CO PO.xlsx) -
// two of the nine real example files turned out to be exactly this, with zero students.
const BLANK_TEMPLATE_TITLE = 'operating systems';
const BLANK_TEMPLATE_INSTRUCTOR = 'rubaiya hafiz';
const BLANK_TEMPLATE_CODE = 'cse';

function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const obj = v as { result?: unknown; richText?: { text: string }[] };
    if ('result' in obj) return typeof obj.result === 'string' ? obj.result : null;
    if (Array.isArray(obj.richText)) return obj.richText.map((r) => r.text).join('');
  }
  return null;
}

function cellValue(sheet: ExcelJS.Worksheet, row: number, col: number): string | number | null {
  const raw = sheet.getCell(row, col).value;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' || typeof raw === 'number') return raw;
  if (typeof raw === 'object') {
    const obj = raw as { result?: unknown; richText?: { text: string }[] };
    if ('result' in obj) {
      const r = obj.result;
      return typeof r === 'string' || typeof r === 'number' ? r : null;
    }
    if (Array.isArray(obj.richText)) return obj.richText.map((t) => t.text).join('');
  }
  return null;
}

function numOrNull(v: string | number | null): number | null {
  if (v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function strEquals(v: string | number | null, target: string): boolean {
  return typeof v === 'string' && v.trim().toLowerCase() === target.toLowerCase();
}

function strIncludes(v: string | number | null, target: string): boolean {
  return typeof v === 'string' && v.trim().toLowerCase().includes(target.toLowerCase());
}

function findSheet(workbook: ExcelJS.Workbook, pattern: RegExp): ExcelJS.Worksheet | null {
  for (const ws of workbook.worksheets) {
    const normalized = ws.name.toLowerCase().replace(/[\s_-]/g, '');
    if (pattern.test(normalized)) return ws;
  }
  return null;
}

function extractMeta(sheet: ExcelJS.Worksheet): Omit<ParsedMeta, 'looksLikeBlankTemplate'> {
  const found: Partial<Record<(typeof META_LABELS)[number], string | number | null>> = {};
  for (let r = 1; r <= 6; r++) {
    for (let c = 1; c <= 14; c++) {
      const v = cellValue(sheet, r, c);
      if (typeof v !== 'string') continue;
      for (const label of META_LABELS) {
        if (strEquals(v, label) && found[label] === undefined) {
          found[label] = cellValue(sheet, r, c + 1);
        }
      }
    }
  }
  return {
    courseCode: found['Course Code'] !== undefined && found['Course Code'] !== null ? String(found['Course Code']).trim() : null,
    courseTitle: found['Course Title'] !== undefined && found['Course Title'] !== null ? String(found['Course Title']).trim() : null,
    credit: numOrNull(found['Credit'] ?? null),
    instructor: found['Instructor'] !== undefined && found['Instructor'] !== null ? String(found['Instructor']).trim() : null,
    section: found['Section'] !== undefined && found['Section'] !== null ? String(found['Section']).trim() : null,
    semester: found['Semester'] !== undefined && found['Semester'] !== null ? String(found['Semester']).trim() : null,
  };
}

function looksLikeBlankTemplate(meta: Omit<ParsedMeta, 'looksLikeBlankTemplate'>): boolean {
  const title = (meta.courseTitle || '').trim().toLowerCase();
  const instructor = (meta.instructor || '').trim().toLowerCase();
  const code = (meta.courseCode || '').trim().toLowerCase();
  return title === BLANK_TEMPLATE_TITLE && instructor === BLANK_TEMPLATE_INSTRUCTOR && code === BLANK_TEMPLATE_CODE;
}

interface AssessmentBlock {
  startCol: number;
  endCol: number;
  names: { col: number; name: string }[];
}

/** Row 8 always holds the assessment names, row 9 the weights, row 10+ the marks - only the
 *  column span differs between files (observed: 6-9 columns, starting anywhere from L to P). */
function findAssessmentBlock(sheet: ExcelJS.Worksheet): AssessmentBlock | null {
  const row = 8;
  let startCol: number | null = null;
  for (let c = 11; c <= 60; c++) {
    const v = cellValue(sheet, row, c);
    if (typeof v === 'string' && v.trim() !== '') {
      startCol = c;
      break;
    }
  }
  if (startCol === null) return null;

  const names: { col: number; name: string }[] = [];
  let c = startCol;
  while (c <= startCol + 20) {
    const v = cellValue(sheet, row, c);
    if (typeof v !== 'string' || v.trim() === '') break;
    if (/student.*id/i.test(v) || /^name$/i.test(v.trim())) break;
    names.push({ col: c, name: v.trim() });
    c++;
  }
  if (names.length === 0) return null;
  return { startCol, endCol: startCol + names.length - 1, names };
}

interface RosterSource {
  students: ParsedStudent[];
  /** True if any cell read here came from an unresolved (uncached) formula rather than a literal value. */
  hadUncachedFormulas: boolean;
}

function readRoster(sheet: ExcelJS.Worksheet, idCol: number, nameCol: number | null, startRow: number, maxRows: number): RosterSource {
  const students: ParsedStudent[] = [];
  let hadUncachedFormulas = false;
  for (let r = startRow; r < startRow + maxRows; r++) {
    const idCell = sheet.getCell(r, idCol);
    const isFormulaCell = typeof idCell.value === 'object' && idCell.value !== null && 'formula' in (idCell.value as object);
    const idVal = cellValue(sheet, r, idCol);
    if (isFormulaCell && idVal === null) hadUncachedFormulas = true;
    if (idVal === null || String(idVal).trim() === '') break;
    const nameVal = nameCol !== null ? cellValue(sheet, r, nameCol) : null;
    students.push({ studentId: String(idVal).trim(), name: nameVal !== null ? String(nameVal).trim() : '' });
  }
  return { students, hadUncachedFormulas };
}

/** Looks for a "Student ID"/"Name" header pair in row 9, to the right of the assessment block -
 *  column position AND left/right order both vary between files, and are sometimes present but empty. */
function findDuplicateRosterHeaders(sheet: ExcelJS.Worksheet, afterCol: number): { idCol: number | null; nameCol: number | null } {
  let idCol: number | null = null;
  let nameCol: number | null = null;
  for (let c = afterCol + 1; c <= afterCol + 10; c++) {
    const v = cellValue(sheet, 9, c);
    if (typeof v !== 'string') continue;
    if (/student.*id/i.test(v)) idCol = c;
    else if (/^name$/i.test(v.trim())) nameCol = c;
  }
  return { idCol, nameCol };
}

interface MarksDistributionRow {
  label: string;
  value: number | null;
}

/** Scans for the literal "Assessment"/"Marks Distribution" header pair - seen at rows anywhere
 *  from 31 to 71 across real files, never at a fixed row. */
function findMarksDistribution(sheet: ExcelJS.Worksheet): MarksDistributionRow[] | null {
  for (let r = 1; r <= 100; r++) {
    const a = cellValue(sheet, r, 2);
    const b = cellValue(sheet, r, 3);
    if (strEquals(a, 'Assessment') && strIncludes(b, 'Marks Distribution')) {
      const rows: MarksDistributionRow[] = [];
      for (let rr = r + 1; rr <= r + 20; rr++) {
        const label = cellValue(sheet, rr, 2);
        if (label === null) break;
        rows.push({ label: String(label).trim(), value: numOrNull(cellValue(sheet, rr, 3)) });
        if (strEquals(label, 'Total')) break;
      }
      return rows;
    }
  }
  return null;
}

const CO_GROUP_COLUMNS = [4, 10, 16, 22]; // D, J, P, V - identical across every file inspected

/** Locates the "Student ID" student-grid header on the CO-PO sheet (row 14 in most files, row 20
 *  in a different template generation) by scanning, then derives every other row from it. */
function findCoPoStudentGridHeaderRow(sheet: ExcelJS.Worksheet): number | null {
  for (let r = 1; r <= 40; r++) {
    const b = cellValue(sheet, r, 2);
    if (strIncludes(b, 'Student ID')) return r;
  }
  return null;
}

function parseAttainmentThreshold(text: string | number | null): number | null {
  if (typeof text !== 'string') return null;
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

const CATEGORY_RULES: { pattern: RegExp; category: ParsedAssessment['suggestedCategory']; examType?: ParsedAssessment['suggestedExamType'] }[] = [
  { pattern: /\bquiz\b/i, category: 'Quiz' },
  { pattern: /assign/i, category: 'Assignment' },
  { pattern: /\bmid/i, category: 'MainExam', examType: 'midterm' },
  { pattern: /lab.?final/i, category: 'MainExam', examType: 'labFinal' },
  { pattern: /\bfinal\b/i, category: 'MainExam', examType: 'final' },
  { pattern: /project|\boel\b|\bcep\b|open.?ended/i, category: 'Project' },
  { pattern: /attendance/i, category: 'Attendance' },
  { pattern: /perform|present/i, category: 'ClassPerformance' },
];

function guessCategory(label: string): { category: ParsedAssessment['suggestedCategory']; examType: ParsedAssessment['suggestedExamType'] } {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(label)) {
      return { category: rule.category, examType: rule.examType || 'custom' };
    }
  }
  return { category: 'Others', examType: 'custom' };
}

// "lab" is stripped along with the generic filler words: in a Lab-course file nearly every label
// contains it ("Lab Submission", "Lab Test", "Lab Final", "Open Ended Lab", "Continuous Lab
// Performance"), so leaving it in makes every pair look related - it carries no discriminating
// signal here even though it would elsewhere.
function normalizeForMatch(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(exam|marks|the|lab)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Suggestion-only similarity - a wrong guess just means the wizard's dropdown defaults to
 *  something the teacher has to correct instead of confirm, never a silent misimport. Rewards
 *  exact/substring matches (handles "Mid" -> "Midterm Exam") over loose single-word overlap
 *  (which would otherwise false-positive on generic shared words). */
function labelSimilarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length >= 3 && nb.includes(na)) return 0.9;
  if (nb.length >= 3 && na.includes(nb)) return 0.9;

  const ta = na.split(' ').filter(Boolean);
  const tb = nb.split(' ').filter(Boolean);
  let matched = 0;
  for (const x of ta) {
    if (tb.some((y) => x === y || (x.length >= 3 && y.startsWith(x)) || (y.length >= 3 && x.startsWith(y)))) {
      matched++;
    }
  }
  return matched / Math.max(ta.length, tb.length);
}

function bestCoGroupMatch(assessmentLabel: string, groups: CoPoGroup[]): string | null {
  let best: { label: string; score: number } | null = null;
  for (const g of groups) {
    if (!g.label) continue;
    const score = labelSimilarity(assessmentLabel, g.label);
    if (score > 0 && (!best || score > best.score)) best = { label: g.label, score };
  }
  return best && best.score >= 0.5 ? best.label : null;
}

export async function parseCourseFile(buffer: Buffer): Promise<ParsedCourseFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const gradeSheet = findSheet(workbook, /^gradesheet$/);
  const coPoSheet = findSheet(workbook, /co.?po.?attainment/);

  if (!gradeSheet) {
    throw new CourseFileParseError('No "GradeSheet" sheet found - this doesn\'t look like a CO-PO course file.');
  }
  if (!coPoSheet) {
    throw new CourseFileParseError('No "CO_PO_AttainmentAnalysis" sheet found - this doesn\'t look like a CO-PO course file.');
  }

  const warnings: string[] = [];
  const metaRaw = extractMeta(gradeSheet);
  const meta: ParsedMeta = { ...metaRaw, looksLikeBlankTemplate: looksLikeBlankTemplate(metaRaw) };

  if (meta.looksLikeBlankTemplate) {
    throw new CourseFileParseError(
      'This file looks like an unfilled copy of the blank CO-PO template (course "CSE" / "Operating Systems" / "Rubaiya Hafiz") - nothing to import.'
    );
  }

  // --- Roster ---
  const block = findAssessmentBlock(gradeSheet);
  const primary = readRoster(gradeSheet, 2, 3, 10, 80);
  const dupHeaders = block ? findDuplicateRosterHeaders(gradeSheet, block.endCol) : { idCol: null, nameCol: null };
  const duplicate = dupHeaders.idCol
    ? readRoster(gradeSheet, dupHeaders.idCol, dupHeaders.nameCol, 10, 80)
    : { students: [], hadUncachedFormulas: false };

  let roster: ParsedStudent[];
  if (primary.students.length > 0 && !primary.hadUncachedFormulas) {
    roster = primary.students;
  } else if (duplicate.students.length > 0) {
    roster = duplicate.students;
    if (primary.students.length > 0) {
      warnings.push('Used the right-hand ID/Name columns instead of the main roster - the main roster referenced another sheet or cell this importer couldn\'t follow.');
    }
  } else if (primary.students.length > 0) {
    // Formula-linked but at least resolved to something.
    roster = primary.students;
    warnings.push('Some roster cells reference formulas without a cached value - the roster may be incomplete. Please double-check the student list.');
  } else {
    roster = [];
  }

  if (roster.length === 0) {
    throw new CourseFileParseError('No students found on the GradeSheet - please check the file has a filled-in roster before importing.');
  }

  // --- Marks-distribution table (category -> declared weightage) ---
  const distribution = findMarksDistribution(gradeSheet);
  if (!distribution) {
    warnings.push('Could not find the "Assessment / Marks Distribution" table - weightages will need to be entered manually.');
  }

  // --- CO-PO groups (up to 4: columns D, J, P, V) ---
  const hdrRow = findCoPoStudentGridHeaderRow(coPoSheet);
  const coGroups: CoPoGroup[] = [];
  let attainmentThresholdPct: number | null = null;

  if (hdrRow) {
    const groupLabelRow = hdrRow - 2;
    const maxMarksRow = hdrRow;
    attainmentThresholdPct = parseAttainmentThreshold(cellValue(coPoSheet, maxMarksRow, 40)); // column AN

    for (const groupCol of CO_GROUP_COLUMNS) {
      const label = cellValue(coPoSheet, groupLabelRow, groupCol);
      if (typeof label !== 'string' || label.trim() === '') continue;

      const maxMarks: (number | null)[] = [];
      for (let cc = groupCol; cc <= groupCol + 5; cc++) {
        maxMarks.push(numOrNull(cellValue(coPoSheet, maxMarksRow, cc)));
      }

      const marksByStudentId: Record<string, (number | null)[]> = {};
      for (let r = hdrRow + 1; r <= hdrRow + 70; r++) {
        const idVal = cellValue(coPoSheet, r, 2);
        if (idVal === null || String(idVal).trim() === '') break;
        const studentId = String(idVal).trim();
        const marks: (number | null)[] = [];
        for (let cc = groupCol; cc <= groupCol + 5; cc++) {
          marks.push(numOrNull(cellValue(coPoSheet, r, cc)));
        }
        marksByStudentId[studentId] = marks;
      }

      coGroups.push({ label: label.trim(), maxMarks, marksByStudentId });
    }
  } else {
    warnings.push('Could not find the CO-PO student grid - CO marks will not be imported (exams will still import with raw marks only).');
  }

  // --- Assessments: GradeSheet's assessment block is the source of raw marks; CO groups are
  //     attached where the label similarity is close enough (always a suggestion, wizard-editable). ---
  const rosterIds = new Set(roster.map((s) => s.studentId));
  const assessments: ParsedAssessment[] = [];

  if (block) {
    for (const { col, name } of block.names) {
      const weightage = numOrNull(cellValue(gradeSheet, 9, col));
      const rawMarksByStudentId: Record<string, number> = {};
      let maxObserved = 0;

      // Marks live in the same rows as whichever roster source we ended up using, but the
      // assessment block's own rows always start at 10 regardless of which roster was authoritative -
      // so read positionally against row 10+ and correlate by the roster's own row order isn't safe
      // once we've fallen back to a different column; instead read by row against the roster that
      // was actually read from columns B/C's row range (roster rows are always 10-based too).
      for (let i = 0; i < roster.length; i++) {
        const r = 10 + i;
        const mark = numOrNull(cellValue(gradeSheet, r, col));
        if (mark !== null) {
          rawMarksByStudentId[roster[i].studentId] = mark;
          if (mark > maxObserved) maxObserved = mark;
        }
      }

      const { category, examType } = guessCategory(name);
      const suggestedCoGroupLabel = bestCoGroupMatch(name, coGroups);

      assessments.push({
        label: name,
        weightage,
        totalMarksGuess: Math.max(1, Math.ceil(maxObserved)),
        rawMarksByStudentId,
        suggestedCategory: category,
        suggestedExamType: examType,
        suggestedCoGroupLabel,
      });
    }
  } else {
    warnings.push('Could not find the assessment/weightage block on GradeSheet (expected around row 8) - no exams could be detected.');
  }

  // Sanity: CO group student IDs should intersect the roster - warn (not fail) if they don't,
  // since GradeSheet and CO-PO sheet were read independently and matched by ID.
  for (const group of coGroups) {
    const groupIds = Object.keys(group.marksByStudentId);
    const overlap = groupIds.filter((id) => rosterIds.has(id)).length;
    if (groupIds.length > 0 && overlap === 0) {
      warnings.push(`CO-PO group "${group.label}" has no student IDs matching the GradeSheet roster - its CO marks won't be attached to any exam.`);
    }
  }

  return {
    meta,
    warnings,
    students: roster,
    assessments,
    coGroups,
    attainmentThresholdPct,
  };
}
