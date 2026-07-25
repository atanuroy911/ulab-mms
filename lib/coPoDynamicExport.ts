/* eslint-disable @typescript-eslint/no-explicit-any */
// Dynamic (student-count-independent) CO-PO course file export.
//
// The original "beta" export (app/api/courses/[id]/export-file/route.ts) writes into a
// template whose GradeSheet/CO_PO_AttainmentAnalysis sheets have a hardcoded 50-student
// block (rows 10-59 / 15-64) with formulas below that for class averages, grade
// distribution, etc. Growing that block for a bigger class means inserting rows and
// re-pointing every downstream formula - and xlsx-populate (the library the beta export
// uses) can't insert/shift rows at all.
//
// This module instead: (1) computes every student-count-dependent value in JS from the DB
// (marks, CO/PO attainment, class averages, distribution counts) exactly like the beta
// export's inline resolvers do, then (2) uses ExcelJS to physically grow/shrink the
// template's two dynamic sheets to the real student count and writes the computed values
// in as plain literals - never as formulas - so there is nothing left to "shift".
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { calculateLetterGrade, getGradeDisplay } from '@/app/utils/grading';
import { reinjectTemplateCharts } from '@/lib/xlsxChartReinject';

const TEMPLATE_STUDENT_COUNT = 50;
const GRADE_SHEET_FIRST_ROW = 10; // GradeSheet student rows start here (ends at 59 in the template)
const COPO_SHEET_FIRST_ROW = 15; // CO_PO_AttainmentAnalysis student rows start here (ends at 64)
const CO_ATTAINMENT_THRESHOLD = 0.55;
const PO_ATTAINMENT_THRESHOLD = 0.65;
const WITHDRAWN_GRADE_LABEL = 'W (Withdrawn)';

// ─── Mark computation (mirrors export-file/route.ts's resolvers) ─────────────────────────

function getMark(studentId: string, examId: string, marks: any[]) {
  return marks.find((m) => String(m.studentId) === String(studentId) && String(m.examId) === String(examId));
}

function getExamPercentage(rawMark: number, totalMarks: number) {
  if (!totalMarks || totalMarks <= 0) return 0;
  return (rawMark / totalMarks) * 100;
}

function getWeightedContribution(rawMark: number, totalMarks: number, weightage: number) {
  return (getExamPercentage(rawMark, totalMarks) * weightage) / 100;
}

function findMidtermExam(exams: any[]) {
  return exams.find((e) => e.examType === 'midterm' || e.displayName?.toLowerCase().includes('mid'));
}

function findFinalExam(exams: any[]) {
  return exams.find((e) => e.examType === 'final' || e.displayName?.toLowerCase().includes('final'));
}

function findProjectExam(exams: any[]) {
  return exams.find((e) => e.examCategory === 'Project');
}

function getMarkValue(student: any, exams: any[], marks: any[], category: string) {
  const exam = exams.find((e) => e.examCategory === category);
  if (!exam) return 0;
  const mark = getMark(student._id, exam._id, marks);
  if (!mark) return 0;
  return Math.round(getWeightedContribution(mark.rawMark, exam.totalMarks, exam.weightage || 0) * 100) / 100;
}

