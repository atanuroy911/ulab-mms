// Renders a capstone track's course file (lib/capstoneCourseFile.ts) as one print-ready HTML
// document, the capstone counterpart of lib/coPoPdfReport.ts: styled HTML with @page rules
// that the browser prints to PDF, no server-side PDF dependency.
//
// Sheet order follows the CSE 4098A/B workbooks: Grade, one marking-detail sheet per
// evaluator-marked component, CO evaluation, CO-PO attainment, CQI - plus a closing sheet
// that states the scheme and CO definitions the numbers were computed under, so a printed
// file explains itself.

import { esc } from '@/lib/capstonePrint';
import { rubricLabels, taggedCriteria } from '@/lib/capstoneOutcomes';
import { COMPONENT_LABELS, type CourseFileData, type StudentCourseFileRow } from '@/lib/capstoneCourseFile';

export interface CourseFileMeta {
  courseCode: string;
  semesterName: string;
  departmentName: string;
  schemeName: string;
  schemeVersion: number | null;
  /** Why the department's default COs were used instead of the scheme's, when they were. */
  outcomesNote: string | null;
  coordinatorName: string;
  logoDataUri: string;
  generatedAt: Date;
}

const fmt = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? '' : String(Math.round(v * 10 ** digits) / 10 ** digits);
const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

/** Groups rows by project group so the supervisor/title cells can span the group's rows. */
function byGroup(rows: StudentCourseFileRow[]) {
  const groups: StudentCourseFileRow[][] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last[0].groupNumber === r.groupNumber) last.push(r);
    else groups.push([r]);
  }
  return groups;
}

function header(meta: CourseFileMeta, title: string) {
  return `<div class="head">
    <img src="${meta.logoDataUri}" alt="ULAB" />
    <div class="head-text">
      <div class="dept">Department of ${esc(meta.departmentName)}</div>
      <div class="title">${esc(title)}</div>
    </div>
    <div class="head-right">${esc(meta.courseCode)}<br />${esc(meta.semesterName)}</div>
  </div>`;
}

function footer(meta: CourseFileMeta) {
  return `<div class="foot"><span>Generated on ${esc(meta.generatedAt.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }))}</span><span>${esc(meta.schemeName)}${meta.schemeVersion ? ` v${meta.schemeVersion}` : ' (draft)'}</span></div>`;
}

function signature(meta: CourseFileMeta, role = 'Course Coordinator') {
  return `<div class="sign"><div class="line"></div><div><strong>${esc(meta.coordinatorName || '')}</strong></div><div>${esc(role)}</div><div>Department of ${esc(meta.departmentName)}, ULAB</div></div>`;
}

function warningsBox(data: CourseFileData) {
  if (!data.warnings.length) return '';
  return `<div class="warn">${data.warnings.map((w) => `<div>${esc(w)}</div>`).join('')}</div>`;
}

// ── Grade sheet ───────────────────────────────────────────────────────────────────────────

