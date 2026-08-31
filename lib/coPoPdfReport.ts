/* eslint-disable @typescript-eslint/no-explicit-any */
// Renders the full CO-PO course file (all 5 content sheets) as a single print-ready HTML
// document - no Excel file involved at all, pure calculation (lib/coPoCalculations.ts) plus
// HTML/CSS. This follows the same pattern as the existing attendance PDF export
// (app/api/courses/[id]/attendance-pdf/route.ts): the server returns styled HTML with
// `@page`/`page-break` CSS, the browser tab that opens it handles Print -> Save as PDF, so
// there's no server-side PDF-rendering dependency (no headless browser, no PDF library).
//
// A plain grid replica of the spreadsheet's layout (borders, dense tables), matching the
// Sample CO PO.xlsx template this is standing in for - including that template's per-sheet
// print header (Department name / sheet title / ULAB form code), read directly off the
// template's `worksheet.headerFooter.oddHeader` for CourseSummary, CO_PO_AttainmentAnalysis,
// and ContinuousQualityImprovement (GradeSheet/GradingPolicy have no header set in the
// template, so none is rendered for those sections either).
import { decodeGradingScale, getGradeDisplay, type GradeThreshold } from '@/app/utils/grading';
import {
  GRADE_DISTRIBUTION,
  computeStudentRows,
  computeCoPoSummary,
  findMidtermExam,
  findFinalExam,
  findProjectExam,
  getCoMaxMarks,
  type StudentRow,
  type CoPoSummary,
} from '@/lib/coPoCalculations';

const CO_LABELS = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6'];
const PO_LABELS = Array.from({ length: 12 }, (_, i) => `PO${i + 1}`);

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number, digits = 2): string {
  return Number.isFinite(value) ? (Math.round(value * 10 ** digits) / 10 ** digits).toString() : '0';
}

export interface CoPoReportData {
  course: any;
  instructorName: string;
  rows: StudentRow[];
  summary: CoPoSummary;
  gradingScale: GradeThreshold[];
  coPoMatrix: boolean[][]; // 6x12
  coMaxTotals: number[]; // 6, sum of max marks across midterm/final/project per CO
  coMarkDistribution: Array<{ label: string; values: number[] }>; // per-assessment max marks per CO (CO mark distribution table)
}

export function buildCoPoReportData(params: {
  course: any;
  students: any[];
  exams: any[];
  marks: any[];
  attendanceSessions?: any[];
  projectCoMarksByStudent?: Record<string, number[]>;
  instructorName: string;
}): CoPoReportData {
  const { course, students, exams, marks, instructorName, projectCoMarksByStudent } = params;
  const attendanceSessions = params.attendanceSessions || [];

  const rows = computeStudentRows(course, students, exams, marks, projectCoMarksByStudent);
  const summary = computeCoPoSummary(course, students, exams, marks, attendanceSessions, rows);
  const gradingScale = decodeGradingScale(course?.gradingScale);

  const midtermExam = findMidtermExam(exams);
  const finalExam = findFinalExam(exams);
  const projectExam = findProjectExam(exams);
  const { midMax, finalMax, projectMax } = getCoMaxMarks(course, midtermExam, finalExam, projectExam);
  const coMaxTotals = [0, 1, 2, 3, 4, 5].map((i) => (midMax[i] || 0) + (finalMax[i] || 0) + (projectMax[i] || 0));
  const coMarkDistribution = [
    { label: 'Midterm Exam', values: midMax },
    { label: 'Final Exam', values: finalMax },
    { label: 'Project', values: projectMax },
    { label: 'Total', values: coMaxTotals },
  ];

  return {
    course, instructorName, rows, summary, gradingScale,
    coPoMatrix: course?.coPoMapping?.mapping || [],
    coMaxTotals,
    coMarkDistribution,
  };
}

function pageStyleBase(orientation: 'portrait' | 'landscape') {
  return `
    @page { size: A4 ${orientation}; margin: 10mm; }
    html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .sheet { page-break-after: always; }
    .sheet:last-child { page-break-after: avoid; }
    table { border-collapse: collapse; width: 100%; }
    h1, h2, h3 { margin: 0 0 8px; }
  `;
}

// Reproduces the left/center/right layout of an Excel print header, for the sheets in
// Sample CO PO.xlsx that actually have one configured (see module comment above).
function sheetHeader(left: string, center: string, right: string) {
  return `<div style="display:flex;justify-content:space-between;gap:12px;font-size:10px;color:#333;border-bottom:1px solid #999;padding-bottom:5px;margin-bottom:12px;">
    <span>${esc(left)}</span><span style="font-weight:bold;">${esc(center)}</span><span>${esc(right)}</span>
  </div>`;
}

// ─── A plain grid replica of the spreadsheet ───────────────────────────────────────────────