function getAggregatedMarkValue(student: any, exams: any[], marks: any[], category: 'Quiz' | 'Assignment', course: any) {
  const categoryExams = exams.filter((e) => e.examCategory === category);
  if (categoryExams.length === 0) return 0;

  const categoryMarks = categoryExams
    .map((exam) => getMark(student._id, exam._id, marks))
    .filter((mark) => mark !== undefined);

  if (categoryMarks.length === 0) return 0;

  const aggregationMethod = category === 'Quiz' ? course?.quizAggregation || 'average' : course?.assignmentAggregation || 'average';
  const categoryWeightage = category === 'Quiz' ? Number(course?.quizWeightage || 0) : Number(course?.assignmentWeightage || 0);

  if (aggregationMethod === 'best') {
    let bestMark = categoryMarks[0];
    let bestValue = -1;
    categoryMarks.forEach((mark) => {
      const exam = categoryExams.find((e) => String(e._id) === String(mark.examId));
      if (exam) {
        const percentage = getExamPercentage(mark.rawMark, exam.totalMarks);
        if (percentage > bestValue) {
          bestValue = percentage;
          bestMark = mark;
        }
      }
    });
    const bestExam = categoryExams.find((e) => String(e._id) === String(bestMark.examId));
    return bestExam ? getWeightedContribution(bestMark.rawMark, bestExam.totalMarks, categoryWeightage) : 0;
  }

  if (aggregationMethod === 'sum') {
    const sumRaw = categoryMarks.reduce((sum, mark) => sum + mark.rawMark, 0);
    const sumTotal = categoryMarks.reduce((sum, mark) => {
      const exam = categoryExams.find((e) => String(e._id) === String(mark.examId));
      return exam ? sum + exam.totalMarks : sum;
    }, 0);
    return sumTotal > 0 ? (getExamPercentage(sumRaw, sumTotal) * categoryWeightage) / 100 : 0;
  }

  const averagePercentage =
    categoryMarks.reduce((sum, mark) => {
      const exam = categoryExams.find((e) => String(e._id) === String(mark.examId));
      if (!exam) return sum;
      return sum + getExamPercentage(mark.rawMark, exam.totalMarks);
    }, 0) / categoryMarks.length;

  return (averagePercentage * categoryWeightage) / 100;
}

function getProjectAggregatedMarkValue(student: any, exams: any[], marks: any[], course: any) {
  const projectExams = exams.filter((e) => e.examCategory === 'Project');
  if (projectExams.length === 0) return 0;

  const projectMarks = projectExams
    .map((e) => ({ exam: e, mark: getMark(student._id, e._id, marks) }))
    .filter((x) => x.mark !== undefined);
  if (projectMarks.length === 0) return 0;

  const sumRaw = projectMarks.reduce((s, x) => s + Number(x.mark!.rawMark || 0), 0);
  const sumTotal = projectExams.reduce((s, e) => s + Number(e.totalMarks || 0), 0);
  const weighted = sumTotal > 0 ? (sumRaw / sumTotal) * Number(course?.projectWeightage || 0) : 0;
  return Math.round(weighted * 100) / 100;
}

function getMarkValueForExam(student: any, exam: any, marks: any[]) {
  if (!exam) return 0;
  const mark = getMark(student._id, exam._id, marks);
  return mark ? mark.rawMark : 0;
}

function getExamWeight(exams: any[], category: string) {
  const exam = exams.find((e) => e.examCategory === category);
  return exam ? exam.weightage || 0 : 0;
}

function getCOMarkValue(student: any, exam: any, marks: any[], coIndex: number) {
  if (!exam) return 0;
  const mark = getMark(student._id, exam._id, marks);
  return mark?.coMarks?.[coIndex] !== undefined ? mark.coMarks[coIndex] : 0;
}

// ─── Per-student computed row ─────────────────────────────────────────────────────────────

interface StudentRow {
  student: any;
  attendance: number;
  classPerformance: number;
  quiz: number;
  assignment: number;
  midterm: number;
  project: number;
  final: number;
  total: number;
  percent: number;
  gradeDisplay: string; // e.g. "A+ (Plus)", or the withdrawn label
  isWithdrawn: boolean;
  // CO raw marks per assessment (index 0-5 = CO1-CO6)
  coMidterm: number[];
  coFinal: number[];
  coProject: number[];
  // Derived CO/PO attainment
  coPercentage: number[]; // 0-1
  coAttained: number[]; // 0/1
  poPercentage: number[]; // 0-1, 12 entries
  poAttained: number[]; // 0/1, 12 entries
}