function gradeSheet(data: CourseFileData, meta: CourseFileMeta) {
  const cols = data.columns;
  const body = byGroup(data.rows)
    .map((group) =>
      group
        .map(
          (r, i) => `<tr${r.missing.length || r.score === null ? ' class="incomplete"' : ''}>
        <td>${data.rows.indexOf(r) + 1}</td>
        <td>${esc(r.studentId)}</td>
        <td class="left">${esc(r.name)}</td>
        ${cols.map((c) => `<td>${fmt(r.components[c.nodeId])}</td>`).join('')}
        <td class="strong">${fmt(r.score)}</td>
        <td class="strong">${esc(r.letter || '')}</td>
        ${i === 0 ? `<td rowspan="${group.length}" class="left small">${esc(r.supervisorName)}</td><td rowspan="${group.length}" class="left small">G${r.groupNumber}: ${esc(r.projectTitle)}</td>` : ''}
      </tr>`
        )
        .join('')
    )
    .join('');

  const graded = data.rows.filter((r) => r.letter).length;
  return `<section class="sheet">
    ${header(meta, `Grade Sheet — ${meta.courseCode} Capstone Project [${meta.semesterName}]`)}
    ${warningsBox(data)}
    <table class="info">
      <tr><th>Course Code</th><td>${esc(meta.courseCode)}</td><th>Course Title</th><td>Capstone Project</td></tr>
      <tr><th>Semester</th><td>${esc(meta.semesterName)}</td><th>Number of Students</th><td>${data.rows.length}</td></tr>
    </table>
    <table class="grid">
      <thead><tr>
        <th>Sl</th><th>Student ID</th><th>Name</th>
        ${cols.map((c) => `<th>${esc(c.label)}${c.label.includes(fmt(c.max)) ? '' : `<div class="sub">out of ${fmt(c.max)}</div>`}</th>`).join('')}
        <th>Total<div class="sub">out of ${fmt(data.totalMax)}</div></th><th>Grade</th><th>Supervisor</th><th>Group / Project</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="row-flex">
      <table class="grid narrow">
        <thead><tr><th>Grade</th><th>Min %</th><th>Students</th><th>%</th></tr></thead>
        <tbody>
          ${data.gradeDistribution
            .map((g) => {
              const band = data.bands.find((b) => b.letter === g.letter);
              return `<tr><td>${esc(g.letter)}</td><td>${fmt(band?.min ?? 0, 0)}</td><td>${g.count}</td><td>${graded ? pct(g.count / graded) : ''}</td></tr>`;
            })
            .join('')}
          <tr class="strong"><td>Total</td><td></td><td>${graded}</td><td></td></tr>
        </tbody>
      </table>
      ${signature(meta)}
    </div>
    ${footer(meta)}
  </section>`;
}

// ── Marking detail per component ──────────────────────────────────────────────────────────

function detailSheet(data: CourseFileData, meta: CourseFileMeta, sheet: CourseFileData['detailSheets'][number]) {
  const evs = sheet.evaluators;
  const body = data.rows
    .map((r, idx) => {
      const d = r.details[sheet.component];
      if (!d) return '';
      return `<tr>
        <td>${idx + 1}</td><td>${esc(r.studentId)}</td><td class="left">${esc(r.name)}</td><td>G${r.groupNumber}</td>
        <td>${fmt(d.supervisor)}</td>
        ${evs
          .map((e) => {
            const c = d.evaluators[e.id];
            return c ? `<td class="${c.counted ? 'counted' : 'uncounted'}">${fmt(c.raw)}</td>` : '<td class="blank"></td>';
          })
          .join('')}
        <td>${fmt(d.evaluatorCombined)}${d.combineMode === 'max' ? '<span class="tag">best</span>' : ''}</td>
        ${sheet.finalLabel ? `<td class="strong">${fmt(d.final)}</td>` : ''}
      </tr>`;
    })
    .join('');

  return `<section class="sheet">
    ${header(meta, `${sheet.label} Marking — ${meta.courseCode} [${meta.semesterName}]`)}
    <table class="grid dense">
      <thead><tr>
        <th>Sl</th><th>Student ID</th><th>Name</th><th>Group</th>
        <th>Supervisor<div class="sub">/${fmt(sheet.rawMax)}</div></th>
        ${evs.map((e) => `<th class="ev" title="${esc(e.name)}">${esc(e.initials)}</th>`).join('')}
        <th>Counted evaluators<div class="sub">/${fmt(sheet.rawMax)}</div></th>
        ${sheet.finalLabel ? `<th>${esc(sheet.finalLabel)}${sheet.finalLabel.includes(fmt(sheet.finalMax)) ? '' : `<div class="sub">out of ${fmt(sheet.finalMax)}</div>`}</th>` : ''}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="legend">
      <div><span class="swatch counted"></span> counted toward the grade &nbsp; <span class="swatch uncounted"></span> marked, not counted (evaluator not chosen for this group) &nbsp; Counted evaluators are averaged unless the group is marked <em>best</em>.</div>
      ${evs.length ? `<div class="initials">${evs.map((e) => `<span><strong>${esc(e.initials)}</strong> ${esc(e.name)}</span>`).join('')}</div>` : '<div>No evaluator has marked this component yet.</div>'}
    </div>
    ${footer(meta)}
  </section>`;
}

