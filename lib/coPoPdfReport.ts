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
  coMarkDistribution: Array<{ label: string; values: number[] }>; // per-assessment max marks per CO (CO mark distribution table)
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
  const { course, instructorName, rows, summary, gradingScale, coPoMatrix, coMarkDistribution } = data;

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
    <p style="margin-top:24px;">____________________</p>
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
    <h3 style="margin-top:12px;">CO Mark Distribution (Max Marks per Assessment)</h3>
    ${excelTable(['Assessment Item', ...CO_LABELS], coMarkDistribution.map(({ label, values }) => [label, ...values.map((v) => num(v, 0))]))}
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
//
// Small design-system tokens (colors/spacing/radius) kept in one <style> block so the report
// reads as one coherent product instead of a pile of one-off inline styles. Uses a
// system-font stack (no external fonts - has to render standalone in a print tab), a single
// accent (indigo) plus semantic green/red/amber for pass/fail/at-risk states, and a
// consistent card/section rhythm reused across every page.

const MODERN_STYLE = `
  :root {
    --ink: #0f172a; --muted: #64748b; --line: #e2e8f0; --surface: #ffffff; --canvas: #f8fafc;
    --accent: #4f46e5; --accent-soft: #eef2ff; --accent-ink: #3730a3;
    --good: #16a34a; --good-soft: #f0fdf4; --bad: #dc2626; --bad-soft: #fef2f2;
    --warn: #d97706; --warn-soft: #fffbeb;
    --radius: 14px; --radius-sm: 8px;
  }
  * { box-sizing: border-box; }
  body { background: var(--canvas); font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: var(--ink); font-size: 13px; }
  .sheet { padding: 2mm 0; }
  .eyebrow { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); font-weight: 600; }
  h1 { font-size: 26px; letter-spacing: -0.02em; }
  h2.section-title { font-size: 16px; font-weight: 700; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
  h2.section-title .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--accent); display: inline-block; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 20px; }
  .grid { display: flex; gap: 14px; }
  .grid > * { flex: 1; min-width: 0; }
  .stat { border-radius: var(--radius); padding: 14px 16px; border: 1px solid var(--line); background: var(--surface); }
  .stat .label { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
  .stat .value { font-size: 23px; font-weight: 800; margin-top: 3px; letter-spacing: -0.01em; }
  table.modern { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.modern thead th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); padding: 8px 10px; border-bottom: 2px solid var(--line); font-weight: 700; }
  table.modern tbody td { padding: 7px 10px; border-bottom: 1px solid var(--line); }
  table.modern tbody tr:nth-child(even) { background: #fafbff; }
  table.modern tbody tr:last-child td { border-bottom: none; }
  .pill { display: inline-block; border-radius: 999px; padding: 2px 11px; font-weight: 700; font-size: 11px; }
  .bar-track { background: #eef0f4; border-radius: 999px; overflow: hidden; height: 9px; width: 100%; }
  .bar-fill { height: 100%; border-radius: 999px; }
  .legend-row { display: flex; justify-content: space-between; font-size: 12px; padding: 5px 0; border-bottom: 1px dashed var(--line); }
  .legend-row:last-child { border-bottom: none; }
  .signature-line { border-bottom: 1.5px solid var(--ink); width: 220px; height: 28px; }
`;

function modernBar(percentage: number, tone: 'good' | 'bad' | 'accent' = 'accent') {
  const clamped = Math.max(0, Math.min(1, percentage));
  const color = tone === 'good' ? 'var(--good)' : tone === 'bad' ? 'var(--bad)' : 'var(--accent)';
  return `<div class="bar-track"><div class="bar-fill" style="width:${clamped * 100}%;background:${color};"></div></div>`;
}

function statCard(label: string, value: string, accent: string) {
  return `<div class="stat"><div class="label">${esc(label)}</div><div class="value" style="color:${accent};">${esc(value)}</div></div>`;
}

function sectionTitle(text: string) {
  return `<h2 class="section-title"><span class="dot"></span>${esc(text)}</h2>`;
}

function pillFor(achieved: number, threshold: number) {
  const ok = achieved >= threshold;
  return `<span class="pill" style="background:${ok ? 'var(--good-soft)' : 'var(--bad-soft)'};color:${ok ? 'var(--good)' : 'var(--bad)'};">${pct(achieved)}</span>`;
}