function computeStudentRows(
  course: any,
  students: any[],
  exams: any[],
  marks: any[],
): StudentRow[] {
  const midtermExam = findMidtermExam(exams);
  const finalExam = findFinalExam(exams);
  const projectExam = findProjectExam(exams);

  const coPoMapping: boolean[][] = course?.coPoMapping?.mapping || [];
  const maxMarks: Record<string, number[]> = course?.coPoMapping?.maxMarks || {};
  const midMax = midtermExam ? maxMarks[midtermExam._id.toString()] || [0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0];
  const finalMax = finalExam ? maxMarks[finalExam._id.toString()] || [0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0];
  const projectMax = projectExam ? maxMarks[projectExam._id.toString()] || [0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0];
  // "Total" max marks per CO across the three assessment types (mirrors CO_PO_AttainmentAnalysis!D7:I7)
  const coMaxTotal = [0, 1, 2, 3, 4, 5].map((i) => (midMax[i] || 0) + (finalMax[i] || 0) + (projectMax[i] || 0));
  // Number of COs mapped to each PO (mirrors AT9:BE9)
  const poMappedCoCount = Array.from({ length: 12 }, (_, po) =>
    coPoMapping.reduce((sum, coRow) => sum + (coRow?.[po] ? 1 : 0), 0)
  );

  return students.map((student) => {
    const attendance = getMarkValue(student, exams, marks, 'Attendance');
    const classPerformance = getMarkValue(student, exams, marks, 'ClassPerformance');
    const quiz = getAggregatedMarkValue(student, exams, marks, 'Quiz', course);
    const assignment = getAggregatedMarkValue(student, exams, marks, 'Assignment', course);
    const midterm = getMarkValueForExam(student, midtermExam, marks);
    const project = getProjectAggregatedMarkValue(student, exams, marks, course);
    const final = getMarkValueForExam(student, finalExam, marks);

    const total = Math.round(attendance + classPerformance + quiz + assignment + midterm + project + final);
    const percent = total / 100;
    const isWithdrawn = !!student.withdrawn;
    const gradeDisplay = isWithdrawn
      ? WITHDRAWN_GRADE_LABEL
      : getGradeDisplay(calculateLetterGrade(total, course?.gradingScale).letter, calculateLetterGrade(total, course?.gradingScale).modifier);

    const coMidterm = [0, 1, 2, 3, 4, 5].map((i) => getCOMarkValue(student, midtermExam, marks, i));
    const coFinal = [0, 1, 2, 3, 4, 5].map((i) => getCOMarkValue(student, finalExam, marks, i));
    const coProject = [0, 1, 2, 3, 4, 5].map((i) => getCOMarkValue(student, projectExam, marks, i));

    const coPercentage = [0, 1, 2, 3, 4, 5].map((i) => {
      const raw = coMidterm[i] + coFinal[i] + coProject[i];
      return coMaxTotal[i] > 0 ? raw / coMaxTotal[i] : 0;
    });
    const coAttained = coPercentage.map((pct) => (isWithdrawn ? 0 : pct >= CO_ATTAINMENT_THRESHOLD ? 1 : 0));

    const poPercentage = Array.from({ length: 12 }, (_, po) => {
      const denom = poMappedCoCount[po];
      if (!denom) return 0;
      const numerator = coPercentage.reduce((sum, pct, co) => sum + (coPoMapping[co]?.[po] ? pct : 0), 0);
      return numerator / denom;
    });
    const poAttained = poPercentage.map((pct) => (isWithdrawn ? 0 : pct >= PO_ATTAINMENT_THRESHOLD ? 1 : 0));

    return {
      student, attendance, classPerformance, quiz, assignment, midterm, project, final,
      total, percent, gradeDisplay, isWithdrawn,
      coMidterm, coFinal, coProject, coPercentage, coAttained, poPercentage, poAttained,
    };
  });
}

// ─── Workbook assembly ─────────────────────────────────────────────────────────────────────

