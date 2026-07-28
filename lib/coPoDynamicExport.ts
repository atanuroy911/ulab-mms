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
// (see lib/coPoCalculations.ts - shared with the Alpha PDF export so the two never
// disagree), then (2) uses ExcelJS to physically grow/shrink the template's two dynamic
// sheets to the real student count and writes the computed values in as plain literals -
// never as formulas - so there is nothing left to "shift".
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { reinjectTemplateCharts } from '@/lib/xlsxChartReinject';
import {
  GRADE_DISTRIBUTION,
  computeStudentRows,
  computeCoPoSummary,
  findMidtermExam,
  findFinalExam,
  findProjectExam,
  type StudentRow,
} from '@/lib/coPoCalculations';

const TEMPLATE_STUDENT_COUNT = 50;
const GRADE_SHEET_FIRST_ROW = 10; // GradeSheet student rows start here (ends at 59 in the template)
const COPO_SHEET_FIRST_ROW = 15; // CO_PO_AttainmentAnalysis student rows start here (ends at 64)

const MERGE_RANGE_RE = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/;

// ExcelJS's spliceRows() moves cell values/styles but does NOT shift pre-existing merged-cell
// ranges - a merge below the splice point keeps referencing its original row numbers even
// though the actual content moved. That leaves the workbook with a merge that no longer lines
// up with anything (or collides with a merge we add later at the same address), which is
// exactly the kind of structural defect that makes real Excel throw the file into "removed
// part" repair mode - it doesn't just affect the rows we can see stale content in, it can
// take drawings/charts down with it during recovery. Every merge whose top row is below the
// template's fixed last row needs to move by the same delta as the rows themselves.
function shiftMergesBelow(worksheet: ExcelJS.Worksheet, templateLastRow: number, delta: number) {
  if (!delta) return;
  const affected = worksheet.model.merges.filter((range) => {
    const match = MERGE_RANGE_RE.exec(range);
    return match && Number(match[2]) > templateLastRow;
  });
  affected.forEach((range) => {
    const match = MERGE_RANGE_RE.exec(range)!;
    const [, col1, row1, col2, row2] = match;
    worksheet.unMergeCells(range);
    worksheet.mergeCells(`${col1}${Number(row1) + delta}:${col2}${Number(row2) + delta}`);
  });
}

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
    shiftMergesBelow(worksheet, lastTemplateRow, delta);
  } else if (delta < 0) {
    worksheet.spliceRows(firstRow + count, -delta);
    shiftMergesBelow(worksheet, lastTemplateRow, delta);
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
  const summary = computeCoPoSummary(course, students, exams, marks, attendanceSessions, rows);

  const gradeShift = await resizeStudentBlock(gradeSheet, GRADE_SHEET_FIRST_ROW, n);
  const copoShift = await resizeStudentBlock(copoSheet, COPO_SHEET_FIRST_ROW, n);

  // ── Header cells (unaffected by row count - always at fixed rows 2-5) ──
  gradeSheet.getCell('H2').value = course.code || '';
  gradeSheet.getCell('H3').value = course.name || '';
  gradeSheet.getCell('H4').value = course.courseType === 'Theory' ? 3 : 1;
  gradeSheet.getCell('H5').value = instructorName || '';
  gradeSheet.getCell('L2').value = course.section || '';
  gradeSheet.getCell('L3').value = `${course.semester} ${course.year}`.trim();

  // Labs inherit the Assignment exam from Theory, but the column header should read "CLA"
  const assignmentLabel = course.courseType === 'Lab' ? 'CLA' : 'Assignment';
  gradeSheet.getCell('S8').value = assignmentLabel;

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
  const weightRows: Array<[number, number]> = [
    [64, summary.assessmentWeights.attendance],
    [65, summary.assessmentWeights.classPerformance],
    [66, summary.assessmentWeights.quiz],
    [67, summary.assessmentWeights.assignment],
    [68, summary.assessmentWeights.midterm],
    [69, summary.assessmentWeights.project],
    [70, summary.assessmentWeights.final],
  ];
  weightRows.forEach(([row, weight]) => {
    gradeSheet.getCell(`C${row + gradeShift}`).value = weight;
  });
  gradeSheet.getCell(`B${67 + gradeShift}`).value = assignmentLabel;
  gradeSheet.getCell(`C${71 + gradeShift}`).value = summary.totalWeight;

  // ── Row 9 header labels (D-J) and the mirrored weight row (P-V) - both are template
  //    formulas anchored to the *original* row 64-70 addresses (e.g. D9 is
  //    `=CONCATENATE("Attendance (",GradeSheet!$C$64,")")`, P9 is `=C64`). spliceRows() above
  //    does not repoint formulas elsewhere in the sheet the way a real Excel row insert/delete
  //    would, so for any class that isn't exactly 50 students (i.e. almost always) those
  //    formulas end up reading whatever row now occupies the old address - usually blank -
  //    producing "Attendance ()" instead of "Attendance (10)". Overwrite both as literals,
  //    same as everywhere else in this file, so there's no stale formula left to point wrong.
  const headerLabels: Array<[string, string, number]> = [
    ['D9', 'Attendance', summary.assessmentWeights.attendance],
    ['E9', 'Performance', summary.assessmentWeights.classPerformance],
    ['F9', 'Quiz', summary.assessmentWeights.quiz],
    ['G9', assignmentLabel, summary.assessmentWeights.assignment],
    ['H9', 'Midterm', summary.assessmentWeights.midterm],
    ['I9', 'Project', summary.assessmentWeights.project],
    ['J9', 'Final', summary.assessmentWeights.final],
  ];
  headerLabels.forEach(([cell, label, weight]) => {
    gradeSheet.getCell(cell).value = `${label} (${weight})`;
  });

  const mirroredWeights: Array<[string, number]> = [
    ['P9', summary.assessmentWeights.attendance],
    ['Q9', summary.assessmentWeights.classPerformance],
    ['R9', summary.assessmentWeights.quiz],
    ['S9', summary.assessmentWeights.assignment],
    ['T9', summary.assessmentWeights.midterm],
    ['U9', summary.assessmentWeights.project],
    ['V9', summary.assessmentWeights.final],
  ];
  mirroredWeights.forEach(([cell, weight]) => {
    gradeSheet.getCell(cell).value = weight;
  });

  summary.distributionCounts.forEach((count, i) => {
    gradeSheet.getCell(`H${64 + i + gradeShift}`).value = count;
  });
  gradeSheet.getCell(`H${76 + gradeShift}`).value = n;

  const assessmentCols: Array<[string, keyof typeof summary.assessmentStats]> = [
    ['P', 'attendance'], ['Q', 'classPerformance'], ['R', 'quiz'], ['S', 'assignment'],
    ['T', 'midterm'], ['U', 'project'], ['V', 'final'],
  ];
  assessmentCols.forEach(([col, key]) => {
    const { max, avg, min } = summary.assessmentStats[key];
    gradeSheet.getCell(`${col}${64 + gradeShift}`).value = max;
    gradeSheet.getCell(`${col}${65 + gradeShift}`).value = avg;
    gradeSheet.getCell(`${col}${66 + gradeShift}`).value = min;
  });

  // ── CO_PO_AttainmentAnalysis class-average row (originally row 67, shifted with the sheet) ──
  const TEMPLATE_COPO_AVG_ROW = 67; // fixed position of the class-average row in the original 50-row template
  const copoAvgRow = TEMPLATE_COPO_AVG_ROW + copoShift;
  const coValueGetters: Record<string, (r: StudentRow, i: number) => number> = {};
  ['D', 'E', 'F', 'G', 'H', 'I'].forEach((col, i) => { coValueGetters[col] = (r) => r.coMidterm[i]; });
  ['J', 'K', 'L', 'M', 'N', 'O'].forEach((col, i) => { coValueGetters[col] = (r) => r.coFinal[i]; });
  ['P', 'Q', 'R', 'S', 'T', 'U'].forEach((col, i) => { coValueGetters[col] = (r) => r.coProject[i]; });
  // D67:AA67 are one shared-formula group in the template (all "=AVERAGE(X15:X64)"), so every
  // column in that range must be overwritten - including V-AA ("Presentation", no data source,
  // defaults to 0) - or the ones left untouched still reference a master cell (D67) that no
  // longer has a formula, which corrupts the workbook on save.
  const coCols = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA'];
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
    copoSheet.getCell(`${col}${copoAvgRow}`).value = summary.coPercentageAvg[i];
  });
  const coAttainedCols = ['AN', 'AO', 'AP', 'AQ', 'AR', 'AS'];
  coAttainedCols.forEach((col, i) => {
    copoSheet.getCell(`${col}${copoAvgRow}`).value = summary.gradedCount > 0 ? summary.coAttainedCounts[i] / summary.gradedCount : 0;
  });
  const poPercentCols = ['AU', 'AV', 'AW', 'AX', 'AY', 'AZ', 'BA', 'BB', 'BC', 'BD', 'BE', 'BF'];
  poPercentCols.forEach((col, i) => {
    copoSheet.getCell(`${col}${copoAvgRow}`).value = summary.poPercentageAvg[i];
  });
  const poAttainedSumCols = ['BG', 'BH', 'BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR'];
  poAttainedSumCols.forEach((col, i) => {
    copoSheet.getCell(`${col}${copoAvgRow}`).value = summary.poAttainedCounts[i];
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
  signatureCell.value = '____________________';
  signatureCell.font = { name: 'Times New Roman', size: 12, italic: true };
  signatureCell.alignment = { horizontal: 'left', vertical: 'middle' };

  // ── CourseSummary sheet: a handful of cells reference fixed GradeSheet/CO_PO_
  //    AttainmentAnalysis cells that just moved - write the same computed values in directly
  //    rather than relying on formula text that now points at the wrong row. ──
  if (courseSummarySheet) {
    courseSummarySheet.getCell('O3').value = `${n} students`;
    courseSummarySheet.getCell('G30').value = n;
    courseSummarySheet.getCell('G31').value = summary.withdrawnCount;
    courseSummarySheet.getCell('G32').value = summary.finalTakenCount;
    courseSummarySheet.getCell('G33').value = n - (summary.withdrawnCount + summary.incompleteCount + rows.filter((r) => r.gradeDisplay === 'F (Fail)').length);
    GRADE_DISTRIBUTION.forEach((_, i) => {
      const col = String.fromCharCode('B'.charCodeAt(0) + i);
      courseSummarySheet.getCell(`${col}24`).value = summary.distributionCounts[i];
      courseSummarySheet.getCell(`${col}25`).value = n > 0 ? summary.distributionCounts[i] / n : 0;
    });
    courseSummarySheet.getCell('N24').value = n;
    courseSummarySheet.getCell('N25').value = n > 0 ? 1 : 0;

    // Real attendance-session numbers instead of the template's static sample values.
    courseSummarySheet.getCell('P30').value = summary.sessionCount; // "Session Planned" -> sessions actually conducted
    courseSummarySheet.getCell('G39').value = summary.absentStudentCount; // "Absent Students" (<75% attendance)
    courseSummarySheet.getCell('G38').value = 0; // "Tardy Students" - not tracked by this system

    // "Summary of COs" mini-table (rows 58-60) - was driven by formulas anchored to
    // CO_PO_AttainmentAnalysis!AN67 etc, which is now wherever the class-average row shifted to.
    const coSummaryCols = ['H', 'I', 'J', 'K', 'L', 'M'];
    coSummaryCols.forEach((col, i) => {
      courseSummarySheet.getCell(`${col}59`).value = summary.coAttainedCounts[i];
      courseSummarySheet.getCell(`${col}60`).value = summary.coPercentageAvg[i];
    });
  }

  // ── ContinuousQualityImprovement sheet: CO attainment percentages ──
  if (cqiSheet) {
    cqiSheet.getCell('D4').value = n;
    ['D7', 'D8', 'D9', 'D10', 'D11', 'D12'].forEach((cell, i) => {
      cqiSheet.getCell(cell).value = summary.gradedCount > 0 ? summary.coAttainedCounts[i] / summary.gradedCount : 0;
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