function buildModernReport(data: CoPoReportData): string {
  const { course, instructorName, rows, summary, gradingScale, coPoMatrix, coMarkDistribution } = data;
  const passCount = summary.n - summary.withdrawnCount - summary.incompleteCount - summary.distributionCounts[GRADE_DISTRIBUTION.findIndex((d) => d.grade === 'F (Fail)')];
  const passRate = summary.n > 0 ? passCount / summary.n : 0;
  const attendanceRate = summary.n > 0 && summary.sessionCount > 0 ? 1 - summary.absentStudentCount / summary.n : 1;
  const maxDistribution = Math.max(1, ...summary.distributionCounts);

  const studentTableRows = rows.map((r, i) => `
    <tr>
      <td style="color:var(--muted);">${i + 1}</td>
      <td>${esc(r.student.studentId)}</td>
      <td style="font-weight:600;">${esc(r.student.name)}</td>
      <td style="text-align:center;">${r.total}</td>
      <td style="text-align:center;">${num(r.percent * 100, 1)}%</td>
      <td style="text-align:center;"><span class="pill" style="background:var(--accent-soft);color:var(--accent-ink);">${esc(r.gradeDisplay)}</span></td>
    </tr>`).join('');

  const distributionBars = GRADE_DISTRIBUTION.map(({ label }, i) => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:7px;">
      <div style="width:22px;font-size:11px;color:var(--muted);font-weight:600;">${label}</div>
      <div style="flex:1;">${modernBar(summary.distributionCounts[i] / maxDistribution)}</div>
      <div style="width:22px;font-size:11px;text-align:right;font-weight:600;">${summary.distributionCounts[i]}</div>
    </div>`).join('');

  const coBars = CO_LABELS.map((label, i) => `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
        <span style="font-weight:700;">${label}</span><span style="font-weight:600;color:var(--muted);">${pct(summary.coPercentageAvg[i])}</span>
      </div>
      ${modernBar(summary.coPercentageAvg[i], summary.coPercentageAvg[i] >= 0.55 ? 'good' : 'bad')}
    </div>`).join('');

  const poBars = PO_LABELS.map((label, i) => `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
        <span style="font-weight:700;">${label}</span><span style="font-weight:600;color:var(--muted);">${pct(summary.poPercentageAvg[i])}</span>
      </div>
      ${modernBar(summary.poPercentageAvg[i], summary.poPercentageAvg[i] >= 0.65 ? 'good' : 'bad')}
    </div>`).join('');

  const coMarkDistributionTable = `
    <table class="modern">
      <thead><tr><th>Assessment Item</th>${CO_LABELS.map((c) => `<th style="text-align:center;">${c}</th>`).join('')}</tr></thead>
      <tbody>${coMarkDistribution.map(({ label, values }, idx) => `
        <tr style="${idx === coMarkDistribution.length - 1 ? 'font-weight:700;background:var(--accent-soft);' : ''}">
          <td>${esc(label)}</td>${values.map((v) => `<td style="text-align:center;">${num(v, 0)}</td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table>`;

  const mappingGrid = `
    <table class="modern" style="font-size:11px;">
      <thead><tr><th></th>${PO_LABELS.map((p) => `<th style="text-align:center;">${p}</th>`).join('')}</tr></thead>
      <tbody>${CO_LABELS.map((co, ci) => `
        <tr>
          <td style="font-weight:700;">${co}</td>
          ${PO_LABELS.map((_, pi) => `<td style="text-align:center;">${coPoMatrix[ci]?.[pi] ? '<span style="color:var(--good);font-weight:800;">✓</span>' : '<span style="color:#cbd5e1;">·</span>'}</td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table>`;

  const gradingScaleChips = gradingScale.map((g) => `
    <div class="legend-row">
      <span style="color:var(--muted);">${g.threshold}% and above</span><span style="font-weight:700;">${getGradeDisplay(g.letter, g.modifier)}</span>
    </div>`).join('');

  const cqiRows = CO_LABELS.map((label, i) => {
    const achieved = summary.gradedCount > 0 ? summary.coAttainedCounts[i] / summary.gradedCount : 0;
    return `<tr>
      <td style="font-weight:700;">${label}</td>
      <td style="color:var(--muted);">60% of students to achieve 55% of the allocated mark</td>
      <td style="text-align:center;">${pillFor(achieved, 0.6)}</td>
    </tr>`;
  }).join('');

  return `
  <div class="sheet">
    <div style="background:linear-gradient(135deg,#4338ca,#7c3aed 60%,#a855f7);color:#fff;border-radius:var(--radius);padding:26px 30px;">
      <div class="eyebrow" style="color:rgba(255,255,255,0.75);">Course File Report</div>
      <h1 style="margin:6px 0 4px;color:#fff;">${esc(course.name)}</h1>
      <div style="font-size:13px;opacity:0.92;">${esc(course.code)} &nbsp;·&nbsp; Section ${esc(course.section)} &nbsp;·&nbsp; ${esc(course.semester)} ${esc(course.year)} &nbsp;·&nbsp; Instructor: ${esc(instructorName)}</div>
    </div>
    <div class="grid" style="margin-top:16px;">
      ${statCard('Students', String(summary.n), 'var(--accent)')}
      ${statCard('Pass Rate', pct(passRate, 0), 'var(--good)')}
      ${statCard('Withdrawn', String(summary.withdrawnCount), 'var(--bad)')}
      ${statCard('Attendance ≥75%', pct(attendanceRate, 0), '#0891b2')}
    </div>
    <div class="grid" style="margin-top:14px;">
      <div class="card">
        ${sectionTitle('Grade Distribution')}
        ${distributionBars}
      </div>
      <div class="card">
        ${sectionTitle('Grading Scale')}
        ${gradingScaleChips}
      </div>
    </div>
  </div>

  <div class="sheet">
    ${sectionTitle('Student Grade Sheet')}
    <div class="card" style="padding:8px 16px;">
      <table class="modern">
        <thead><tr>
          <th>No.</th><th>Student ID</th><th>Name</th>
          <th style="text-align:center;">Total</th><th style="text-align:center;">%</th><th style="text-align:center;">Grade</th>
        </tr></thead>
        <tbody>${studentTableRows}</tbody>
      </table>
    </div>
  </div>

  <div class="sheet">
    ${sectionTitle('CO Mark Distribution')}
    <div class="card" style="margin-bottom:16px;padding:8px 16px;">
      ${coMarkDistributionTable}
    </div>
    <div class="grid">
      <div class="card">
        ${sectionTitle('Course Outcome (CO) Attainment')}
        ${coBars}
      </div>
      <div class="card">
        ${sectionTitle('Program Outcome (PO) Attainment')}
        ${poBars}
      </div>
    </div>
  </div>

  <div class="sheet">
    ${sectionTitle('CO → PO Mapping')}
    <div class="card" style="padding:8px 16px;">
      ${mappingGrid}
    </div>
  </div>

  <div class="sheet">
    ${sectionTitle('Continuous Quality Improvement (CQI)')}
    <div class="card" style="padding:8px 16px;margin-bottom:16px;">
      <table class="modern">
        <thead><tr><th>CO</th><th>Criteria</th><th style="text-align:center;">Attainment</th></tr></thead>
        <tbody>${cqiRows}</tbody>
      </table>
    </div>
    <div class="card" style="border-style:dashed;color:var(--muted);font-size:12px;">
      Plan for Course Improvement (fill in by hand):
      <div style="margin-top:10px;" class="signature-line"></div>
    </div>
    <div style="margin-top:26px;font-size:13px;">
      <div class="signature-line"></div>
      <div style="margin-top:8px;font-weight:600;">${esc(instructorName)}</div>
      <div style="color:var(--muted);font-size:12px;">${new Date().toLocaleDateString()}</div>
    </div>
  </div>
  `;
}

export function buildCoPoPdfHtml(data: CoPoReportData, style: 'excel' | 'modern'): string {
  const body = style === 'modern' ? buildModernReport(data) : buildExcelStyleReport(data);
  const orientation = style === 'modern' ? 'portrait' : 'landscape';
  const styleBlock = pageStyleBase(orientation) + (style === 'modern' ? MODERN_STYLE : '');
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