async function resizeStudentBlock(worksheet: ExcelJS.Worksheet, firstRow: number, count: number) {
  const lastTemplateRow = firstRow + TEMPLATE_STUDENT_COUNT - 1;
  const delta = count - TEMPLATE_STUDENT_COUNT;
  if (delta > 0) {
    // Insert plain blank rows (not ExcelJS's duplicateRow) and copy only the *style* of the
    // last template row into them. duplicateRow() clones the row's formulas/shared-formula
    // metadata too, and that corrupts the workbook on save once the sheet has more rows than
    // the shared-formula group's original anchor - since every cell we care about is about
    // to be overwritten with a plain literal anyway, we never want that formula metadata in
    // the first place.
    const templateRow = worksheet.getRow(lastTemplateRow);
    const colCount = Math.max(worksheet.columnCount, templateRow.cellCount);
    const blankRows = Array.from({ length: delta }, () => [] as unknown[]);
    worksheet.spliceRows(lastTemplateRow + 1, 0, ...blankRows);
    for (let i = 0; i < delta; i++) {
      const newRow = worksheet.getRow(lastTemplateRow + 1 + i);
      newRow.height = templateRow.height;
      for (let c = 1; c <= colCount; c++) {
        const style = templateRow.getCell(c).style;
        if (style) newRow.getCell(c).style = { ...style };
      }
    }
  } else if (delta < 0) {
    worksheet.spliceRows(firstRow + count, -delta);
  }
  return delta; // rows below the (old) template block shift down/up by this amount
}