// ── CO evaluation (per grader) ────────────────────────────────────────────────────────────

function coEvaluationSheet(data: CourseFileData, meta: CourseFileMeta, component: 'report' | 'presentation') {
  const cos = data.outcomes.filter((o) => o.source.kind === 'rubric' && o.source.component === component);
  const evalSlots = Math.max(
    0,
    ...data.rows.map((r) => (r.coGraders[component] || []).filter((g) => g.role === 'evaluator').length)
  );
  const slotLabels = [...Array.from({ length: evalSlots }, (_, i) => `Evaluator ${i + 1}`), 'Supervisor'];

  const body = data.rows
    .map((r, idx) => {
      const graders = r.coGraders[component] || [];
      const evals = graders.filter((g) => g.role === 'evaluator');
      const sup = graders.find((g) => g.role === 'supervisor');
      const slots = [...Array.from({ length: evalSlots }, (_, i) => evals[i]), sup];
      const initials = slots.map((g, i) => (g ? `${i < evalSlots ? `E${i + 1}` : 'S'}: ${g.name}` : '')).filter(Boolean).join('; ');
      return `<tr>
        <td>${idx + 1}</td><td>${esc(r.studentId)}</td><td class="left">${esc(r.name)}</td>
        ${slots
          .map((g) => cos.map((o, ci) => `<td class="${ci === 0 ? 'group-start ' : ''}${g?.estimated ? 'estimated' : ''}">${g ? fmt(g.values[o.key]) + (g.estimated ? '*' : '') : ''}</td>`).join(''))
          .join('')}
        ${cos.map((o, ci) => `<td class="strong${ci === 0 ? ' group-start' : ''}">${fmt(r.co[o.key])}</td>`).join('')}
        <td class="left tiny">${esc(initials)}</td>
      </tr>`;
    })
    .join('');

  const criteria = cos
    .map((o) => {
      const labels = rubricLabels(component, data.track);
      const idx = taggedCriteria(component, data.track, o.key);
      return `<div><strong>${esc(o.key)}</strong> (out of ${fmt(o.max)}): ${idx.map((i) => esc(labels[i].replace(/\s*\[CO[^\]]*\]/gi, ''))).join(', ')}</div>`;
    })
    .join('');

  return `<section class="sheet">
    ${header(meta, `CO ${COMPONENT_LABELS[component]} Evaluation — ${meta.courseCode} [${meta.semesterName}]`)}
    <table class="grid dense">
      <thead>
        <tr><th rowspan="2">Sl</th><th rowspan="2">Student ID</th><th rowspan="2">Name</th>
          ${slotLabels.map((l) => `<th colspan="${cos.length}" class="group-start">${esc(l)}</th>`).join('')}
          <th colspan="${cos.length}" class="group-start final">Final (average)</th><th rowspan="2">Graders</th></tr>
        <tr>${[...slotLabels, 'Final'].map(() => cos.map((o, ci) => `<th class="${ci === 0 ? 'group-start' : ''}">${esc(o.key)}<div class="sub">/${fmt(o.max)}</div></th>`).join('')).join('')}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <div class="legend">
      <div>Each grader's CO mark is the sum of the ${esc(COMPONENT_LABELS[component].toLowerCase())} rubric criteria tagged with that CO. Final = the average of the supervisor and every counted evaluator, equally weighted.${data.rows.some((r) => (r.coGraders[component] || []).some((g) => g.estimated)) ? ' * entered as a total only; CO split prorated.' : ''}</div>
      ${criteria}
    </div>
    ${footer(meta)}
  </section>`;
}