function excelTable(headers: string[], rows: (string | number)[][], opts?: { fontSize?: number }) {
  const fs = opts?.fontSize ?? 10;
  const th = headers.map((h) => `<th style="border:1px solid #000;background:#dbe5f1;padding:2px 4px;font-size:${fs}px;">${esc(h)}</th>`).join('');
  const trs = rows
    .map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #000;padding:2px 4px;font-size:${fs}px;text-align:center;">${esc(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

function buildExcelStyleReport(data: CoPoReportData): string {
  const { course, instructorName, rows, summary, gradingScale, coPoMatrix, coMarkDistribution } = data;

  const gradeSheetRows = rows.map((r, i) => [
    i + 1, r.student.studentId, r.student.name,
    num(r.attendance), num(r.classPerformance), num(r.quiz), num(r.assignment),
    num(r.midterm), num(r.project), num(r.final), r.total, num(r.percent, 2), r.gradeDisplay,
  ]);

  const distributionRows = GRADE_DISTRIBUTION.map(({ label }, i) => [label, summary.distributionCounts[i]]);

  const assignmentLabel = course.courseType === 'Lab' ? 'CLA' : 'Assignment';

  const weightRows = [
    ['Attendance', summary.assessmentWeights.attendance],
    ['Class Performance', summary.assessmentWeights.classPerformance],
    ['Quiz', summary.assessmentWeights.quiz],
    [assignmentLabel, summary.assessmentWeights.assignment],
    ['Midterm Exam', summary.assessmentWeights.midterm],
    ['Project', summary.assessmentWeights.project],
    ['Final Exam', summary.assessmentWeights.final],
    ['Total', summary.totalWeight],
  ];

  const statsRows = (['attendance', 'classPerformance', 'quiz', 'assignment', 'midterm', 'project', 'final'] as const).map((key) => {
    const s = summary.assessmentStats[key];
    return [key, num(s.max), num(s.avg), num(s.min)];
  });

  const gradingPolicyRows = gradingScale.map((g) => [`${g.threshold}%+`, getGradeDisplay(g.letter, g.modifier)]);

  const copoStudentRows = rows.map((r, i) => [
    i + 1, r.student.studentId, r.student.name,
    ...CO_LABELS.map((_, ci) => num(r.coPercentage[ci] * 100, 1)),
    ...PO_LABELS.map((_, pi) => num(r.poPercentage[pi] * 100, 1)),
  ]);

  const mappingRows = CO_LABELS.map((label, ci) => [label, ...PO_LABELS.map((_, pi) => (coPoMatrix[ci]?.[pi] ? 1 : 0))]);

  const cqiRows = CO_LABELS.map((label, i) => [
    label, '60% of students to achieve 55% of the allocated mark',
    summary.gradedCount > 0 ? pct(summary.coAttainedCounts[i] / summary.gradedCount) : '0%',
  ]);

  return `
  <div class="sheet">
    <h1 style="text-align:center;background:#cfcfcf;display:inline-block;padding:4px 16px;">Grade Sheet of ${esc(course.name)} [${esc(course.code)}] (Section ${esc(course.section)}) [${esc(course.semester)} ${esc(course.year)}]</h1>
    <table style="width:auto;margin-bottom:8px;">
      <tr><td style="font-weight:bold;padding:2px 8px;">Course Code</td><td style="padding:2px 8px;">${esc(course.code)}</td><td style="font-weight:bold;padding:2px 8px;">Section</td><td style="padding:2px 8px;">${esc(course.section)}</td></tr>
      <tr><td style="font-weight:bold;padding:2px 8px;">Course Title</td><td style="padding:2px 8px;">${esc(course.name)}</td><td style="font-weight:bold;padding:2px 8px;">Semester</td><td style="padding:2px 8px;">${esc(course.semester)} ${esc(course.year)}</td></tr>
      <tr><td style="font-weight:bold;padding:2px 8px;">Credit</td><td style="padding:2px 8px;">${course.courseType === 'Theory' ? 3 : 1}</td></tr>
      <tr><td style="font-weight:bold;padding:2px 8px;">Instructor</td><td style="padding:2px 8px;">${esc(instructorName)}</td></tr>
    </table>
    ${excelTable(
      ['No.', 'Student ID', 'Name', 'Attendance', 'Performance', 'Quiz', assignmentLabel, 'Mid', 'Project', 'Final', 'Total (100)', '%', 'Grade'],
      gradeSheetRows,
    )}
    <div style="display:flex;gap:24px;margin-top:12px;">
      <div style="flex:1;">
        <h3>Assessment Weights</h3>
        ${excelTable(['Assessment', 'Marks Distribution'], weightRows)}
      </div>
      <div style="flex:1;">
        <h3>Grade Distribution</h3>
        ${excelTable(['Grade', 'Frequency'], distributionRows)}
      </div>
      <div style="flex:1;">
        <h3>Assessment Stats</h3>
        ${excelTable(['Assessment', 'Max', 'Avg', 'Min'], statsRows)}
      </div>
    </div>
    <p style="margin-top:24px;">____________________</p>
    <p><strong>${esc(instructorName)}</strong><br/>Senior Lecturer<br/>Department of CSE, ULAB</p>
  </div>

  <div class="sheet">
    <h2>Grading Policy</h2>
    ${excelTable(['Minimum Percentage', 'Letter Grade'], gradingPolicyRows)}
  </div>

  <div class="sheet">
    ${sheetHeader('Department of CSE, ULAB', 'Course Summary', 'AC18(00)')}
    <h2>Course Summary</h2>
    <table style="width:auto;margin-bottom:12px;">
      <tr><td style="font-weight:bold;padding:2px 8px;">Course Code</td><td style="padding:2px 8px;">${esc(course.code)}</td></tr>
      <tr><td style="font-weight:bold;padding:2px 8px;">Course Title</td><td style="padding:2px 8px;">${esc(course.name)}</td></tr>
      <tr><td style="font-weight:bold;padding:2px 8px;">Section</td><td style="padding:2px 8px;">${esc(course.section)} - ${summary.n} students</td></tr>
    </table>
    <div style="display:flex;gap:24px;">
      <div style="flex:1;">
        <h3>Grade Distribution</h3>
        ${excelTable(['Grade', 'Count', '%'], GRADE_DISTRIBUTION.map(({ label }, i) => [label, summary.distributionCounts[i], pct(summary.n > 0 ? summary.distributionCounts[i] / summary.n : 0)]))}
      </div>
      <div style="flex:1;">
        <h3>Statistical Information</h3>
        ${excelTable(['Metric', 'Value'], [
          ['Students enrolled', summary.n],
          ['Students withdrawn', summary.withdrawnCount],
          ['Students who took final exam', summary.finalTakenCount],
          ['Students passed', summary.n - summary.withdrawnCount - summary.incompleteCount - summary.distributionCounts[GRADE_DISTRIBUTION.findIndex((d) => d.grade === 'F (Fail)')]],
          ['Sessions conducted', summary.sessionCount],
          ['Students below 75% attendance', summary.absentStudentCount],
        ])}
      </div>
      <div style="flex:1;">
        <h3>Summary of COs</h3>
        ${excelTable(['CO', 'Students Achieved', 'Avg Score'], CO_LABELS.map((label, i) => [label, summary.coAttainedCounts[i], pct(summary.coPercentageAvg[i])]))}
      </div>
    </div>
  </div>

  <div class="sheet">
    ${sheetHeader('Department of CSE, ULAB', 'CO-PO Attainment Analysis', 'CSE004(00)')}
    <h2>CO-PO Attainment Analysis</h2>
    <h3>Mapping of COs to POs</h3>
    ${excelTable(['CO / PO', ...PO_LABELS], mappingRows, { fontSize: 9 })}
    <h3 style="margin-top:12px;">CO Mark Distribution (Max Marks per Assessment)</h3>
    ${excelTable(['Assessment Item', ...CO_LABELS], coMarkDistribution.map(({ label, values }) => [label, ...values.map((v) => num(v, 0))]))}
    <h3 style="margin-top:12px;">Per-Student CO / PO Attainment (%)</h3>
    ${excelTable(['No.', 'ID', 'Name', ...CO_LABELS, ...PO_LABELS], copoStudentRows, { fontSize: 8 })}
    <h3 style="margin-top:12px;">Class Averages</h3>
    ${excelTable(CO_LABELS, [summary.coPercentageAvg.map((v) => pct(v))])}
    ${excelTable(PO_LABELS, [summary.poPercentageAvg.map((v) => pct(v))], { fontSize: 9 })}
  </div>

  <div class="sheet">
    ${sheetHeader('Department of CSE, ULAB', 'CQI Form', 'CSE005(00)')}
    <h2>Continuous Quality Improvement (CQI)</h2>
    <table style="width:auto;margin-bottom:12px;">
      <tr><td style="font-weight:bold;padding:2px 8px;">Course Code</td><td style="padding:2px 8px;">${esc(course.code)}</td><td style="font-weight:bold;padding:2px 8px;">Section</td><td style="padding:2px 8px;">${esc(course.section)}</td></tr>
      <tr><td style="font-weight:bold;padding:2px 8px;">Number of Students</td><td style="padding:2px 8px;">${summary.n}</td></tr>
    </table>
    ${excelTable(['Course Outcome', 'Criteria for Achievement', 'CO Attainment'], cqiRows)}
    <p style="margin-top:24px;">Plan for Course Improvement: (Based on inputs from Course Outcome Analysis above, results and other sources)</p>
    <p style="border-bottom:1px solid #000;height:20px;"></p>
    <p style="border-bottom:1px solid #000;height:20px;"></p>
    <p style="margin-top:24px;">Signature of the Instructor: ____________________</p>
    <p>Name of the Instructor: ${esc(instructorName)}</p>
    <p>Date: ${new Date().toLocaleDateString()}</p>
  </div>
  `;
}

export function buildCoPoPdfHtml(data: CoPoReportData): string {
  const body = buildExcelStyleReport(data);
  const styleBlock = pageStyleBase('landscape');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(data.course.code)} Course File</title>
  <style>${styleBlock}</style>
</head>
<body>
  ${body}
</body>
</html>`;
}