export async function buildDynamicCoPoWorkbook(params: {
  course: any;
  students: any[];
  exams: any[];
  marks: any[];
  attendanceSessions?: any[];
  instructorName: string;
}): Promise<Buffer> {
  const { course, students, exams, marks, instructorName } = params;
  const attendanceSessions = params.attendanceSessions || [];

  const templatePath = path.join(process.cwd(), 'public', 'templates', 'Sample CO PO.xlsx');
  if (!fs.existsSync(templatePath)) {
    throw new Error('Template not found');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const gradeSheet = workbook.getWorksheet('GradeSheet');
  const copoSheet = workbook.getWorksheet('CO_PO_AttainmentAnalysis');
  const courseSummarySheet = workbook.getWorksheet('CourseSummary');
  const cqiSheet = workbook.getWorksheet('ContinuousQualityImprovement');
  if (!gradeSheet || !copoSheet) {
    throw new Error('Template is missing required sheets');
  }

  const n = students.length;
  const rows = computeStudentRows(course, students, exams, marks);

  const gradeShift = await resizeStudentBlock(gradeSheet, GRADE_SHEET_FIRST_ROW, n);
  const copoShift = await resizeStudentBlock(copoSheet, COPO_SHEET_FIRST_ROW, n);

  // ── Header cells (unaffected by row count - always at fixed rows 2-5) ──
  gradeSheet.getCell('H2').value = course.code || '';
  gradeSheet.getCell('H3').value = course.name || '';
  gradeSheet.getCell('H4').value = course.courseType === 'Theory' ? 3 : 1;
  gradeSheet.getCell('H5').value = instructorName || '';
  gradeSheet.getCell('L2').value = course.section || '';
  gradeSheet.getCell('L3').value = `${course.semester} ${course.year}`.trim();

  // ── Per-student rows ──
  // Every column in the student block is written as a plain literal, including the ones
  // the template normally drives with row-relative formulas (A/B/C/D-J reference X/W/P-V of
  // the same row via Excel "shared formulas"). duplicateRow() clones those formulas as-is,
  // but the shared-formula group's anchor doesn't extend cleanly past the template's
  // original 50-row block, which corrupts the workbook on save once the class is bigger
  // than 50. Writing literals everywhere sidesteps that entirely.
  rows.forEach((row, index) => {
    const r = GRADE_SHEET_FIRST_ROW + index;
    gradeSheet.getCell(`A${r}`).value = index + 1;
    gradeSheet.getCell(`B${r}`).value = row.student.studentId || '';
    gradeSheet.getCell(`C${r}`).value = row.student.name || '';
    gradeSheet.getCell(`D${r}`).value = row.attendance;
    gradeSheet.getCell(`E${r}`).value = row.classPerformance;
    gradeSheet.getCell(`F${r}`).value = row.quiz;
    gradeSheet.getCell(`G${r}`).value = row.assignment;
    gradeSheet.getCell(`H${r}`).value = row.midterm;
    gradeSheet.getCell(`I${r}`).value = row.project;
    gradeSheet.getCell(`J${r}`).value = row.final;
    gradeSheet.getCell(`W${r}`).value = row.student.name || '';
    gradeSheet.getCell(`X${r}`).value = row.student.studentId || '';
    gradeSheet.getCell(`P${r}`).value = row.attendance;
    gradeSheet.getCell(`Q${r}`).value = row.classPerformance;
    gradeSheet.getCell(`R${r}`).value = row.quiz;
    gradeSheet.getCell(`S${r}`).value = row.assignment;
    gradeSheet.getCell(`T${r}`).value = row.midterm;
    gradeSheet.getCell(`U${r}`).value = row.project;
    gradeSheet.getCell(`V${r}`).value = row.final;
    gradeSheet.getCell(`K${r}`).value = row.total;
    gradeSheet.getCell(`L${r}`).value = row.percent;
    gradeSheet.getCell(`M${r}`).value = row.gradeDisplay;

    const cr = COPO_SHEET_FIRST_ROW + index;
    copoSheet.getCell(`A${cr}`).value = index + 1;
    copoSheet.getCell(`B${cr}`).value = row.student.studentId || '';
    copoSheet.getCell(`C${cr}`).value = row.student.name || '';
    ['D', 'E', 'F', 'G', 'H', 'I'].forEach((col, i) => { copoSheet.getCell(`${col}${cr}`).value = row.coMidterm[i]; });
    ['J', 'K', 'L', 'M', 'N', 'O'].forEach((col, i) => { copoSheet.getCell(`${col}${cr}`).value = row.coFinal[i]; });
    ['P', 'Q', 'R', 'S', 'T', 'U'].forEach((col, i) => { copoSheet.getCell(`${col}${cr}`).value = row.coProject[i]; });
    ['V', 'W', 'X', 'Y', 'Z', 'AA'].forEach(() => { /* Presentation - no data source, left at template default (0) */ });
    ['AB', 'AC', 'AD', 'AE', 'AF', 'AG'].forEach((col, i) => {
      copoSheet.getCell(`${col}${cr}`).value = row.coMidterm[i] + row.coFinal[i] + row.coProject[i];
    });
    ['AH', 'AI', 'AJ', 'AK', 'AL', 'AM'].forEach((col, i) => { copoSheet.getCell(`${col}${cr}`).value = row.coPercentage[i]; });
    ['AN', 'AO', 'AP', 'AQ', 'AR', 'AS'].forEach((col, i) => { copoSheet.getCell(`${col}${cr}`).value = row.coAttained[i]; });
    const poCols = ['AU', 'AV', 'AW', 'AX', 'AY', 'AZ', 'BA', 'BB', 'BC', 'BD', 'BE', 'BF'];
    poCols.forEach((col, i) => { copoSheet.getCell(`${col}${cr}`).value = row.poPercentage[i]; });
    const poAttainedCols = ['BG', 'BH', 'BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR'];
    poAttainedCols.forEach((col, i) => { copoSheet.getCell(`${col}${cr}`).value = row.poAttained[i]; });
  });

  // ── GradeSheet summary block (originally rows 64-77, now shifted by gradeShift) ──
  const withdrawnCount = rows.filter((r) => r.isWithdrawn).length;
  const incompleteCount = 0; // no "incomplete" concept tracked in our data model
  const gradedCount = n - withdrawnCount - incompleteCount;

  const distribution: Array<{ label: string; grade: string }> = [
    { label: 'A+ (Plus)', grade: 'A+ (Plus)' },
    { label: 'A (Plain)', grade: 'A (Plain)' },
    { label: 'A- (Minus)', grade: 'A- (Minus)' },
    { label: 'B+ (Plus)', grade: 'B+ (Plus)' },
    { label: 'B (Plain)', grade: 'B (Plain)' },
    { label: 'B- (Minus)', grade: 'B- (Minus)' },
    { label: 'C+ (Plus)', grade: 'C+ (Plus)' },
    { label: 'C (Plain)', grade: 'C (Plain)' },
    { label: 'D (Plain)', grade: 'D (Plain)' },
    { label: 'F (Fail)', grade: 'F (Fail)' },
    { label: 'I (Incomplete)', grade: 'I (Incomplete)' },
    { label: 'W (Withdrawn)', grade: WITHDRAWN_GRADE_LABEL },
  ];

  const assessmentWeights = [
    { row: 64, weight: getExamWeight(exams, 'Attendance') },
    { row: 65, weight: getExamWeight(exams, 'ClassPerformance') },
    { row: 66, weight: exams.some((e) => e.examCategory === 'Quiz') ? Number(course.quizWeightage || 0) : 0 },
    { row: 67, weight: exams.some((e) => e.examCategory === 'Assignment') ? Number(course.assignmentWeightage || 0) : 0 },
    { row: 68, weight: findMidtermExam(exams)?.weightage || 0 },
    { row: 69, weight: exams.some((e) => e.examCategory === 'Project') ? Number(course.projectWeightage || 0) : 0 },
    { row: 70, weight: findFinalExam(exams)?.weightage || 0 },
  ];
  let totalWeight = 0;
  assessmentWeights.forEach(({ row, weight }) => {
    gradeSheet.getCell(`C${row + gradeShift}`).value = weight;
    totalWeight += Number(weight) || 0;
  });
  gradeSheet.getCell(`C${71 + gradeShift}`).value = totalWeight;

  distribution.forEach(({ grade }, i) => {
    const count = rows.filter((r) => r.gradeDisplay === grade).length;
    gradeSheet.getCell(`H${64 + i + gradeShift}`).value = count;
  });
  gradeSheet.getCell(`H${76 + gradeShift}`).value = n;

  const assessmentCols = ['P', 'Q', 'R', 'S', 'T', 'U', 'V'] as const;
  const assessmentValues: Record<string, number[]> = {
    P: rows.map((r) => r.attendance),
    Q: rows.map((r) => r.classPerformance),
    R: rows.map((r) => r.quiz),
    S: rows.map((r) => r.assignment),
    T: rows.map((r) => r.midterm),
    U: rows.map((r) => r.project),
    V: rows.map((r) => r.final),
  };
  assessmentCols.forEach((col) => {
    const values = assessmentValues[col];
    const max = values.length ? Math.max(...values) : 0;
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const min = values.length ? Math.min(...values) : 0;
    gradeSheet.getCell(`${col}${64 + gradeShift}`).value = max;
    gradeSheet.getCell(`${col}${65 + gradeShift}`).value = avg;
    gradeSheet.getCell(`${col}${66 + gradeShift}`).value = min;
  });

  // ── CO_PO_AttainmentAnalysis class-average row (originally row 67, shifted with the sheet) ──
  const TEMPLATE_COPO_AVG_ROW = 67; // fixed position of the class-average row in the original 50-row template
  const copoAvgRow = TEMPLATE_COPO_AVG_ROW + copoShift;
  const coCols = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA'];
  const coValueGetters: Record<string, (r: StudentRow, i: number) => number> = {};
  ['D', 'E', 'F', 'G', 'H', 'I'].forEach((col, i) => { coValueGetters[col] = (r) => r.coMidterm[i]; });
  ['J', 'K', 'L', 'M', 'N', 'O'].forEach((col, i) => { coValueGetters[col] = (r) => r.coFinal[i]; });
  ['P', 'Q', 'R', 'S', 'T', 'U'].forEach((col, i) => { coValueGetters[col] = (r) => r.coProject[i]; });
  ['V', 'W', 'X', 'Y', 'Z', 'AA'].forEach(() => { /* Presentation columns always 0 */ });
  coCols.forEach((col) => {
    const getter = coValueGetters[col];
    const values = getter ? rows.map((r, i) => getter(r, i)) : rows.map(() => 0);
    copoSheet.getCell(`${col}${copoAvgRow}`).value = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  });
  ['AB', 'AC', 'AD', 'AE', 'AF', 'AG'].forEach((col, i) => {
    const values = rows.map((r) => r.coMidterm[i] + r.coFinal[i] + r.coProject[i]);
    copoSheet.getCell(`${col}${copoAvgRow}`).value = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  });
  ['AH', 'AI', 'AJ', 'AK', 'AL', 'AM'].forEach((col, i) => {
    const values = rows.map((r) => r.coPercentage[i]);
    copoSheet.getCell(`${col}${copoAvgRow}`).value = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  });
  const coAttainedCols = ['AN', 'AO', 'AP', 'AQ', 'AR', 'AS'];
  const coAttainedCounts = coAttainedCols.map((_, i) => rows.reduce((sum, r) => sum + r.coAttained[i], 0));
  coAttainedCols.forEach((col, i) => {
    copoSheet.getCell(`${col}${copoAvgRow}`).value = gradedCount > 0 ? coAttainedCounts[i] / gradedCount : 0;
  });
  const poPercentCols = ['AU', 'AV', 'AW', 'AX', 'AY', 'AZ', 'BA', 'BB', 'BC', 'BD', 'BE', 'BF'];
  poPercentCols.forEach((col, i) => {
    const sum = rows.filter((r) => !r.isWithdrawn).reduce((s, r) => s + r.poPercentage[i], 0);
    copoSheet.getCell(`${col}${copoAvgRow}`).value = gradedCount > 0 ? sum / gradedCount : 0;
  });
  const poAttainedSumCols = ['BG', 'BH', 'BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR'];
  poAttainedSumCols.forEach((col, i) => {
    copoSheet.getCell(`${col}${copoAvgRow}`).value = rows.reduce((sum, r) => sum + r.poAttained[i], 0);
  });

  // ── CO_PO_AttainmentAnalysis "Mapping of COs to POs" grid (rows 2-9, fixed - not part of
  //    the resized student block). The course's configured CO-PO mapping/max-marks were only
  //    ever used internally for the attainment math above; the visible grid itself was never
  //    written, so it always showed the template's all-zero placeholder regardless of what
  //    the teacher actually configured. ──
  const midtermExam = findMidtermExam(exams);
  const finalExam = findFinalExam(exams);
  const projectExam = findProjectExam(exams);
  const maxMarksObj: Record<string, number[]> = course?.coPoMapping?.maxMarks || {};
  const coPoMatrix: boolean[][] = course?.coPoMapping?.mapping || [];
  const assessmentMaxRows = [
    { row: 3, exam: midtermExam },
    { row: 4, exam: finalExam },
    { row: 5, exam: projectExam },
  ];
  const coCols6 = ['D', 'E', 'F', 'G', 'H', 'I'];
  assessmentMaxRows.forEach(({ row, exam }) => {
    const max = exam ? maxMarksObj[exam._id.toString()] : undefined;
    coCols6.forEach((col, i) => {
      copoSheet.getCell(`${col}${row}`).value = max?.[i] || 0;
    });
  });
  const poColsAll = ['AT', 'AU', 'AV', 'AW', 'AX', 'AY', 'AZ', 'BA', 'BB', 'BC', 'BD', 'BE'];
  for (let co = 0; co < 6; co++) {
    const row = co + 3;
    poColsAll.forEach((col, po) => {
      copoSheet.getCell(`${col}${row}`).value = coPoMatrix[co]?.[po] ? 1 : 0;
    });
  }

  // ── GradeSheet footer: add an explicit signature line above the instructor's name (the
  //    template only ever printed the name/title/department with nothing indicating where to
  //    actually sign, unlike CourseSummary/ContinuousQualityImprovement which both have a
  //    "Signature of the..." caption). ──
  const signatureRow = 74 + gradeShift;
  gradeSheet.mergeCells(`B${signatureRow}:C${signatureRow}`);
  const signatureCell = gradeSheet.getCell(`B${signatureRow}`);
  signatureCell.value = 'Signature: ____________________';
  signatureCell.font = { name: 'Times New Roman', size: 12, italic: true };
  signatureCell.alignment = { horizontal: 'left', vertical: 'middle' };

  // ── Attendance-derived numbers ──
  const sessionCount = attendanceSessions.length;
  const attendanceByStudent = new Map<string, { present: number; total: number }>();
  students.forEach((s) => attendanceByStudent.set(String(s._id), { present: 0, total: sessionCount }));
  attendanceSessions.forEach((session: any) => {
    (session.records || []).forEach((record: any) => {
      const key = String(record.studentId);
      const stat = attendanceByStudent.get(key);
      if (stat && record.status === 'present') stat.present += 1;
    });
  });
  const absentStudentCount = students.filter((s) => {
    const stat = attendanceByStudent.get(String(s._id));
    if (!stat || stat.total === 0) return false;
    return stat.present / stat.total < 0.75; // matches the <75% "at risk" threshold used elsewhere in the app
  }).length;

  // ── CourseSummary sheet: a handful of cells reference fixed GradeSheet/CO_PO_
  //    AttainmentAnalysis cells that just moved - write the same computed values in directly
  //    rather than relying on formula text that now points at the wrong row. ──
  if (courseSummarySheet) {
    courseSummarySheet.getCell('O3').value = `${n} students`;
    courseSummarySheet.getCell('G30').value = n;
    courseSummarySheet.getCell('G31').value = withdrawnCount;
    const finalTakenCount = findFinalExam(exams)
      ? rows.filter((r) => getMark(r.student._id, findFinalExam(exams)!._id, marks) !== undefined).length
      : 0;
    courseSummarySheet.getCell('G32').value = finalTakenCount;
    courseSummarySheet.getCell('G33').value = n - (withdrawnCount + incompleteCount + rows.filter((r) => r.gradeDisplay === 'F (Fail)').length);
    distribution.slice(0, 12).forEach(({ grade }, i) => {
      const col = String.fromCharCode('B'.charCodeAt(0) + i);
      const count = rows.filter((r) => r.gradeDisplay === grade).length;
      courseSummarySheet.getCell(`${col}24`).value = count;
      courseSummarySheet.getCell(`${col}25`).value = n > 0 ? count / n : 0;
    });
    courseSummarySheet.getCell('N24').value = n;
    courseSummarySheet.getCell('N25').value = n > 0 ? 1 : 0;

    // Real attendance-session numbers instead of the template's static sample values.
    courseSummarySheet.getCell('P30').value = sessionCount; // "Session Planned" -> sessions actually conducted
    courseSummarySheet.getCell('G39').value = absentStudentCount; // "Absent Students" (<75% attendance)
    courseSummarySheet.getCell('G38').value = 0; // "Tardy Students" - not tracked by this system

    // "Summary of COs" mini-table (rows 58-60) - was driven by formulas anchored to
    // CO_PO_AttainmentAnalysis!AN67 etc, which is now wherever the class-average row shifted to.
    const coSummaryCols = ['H', 'I', 'J', 'K', 'L', 'M'];
    coSummaryCols.forEach((col, i) => {
      courseSummarySheet.getCell(`${col}59`).value = coAttainedCounts[i];
      courseSummarySheet.getCell(`${col}60`).value = rows.length
        ? rows.reduce((sum, r) => sum + r.coPercentage[i], 0) / rows.length
        : 0;
    });
  }

  // ── ContinuousQualityImprovement sheet: CO attainment percentages ──
  if (cqiSheet) {
    cqiSheet.getCell('D4').value = n;
    ['D7', 'D8', 'D9', 'D10', 'D11', 'D12'].forEach((cell, i) => {
      cqiSheet.getCell(cell).value = gradedCount > 0 ? coAttainedCounts[i] / gradedCount : 0;
    });
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  try {
    return await reinjectTemplateCharts(buffer, templatePath, gradeShift);
  } catch (err) {
    // Charts are a visual enhancement, not core data - if the template ever changes shape and
    // this surgery no longer lines up, fall back to the (chart-less) ExcelJS output rather
    // than failing the whole export.
    console.error('Failed to reinject template charts, exporting without them:', err);
    return buffer;
  }
}