// ── CO-PO attainment ──────────────────────────────────────────────────────────────────────

function measuredBy(o: CourseFileData['outcomes'][number]) {
  return o.source.kind === 'rubric'
    ? `${COMPONENT_LABELS[o.source.component]} rubric`
    : `${COMPONENT_LABELS[o.source.component] || o.source.component} mark`;
}

function attainmentSheet(data: CourseFileData, meta: CourseFileMeta) {
  const { outcomes, pos, thresholds } = data;
  const items = [...new Set(outcomes.map(measuredBy))];

  const coRows = data.rows
    .map(
      (r, idx) => `<tr>
      <td>${idx + 1}</td><td>${esc(r.studentId)}</td><td class="left">${esc(r.name)}</td>
      ${outcomes.map((o, ci) => `<td class="${ci === 0 ? 'group-start' : ''}">${fmt(r.co[o.key])}</td>`).join('')}
      ${outcomes.map((o, ci) => `<td class="${r.coAttained[o.key] ? 'ok' : 'no'}${ci === 0 ? ' group-start' : ''}">${pct(r.coPercent[o.key], 0)}</td>`).join('')}
      ${pos.map((p, pi) => `<td class="${r.poAttained[p] ? 'ok' : 'no'}${pi === 0 ? ' group-start' : ''}">${pct(r.poPercent[p], 0)}</td>`).join('')}
    </tr>`
    )
    .join('');

  const summaryRow = (label: string, co: (s: CourseFileData['coSummary'][number]) => string, po: (s: CourseFileData['poSummary'][number]) => string) =>
    `<tr class="summary"><td colspan="3" class="left">${label}</td>${outcomes.map((_, ci) => `<td class="${ci === 0 ? 'group-start' : ''}"></td>`).join('')}${data.coSummary.map((s, ci) => `<td class="${ci === 0 ? 'group-start' : ''}">${co(s)}</td>`).join('')}${data.poSummary.map((s, pi) => `<td class="${pi === 0 ? 'group-start' : ''}">${po(s)}</td>`).join('')}</tr>`;

  return `<section class="sheet">
    ${header(meta, `CO-PO Attainment Analysis — ${meta.courseCode} [${meta.semesterName}]`)}
    <div class="row-flex top">
      <div>
        <div class="caption">Assessment items (marks per CO)</div>
        <table class="grid narrow">
          <thead><tr><th>Assessment item</th>${outcomes.map((o) => `<th>${esc(o.key)}</th>`).join('')}</tr></thead>
          <tbody>
            ${items.map((item) => `<tr><td class="left">${esc(item)}</td>${outcomes.map((o) => `<td>${measuredBy(o) === item ? fmt(o.max) : ''}</td>`).join('')}</tr>`).join('')}
            <tr class="strong"><td class="left">Total</td>${outcomes.map((o) => `<td>${fmt(o.max)}</td>`).join('')}</tr>
          </tbody>
        </table>
      </div>
      <div>
        <div class="caption">Mapping of COs to POs</div>
        <table class="grid narrow">
          <thead><tr><th></th>${Array.from({ length: 12 }, (_, i) => `<th>PO${i + 1}</th>`).join('')}</tr></thead>
          <tbody>${outcomes.map((o) => `<tr><td>${esc(o.key)}</td>${Array.from({ length: 12 }, (_, i) => `<td>${o.pos.includes(`PO${i + 1}`) ? '1' : ''}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
    <table class="grid dense">
      <thead>
        <tr><th rowspan="2">Sl</th><th rowspan="2">Student ID</th><th rowspan="2">Name</th>
          <th colspan="${outcomes.length}" class="group-start">CO marks</th>
          <th colspan="${outcomes.length}" class="group-start">CO % (attained at ${pct(thresholds.co, 0)})</th>
          <th colspan="${pos.length}" class="group-start">PO % (attained at ${pct(thresholds.po, 0)})</th></tr>
        <tr>
          ${outcomes.map((o, ci) => `<th class="${ci === 0 ? 'group-start' : ''}">${esc(o.key)}<div class="sub">/${fmt(o.max)}</div></th>`).join('')}
          ${outcomes.map((o, ci) => `<th class="${ci === 0 ? 'group-start' : ''}">${esc(o.key)}</th>`).join('')}
          ${pos.map((p, pi) => `<th class="${pi === 0 ? 'group-start' : ''}">${esc(p)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${coRows}
        ${summaryRow('Class average', (s) => pct(s.average, 1), (s) => pct(s.average, 1))}
        ${summaryRow('Students attained', (s) => String(s.attainedCount), (s) => String(s.attainedCount))}
        ${summaryRow(`Attainment (target ${pct(thresholds.classTarget, 0)})`, (s) => `<span class="${s.meetsTarget ? 'ok-text' : 'no-text'}">${pct(s.ratio, 0)}</span>`, (s) => `<span class="${s.meetsTarget ? 'ok-text' : 'no-text'}">${pct(s.ratio, 0)}</span>`)}
      </tbody>
    </table>
    <div class="legend"><span class="swatch ok"></span> attained &nbsp; <span class="swatch no"></span> not attained. A PO's percentage is the average of the COs mapped to it.</div>
    ${footer(meta)}
  </section>`;
}

// ── CQI ───────────────────────────────────────────────────────────────────────────────────

function cqiSheet(data: CourseFileData, meta: CourseFileMeta) {
  const t = data.thresholds;
  const criteria = `${pct(t.classTarget, 0)} of the students to achieve ${pct(t.co, 0)} of the allocated mark`;
  return `<section class="sheet">
    ${header(meta, `Continuous Quality Improvement — ${meta.courseCode} [${meta.semesterName}]`)}
    <table class="info">
      <tr><th>Course Code</th><td>${esc(meta.courseCode)}</td><th>Course Title</th><td>Capstone Project</td></tr>
      <tr><th>Semester</th><td>${esc(meta.semesterName)}</td><th>Number of Students</th><td>${data.rows.length}</td></tr>
    </table>
    <table class="grid cqi">
      <thead><tr><th>Course Outcome</th><th>Measured by</th><th>Criteria for achievement</th><th>Students attained</th><th>CO attainment</th><th>Status</th></tr></thead>
      <tbody>
        ${data.coSummary
          .map((s) => {
            const o = data.outcomes.find((x) => x.key === s.key)!;
            return `<tr><td>${esc(s.key)}${o.description ? `<div class="sub left">${esc(o.description)}</div>` : ''}</td><td>${esc(measuredBy(o))} (/${fmt(o.max)})</td><td class="left">${esc(criteria)}</td><td>${s.attainedCount} / ${data.rows.length}</td><td class="strong">${pct(s.ratio, 1)}</td><td class="${s.meetsTarget ? 'ok-text' : 'no-text'}">${s.meetsTarget ? 'Achieved' : 'Not achieved'}</td></tr>`;
          })
          .join('')}
      </tbody>
    </table>
    <div class="caption">Plan for course improvement (based on the course outcome analysis above, results and other sources)</div>
    <div class="write-lines">${'<div></div>'.repeat(7)}</div>
    ${signature(meta)}
    ${footer(meta)}
  </section>`;
}

// ── Scheme summary ────────────────────────────────────────────────────────────────────────

function schemeSheet(data: CourseFileData, meta: CourseFileMeta) {
  return `<section class="sheet">
    ${header(meta, `Assessment Scheme — ${meta.courseCode} [${meta.semesterName}]`)}
    <p class="note">Computed under <strong>${esc(meta.schemeName)}</strong> ${meta.schemeVersion ? `version ${meta.schemeVersion}` : '(unpublished draft)'}.
      ${meta.outcomesNote ? esc(meta.outcomesNote) : ''}</p>
    <div class="row-flex top">
      <div>
        <div class="caption">Components</div>
        <table class="grid narrow">
          <thead><tr><th>Component</th><th>Out of</th></tr></thead>
          <tbody>${data.columns.map((c) => `<tr><td class="left">${esc(c.label)}</td><td>${fmt(c.max)}</td></tr>`).join('')}<tr class="strong"><td class="left">Total</td><td>${fmt(data.totalMax)}</td></tr></tbody>
        </table>
        <div class="caption">Grade bands</div>
        <table class="grid narrow">
          <thead><tr><th>Grade</th><th>From</th></tr></thead>
          <tbody>${data.bands.map((b) => `<tr><td>${esc(b.letter)}</td><td>${fmt(b.min, 0)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="grow">
        <div class="caption">Course outcomes</div>
        <table class="grid">
          <thead><tr><th>CO</th><th>Description</th><th>Measured by</th><th>Out of</th><th>POs</th></tr></thead>
          <tbody>${data.outcomes
            .map((o) => {
              const how =
                o.source.kind === 'rubric'
                  ? `${COMPONENT_LABELS[o.source.component]} rubric criteria tagged [${o.key}], averaged over the supervisor and counted evaluators`
                  : `${COMPONENT_LABELS[o.source.component] || o.source.component} mark scaled to ${fmt(o.source.max)}`;
              return `<tr><td>${esc(o.key)}</td><td class="left">${esc(o.description || '')}</td><td class="left">${esc(how)}</td><td>${fmt(o.max)}</td><td>${esc(o.pos.join(', '))}</td></tr>`;
            })
            .join('')}</tbody>
        </table>
        <div class="caption">Thresholds</div>
        <table class="grid narrow">
          <tbody>
            <tr><td class="left">Student attains a CO at</td><td>${pct(data.thresholds.co, 0)}</td></tr>
            <tr><td class="left">Student attains a PO at</td><td>${pct(data.thresholds.po, 0)}</td></tr>
            <tr><td class="left">Class meets a CO when attained by</td><td>${pct(data.thresholds.classTarget, 0)} of students</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    ${footer(meta)}
  </section>`;
}

export function buildCourseFileHtml(data: CourseFileData, meta: CourseFileMeta): string {
  const sheets = data.rows.length
    ? [
        gradeSheet(data, meta),
        ...data.detailSheets.map((s) => detailSheet(data, meta, s)),
        ...data.coRubricComponents.map((c) => coEvaluationSheet(data, meta, c)),
        attainmentSheet(data, meta),
        cqiSheet(data, meta),
        schemeSheet(data, meta),
      ]
    : [`<section class="sheet">${header(meta, `Course File — ${meta.courseCode}`)}<p class="note">This track has no students yet.</p></section>`];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(meta.courseCode)} Course File - ${esc(meta.semesterName)}</title>
  <style>
    @page { size: A4 landscape; margin: 9mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #111; font-family: Arial, Helvetica, sans-serif; font-size: 9px; }
    .sheet { page-break-after: always; break-after: page; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .head { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #1f5aa6; padding-bottom: 5px; margin-bottom: 8px; }
    .head img { height: 34px; }
    .head-text { flex: 1; }
    .dept { color: #1f5aa6; font-size: 13px; font-weight: 700; }
    .title { font-size: 12px; font-weight: 700; margin-top: 2px; }
    .head-right { text-align: right; font-size: 10px; color: #333; }
    .foot { display: flex; justify-content: space-between; border-top: 1px solid #999; margin-top: 8px; padding-top: 3px; font-size: 8px; color: #444; }
    table { border-collapse: collapse; }
    .grid { width: 100%; margin-bottom: 8px; }
    .grid.narrow { width: auto; }
    .grid th, .grid td { border: 1px solid #555; padding: 2px 3px; text-align: center; vertical-align: middle; }
    .grid th { background: #dbe5f1; font-weight: 700; }
    .grid thead { display: table-header-group; }
    .grid tr { break-inside: avoid; page-break-inside: avoid; }
    .grid.dense th, .grid.dense td { padding: 1px 2px; font-size: 8px; }
    .grid.dense td.left { white-space: nowrap; }
    .grid.dense td.tiny { white-space: normal; }
    .grid th.ev { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; padding: 3px 1px; }
    .sub { font-weight: 400; font-size: 7.5px; color: #333; }
    .left { text-align: left !important; }
    .small { font-size: 8px; }
    .tiny { font-size: 7px; color: #333; }
    .strong, tr.strong td { font-weight: 700; }
    .group-start { border-left: 2px solid #111 !important; }
    th.final { background: #c6dbef; }
    td.counted { background: #fff; }
    td.uncounted { background: #eee; color: #888; font-style: italic; text-decoration: line-through; }
    td.blank { background: #fafafa; }
    td.estimated { color: #8a5a00; }
    td.ok { background: #d9f0d3; }
    td.no { background: #fbe3e3; }
    .ok-text { color: #11632b; font-weight: 700; }
    .no-text { color: #a11919; font-weight: 700; }
    tr.incomplete td { background: #fff7d6; }
    tr.summary td { background: #f2f2f2; font-weight: 700; }
    .tag { display: inline-block; margin-left: 2px; padding: 0 2px; border: 1px solid #999; border-radius: 2px; font-size: 6.5px; }
    .info { margin-bottom: 8px; }
    .info th, .info td { padding: 2px 8px 2px 0; text-align: left; font-size: 10px; }
    .info th { font-weight: 700; }
    .row-flex { display: flex; gap: 18px; align-items: flex-end; }
    .row-flex.top { align-items: flex-start; }
    .grow { flex: 1; }
    .caption { font-weight: 700; font-size: 10px; margin: 6px 0 3px; }
    .legend { font-size: 8px; color: #333; line-height: 1.5; }
    .legend .initials { display: flex; flex-wrap: wrap; gap: 2px 12px; margin-top: 3px; }
    .swatch { display: inline-block; width: 10px; height: 8px; border: 1px solid #777; vertical-align: middle; }
    .swatch.counted { background: #fff; } .swatch.uncounted { background: #eee; }
    .swatch.ok { background: #d9f0d3; } .swatch.no { background: #fbe3e3; }
    .warn { border: 1px solid #d4a400; background: #fff7d6; padding: 4px 8px; margin-bottom: 8px; font-size: 9px; }
    .note { font-size: 10px; }
    .cqi td, .cqi th { font-size: 10px; padding: 4px; }
    .write-lines div { border-bottom: 1px solid #555; height: 20px; }
    .sign { margin-left: auto; min-width: 200px; font-size: 10px; line-height: 1.4; padding-top: 24px; }
    .sign .line { border-top: 1px solid #111; margin-bottom: 3px; }
    .toolbar { display: none; }
    @media screen {
      body { background: #e5e5e5; }
      .sheet { background: #fff; width: 297mm; max-width: calc(100% - 16px); min-height: 190mm; margin: 12px auto; padding: 9mm; box-shadow: 0 1px 4px rgba(0,0,0,.2); overflow-x: auto; }
      .toolbar { display: flex; gap: 8px; align-items: center; position: sticky; top: 0; z-index: 2; background: #1f2937; color: #fff; padding: 8px 12px; font-size: 13px; }
      .toolbar .beta { background: #f59e0b; color: #111; border-radius: 4px; padding: 1px 6px; font-weight: 700; font-size: 11px; }
      .toolbar button { margin-left: auto; padding: 6px 12px; font: 13px Arial, sans-serif; cursor: pointer; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><span class="beta">BETA</span><span>${esc(meta.courseCode)} course file · ${esc(meta.semesterName)}</span><button onclick="window.print()">Print / Save as PDF</button></div>
  ${sheets.join('\n')}
</body>
</html>`;
}
