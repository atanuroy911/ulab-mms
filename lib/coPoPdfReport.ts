/* eslint-disable @typescript-eslint/no-explicit-any */
// Renders the full CO-PO course file (all 5 content sheets) as a single print-ready HTML
// document - no Excel file involved at all, pure calculation (lib/coPoCalculations.ts) plus
// HTML/CSS. This follows the same pattern as the existing attendance PDF export
// (app/api/courses/[id]/attendance-pdf/route.ts): the server returns styled HTML with
// `@page`/`page-break` CSS, the browser tab that opens it handles Print -> Save as PDF, so
// there's no server-side PDF-rendering dependency (no headless browser, no PDF library).
//
// Two visual styles share the same computed data:
//  - "excel": a plain grid replica of the spreadsheet's layout (borders, dense tables).
//  - "modern": a redesigned report (stat cards, bar visualizations, card-based layout).
import { decodeGradingScale, getGradeDisplay, type GradeThreshold } from '@/app/utils/grading';
import {
  GRADE_DISTRIBUTION,
  computeStudentRows,
  computeCoPoSummary,
  findMidtermExam,
  findFinalExam,
  findProjectExam,
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
}

export function buildCoPoReportData(params: {
  course: any;
  students: any[];
  exams: any[];
  marks: any[];
  attendanceSessions?: any[];
  instructorName: string;
}): CoPoReportData {
  const { course, students, exams, marks, instructorName } = params;
  const attendanceSessions = params.attendanceSessions || [];

  const rows = computeStudentRows(course, students, exams, marks);
  const summary = computeCoPoSummary(course, students, exams, marks, attendanceSessions, rows);
  const gradingScale = decodeGradingScale(course?.gradingScale);

  const midtermExam = findMidtermExam(exams);
  const finalExam = findFinalExam(exams);
  const projectExam = findProjectExam(exams);
  const maxMarksObj: Record<string, number[]> = course?.coPoMapping?.maxMarks || {};
  const midMax = midtermExam ? maxMarksObj[midtermExam._id.toString()] || [0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0];
  const finalMax = finalExam ? maxMarksObj[finalExam._id.toString()] || [0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0];
  const projectMax = projectExam ? maxMarksObj[projectExam._id.toString()] || [0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0];
  const coMaxTotals = [0, 1, 2, 3, 4, 5].map((i) => (midMax[i] || 0) + (finalMax[i] || 0) + (projectMax[i] || 0));

  return {
    course, instructorName, rows, summary, gradingScale,
    coPoMatrix: course?.coPoMapping?.mapping || [],
    coMaxTotals,
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

// ─── "Excel" style: a plain grid replica of the spreadsheet ───────────────────────────────

function excelTable(headers: string[], rows: (string | number)[][], opts?: { fontSize?: number }) {
  const fs = opts?.fontSize ?? 10;
  const th = headers.map((h) => `<th style="border:1px solid #000;background:#dbe5f1;padding:2px 4px;font-size:${fs}px;">${esc(h)}</th>`).join('');
  const trs = rows
    .map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #000;padding:2px 4px;font-size:${fs}px;text-align:center;">${esc(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

function buildExcelStyleReport(data: CoPoReportData): string {
  const { course, instructorName, rows, summary, gradingScale, coPoMatrix, coMaxTotals } = data;

  const gradeSheetRows = rows.map((r, i) => [
    i + 1, r.student.studentId, r.student.name,
    num(r.attendance), num(r.classPerformance), num(r.quiz), num(r.assignment),
    num(r.midterm), num(r.project), num(r.final), r.total, num(r.percent, 2), r.gradeDisplay,
  ]);

  const distributionRows = GRADE_DISTRIBUTION.map(({ label }, i) => [label, summary.distributionCounts[i]]);

  const weightRows = [
    ['Attendance', summary.assessmentWeights.attendance],
    ['Class Performance', summary.assessmentWeights.classPerformance],
    ['Quiz', summary.assessmentWeights.quiz],
    ['Assignment', summary.assessmentWeights.assignment],
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
      ['No.', 'Student ID', 'Name', 'Attendance', 'Performance', 'Quiz', 'Assignment', 'Mid', 'Project', 'Final', 'Total (100)', '%', 'Grade'],
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
    <p style="margin-top:24px;">Signature: ____________________</p>
    <p><strong>${esc(instructorName)}</strong><br/>Senior Lecturer<br/>Department of CSE, ULAB</p>
  </div>

  <div class="sheet">
    <h2>Grading Policy</h2>
    ${excelTable(['Minimum Percentage', 'Letter Grade'], gradingPolicyRows)}
  </div>

  <div class="sheet">
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
    <h2>CO-PO Attainment Analysis</h2>
    <h3>Mapping of COs to POs</h3>
    ${excelTable(['CO / PO', ...PO_LABELS], mappingRows, { fontSize: 9 })}
    <h3 style="margin-top:12px;">Max Marks per CO (Midterm + Final + Project)</h3>
    ${excelTable(CO_LABELS, [coMaxTotals.map((v) => num(v, 0))])}
    <h3 style="margin-top:12px;">Per-Student CO / PO Attainment (%)</h3>
    ${excelTable(['No.', 'ID', 'Name', ...CO_LABELS, ...PO_LABELS], copoStudentRows, { fontSize: 8 })}
    <h3 style="margin-top:12px;">Class Averages</h3>
    ${excelTable(CO_LABELS, [summary.coPercentageAvg.map((v) => pct(v))])}
    ${excelTable(PO_LABELS, [summary.poPercentageAvg.map((v) => pct(v))], { fontSize: 9 })}
  </div>

  <div class="sheet">
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

// ─── "Modern" style: freely redesigned report ─────────────────────────────────────────────

function bar(percentage: number, color: string) {
  const clamped = Math.max(0, Math.min(1, percentage));
  return `<div style="background:#eee;border-radius:4px;overflow:hidden;height:10px;width:100%;">
    <div style="background:${color};width:${clamped * 100}%;height:100%;"></div>
  </div>`;
}

function statCard(label: string, value: string, accent: string) {
  return `<div style="flex:1;border-radius:12px;background:#fff;border:1px solid #e5e7eb;padding:14px 16px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">${esc(label)}</div>
    <div style="font-size:24px;font-weight:700;color:${accent};margin-top:2px;">${esc(value)}</div>
  </div>`;
}

function buildModernReport(data: CoPoReportData): string {
  const { course, instructorName, rows, summary, gradingScale, coPoMatrix } = data;
  const passCount = summary.n - summary.withdrawnCount - summary.incompleteCount - summary.distributionCounts[GRADE_DISTRIBUTION.findIndex((d) => d.grade === 'F (Fail)')];
  const passRate = summary.n > 0 ? passCount / summary.n : 0;
  const attendanceRate = summary.n > 0 && summary.sessionCount > 0 ? 1 - summary.absentStudentCount / summary.n : 1;
  const maxDistribution = Math.max(1, ...summary.distributionCounts);

  const gradientBanner = `background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border-radius:16px;padding:24px 28px;`;

  const studentTableRows = rows.map((r, i) => `
    <tr>
      <td style="padding:6px 8px;color:#6b7280;">${i + 1}</td>
      <td style="padding:6px 8px;">${esc(r.student.studentId)}</td>
      <td style="padding:6px 8px;font-weight:600;">${esc(r.student.name)}</td>
      <td style="padding:6px 8px;text-align:center;">${r.total}</td>
      <td style="padding:6px 8px;text-align:center;">${num(r.percent * 100, 1)}%</td>
      <td style="padding:6px 8px;text-align:center;"><span style="background:#eef2ff;color:#4338ca;border-radius:999px;padding:2px 10px;font-weight:600;font-size:11px;">${esc(r.gradeDisplay)}</span></td>
    </tr>`).join('');

  const distributionBars = GRADE_DISTRIBUTION.map(({ label }, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <div style="width:24px;font-size:11px;color:#6b7280;">${label}</div>
      <div style="flex:1;">${bar(summary.distributionCounts[i] / maxDistribution, '#6366f1')}</div>
      <div style="width:24px;font-size:11px;text-align:right;">${summary.distributionCounts[i]}</div>
    </div>`).join('');

  const coBars = CO_LABELS.map((label, i) => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;">
        <span style="font-weight:600;">${label}</span><span>${pct(summary.coPercentageAvg[i])}</span>
      </div>
      ${bar(summary.coPercentageAvg[i], summary.coPercentageAvg[i] >= 0.55 ? '#22c55e' : '#ef4444')}
    </div>`).join('');

  const poBars = PO_LABELS.map((label, i) => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;">
        <span style="font-weight:600;">${label}</span><span>${pct(summary.poPercentageAvg[i])}</span>
      </div>
      ${bar(summary.poPercentageAvg[i], summary.poPercentageAvg[i] >= 0.65 ? '#22c55e' : '#ef4444')}
    </div>`).join('');

  const mappingGrid = `
    <table style="font-size:11px;">
      <thead><tr><th style="padding:4px;"></th>${PO_LABELS.map((p) => `<th style="padding:4px;text-align:center;color:#6b7280;">${p}</th>`).join('')}</tr></thead>
      <tbody>${CO_LABELS.map((co, ci) => `
        <tr>
          <td style="padding:4px;font-weight:600;">${co}</td>
          ${PO_LABELS.map((_, pi) => `<td style="padding:4px;text-align:center;">${coPoMatrix[ci]?.[pi] ? '<span style="color:#22c55e;font-weight:700;">✓</span>' : '<span style="color:#d1d5db;">·</span>'}</td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table>`;

  const gradingScaleChips = gradingScale.map((g) => `
    <div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid #f3f4f6;">
      <span>${g.threshold}% and above</span><span style="font-weight:600;">${getGradeDisplay(g.letter, g.modifier)}</span>
    </div>`).join('');

  const cqiRows = CO_LABELS.map((label, i) => {
    const achieved = summary.gradedCount > 0 ? summary.coAttainedCounts[i] / summary.gradedCount : 0;
    const ok = achieved >= 0.6;
    return `<tr>
      <td style="padding:8px;font-weight:600;">${label}</td>
      <td style="padding:8px;color:#6b7280;">60% of students to achieve 55% of the allocated mark</td>
      <td style="padding:8px;text-align:center;"><span style="background:${ok ? '#dcfce7' : '#fee2e2'};color:${ok ? '#166534' : '#991b1b'};border-radius:999px;padding:3px 12px;font-weight:700;font-size:12px;">${pct(achieved)}</span></td>
    </tr>`;
  }).join('');

  return `
  <div class="sheet">
    <div style="${gradientBanner}">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;opacity:0.8;">Course File Report</div>
      <h1 style="font-size:28px;margin:4px 0 2px;">${esc(course.name)}</h1>
      <div style="font-size:13px;opacity:0.9;">${esc(course.code)} · Section ${esc(course.section)} · ${esc(course.semester)} ${esc(course.year)} · Instructor: ${esc(instructorName)}</div>
    </div>
    <div style="display:flex;gap:12px;margin-top:16px;">
      ${statCard('Students', String(summary.n), '#4f46e5')}
      ${statCard('Pass Rate', pct(passRate, 0), '#16a34a')}
      ${statCard('Withdrawn', String(summary.withdrawnCount), '#dc2626')}
      ${statCard('Attendance (≥75%)', pct(attendanceRate, 0), '#0891b2')}
    </div>
    <div style="display:flex;gap:16px;margin-top:16px;">
      <div style="flex:1;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
        <h3 style="font-size:14px;">Grade Distribution</h3>
        ${distributionBars}
      </div>
      <div style="flex:1;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
        <h3 style="font-size:14px;">Grading Scale</h3>
        ${gradingScaleChips}
      </div>
    </div>
  </div>

  <div class="sheet">
    <h2>Student Grade Sheet</h2>
    <table style="font-size:12px;">
      <thead><tr style="background:#f9fafb;text-align:left;">
        <th style="padding:6px 8px;">No.</th><th style="padding:6px 8px;">Student ID</th><th style="padding:6px 8px;">Name</th>
        <th style="padding:6px 8px;text-align:center;">Total</th><th style="padding:6px 8px;text-align:center;">%</th><th style="padding:6px 8px;text-align:center;">Grade</th>
      </tr></thead>
      <tbody>${studentTableRows}</tbody>
    </table>
  </div>

  <div class="sheet">
    <h2>Course Outcome (CO) Attainment</h2>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;">
      ${coBars}
    </div>
    <h2>Program Outcome (PO) Attainment</h2>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
      ${poBars}
    </div>
  </div>

  <div class="sheet">
    <h2>CO → PO Mapping</h2>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;">
      ${mappingGrid}
    </div>
  </div>

  <div class="sheet">
    <h2>Continuous Quality Improvement (CQI)</h2>
    <table style="font-size:13px;">
      <thead><tr style="background:#f9fafb;text-align:left;">
        <th style="padding:8px;">CO</th><th style="padding:8px;">Criteria</th><th style="padding:8px;text-align:center;">Attainment</th>
      </tr></thead>
      <tbody>${cqiRows}</tbody>
    </table>
    <div style="margin-top:24px;padding:16px;border:1px dashed #d1d5db;border-radius:12px;color:#6b7280;font-size:12px;">
      Plan for Course Improvement (fill in by hand): ______________________________________________
    </div>
    <div style="margin-top:32px;font-size:13px;">
      <div>Signature of the Instructor: ____________________</div>
      <div style="margin-top:6px;">${esc(instructorName)} · ${new Date().toLocaleDateString()}</div>
    </div>
  </div>
  `;
}

export function buildCoPoPdfHtml(data: CoPoReportData, style: 'excel' | 'modern'): string {
  const body = style === 'modern' ? buildModernReport(data) : buildExcelStyleReport(data);
  const orientation = style === 'modern' ? 'portrait' : 'landscape';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(data.course.code)} Course File</title>
  <style>${pageStyleBase(orientation)}</style>
</head>
<body>
  ${body}
</body>
</html>`;
}
