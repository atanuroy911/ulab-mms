import { esc } from '@/lib/capstonePrint';
import type { GroupGrades, MemberGrade } from '@/lib/capstoneGrades';

// Capstone grade reports - compact, monochrome, in the manner of the university's own grade
// report: a header block, then tight ruled tables. Printable HTML (the browser saves PDF), like
// the other capstone sheets. Three kinds:
//   student - one student's capstone parts across every term, grouped by term
//   groups  - one block per group: members, component marks, total and grade
//   roster  - every student of a session in one table per track, with a grade summary

/** ULAB letter grade points (from the grade report legend). */
export const GRADE_POINTS: Record<string, number> = {
  'A+': 4.0,
  A: 4.0,
  'A-': 3.8,
  'B+': 3.3,
  B: 3.0,
  'B-': 2.8,
  'C+': 2.5,
  C: 2.2,
  D: 1.5,
  F: 0,
};
const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'];

export const courseCode = (department: string, track: string) => `${department}4098${track}`;
export const courseTitle = (track: string) => `Capstone Project ${track}`;

export interface Component {
  key: string;
  short: string;
  max: number | null;
}

/** "Report (out of 40)" -> Report / 40; "Peer Mark (0-5)" -> Peer Mark / 5. */
function parseLabel(label: string): { short: string; max: number | null } {
  const max = label.match(/out of\s*(\d+(?:\.\d+)?)/i)?.[1] ?? label.match(/\(\s*0\s*-\s*(\d+(?:\.\d+)?)\s*\)/)?.[1] ?? null;
  return { short: label.replace(/\s*\([^)]*\)\s*$/, '').trim() || label, max: max === null ? null : Number(max) };
}

/** A track's component columns, in the scheme's order (from any graded member). */
export function componentsOf(group: GroupGrades): Component[] {
  const sample = group.members.find((m) => m.trace?.length);
  if (!sample) return [];
  return group.componentNodeIds
    .map((id) => sample.trace.find((e) => e.nodeId === id))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((e) => ({ key: e.nodeId, ...parseLabel(e.label) }));
}

export const valueOf = (m: MemberGrade, key: string) => m.trace?.find((e) => e.nodeId === key)?.value ?? null;

/** Whole marks as they are, fractional ones to two places - so columns read evenly. */
const num = (v: number | null | undefined) => (v === null || v === undefined ? '-' : Number.isInteger(v) ? String(v) : v.toFixed(2));
const total = (v: number | null | undefined) => (v === null || v === undefined ? '-' : v.toFixed(2));
/** Imported names sometimes carry the ID: "Mehedi Hasan (233014089)". */
const cleanName = (n: string | null) => (n || '').replace(/\s*\(\d{6,}\)\s*$/, '');
const gp = (letter: string | null) => (letter && letter in GRADE_POINTS ? GRADE_POINTS[letter].toFixed(2) : '-');

// ── Shared page frame ──────────────────────────────────────────────────────────────────

export interface Frame {
  logoDataUri: string;
  department: string;
  departmentName: string;
  title: string;
  /** e.g. "Summer 2026 · CSE4098A" - under the title. */
  subtitle?: string;
}

function page(frame: Frame, body: string) {
  const generated = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(frame.title)}${frame.subtitle ? ` - ${esc(frame.subtitle)}` : ''}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 12mm 14mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 9px Arial, sans-serif; } }
    * { box-sizing: border-box; }
    html, body { margin: 0; color: #000; font: 10.5px/1.35 Arial, Helvetica, sans-serif; }
    .head { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding-bottom: 6px; border-bottom: 1.5px solid #000; }
    .head img { height: 54px; }
    .uni { font: 700 17px/1.1 "Times New Roman", Times, serif; letter-spacing: .2px; }
    .uni small { display: block; font: 9.5px/1.4 Arial, sans-serif; letter-spacing: 0; color: #222; }
    .doc { text-align: right; }
    .doc h1 { margin: 0; font: 700 18px/1.1 "Times New Roman", Times, serif; }
    .doc p { margin: 2px 0 0; font-size: 9.5px; }
    .note { margin: 4px 0 8px; font-size: 8.5px; color: #333; text-align: right; }
    .id { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px 24px; margin: 8px 0 10px; font-size: 11.5px; }
    .id b { display: inline-block; min-width: 92px; font-weight: 400; }
    h2 { margin: 12px 0 2px; font: 700 12px/1.2 Arial, sans-serif; border-bottom: 1px solid #000; padding-bottom: 1px; }
    h3 { margin: 10px 0 2px; font: 700 11px/1.25 Arial, sans-serif; }
    .meta { margin: 0 0 3px; font-size: 9.5px; color: #222; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td { overflow-wrap: anywhere; }
    th { font-weight: 700; text-align: left; border-bottom: 1px solid #000; padding: 2px 4px; font-size: 9.5px; line-height: 1.15; vertical-align: bottom; }
    td { padding: 1.5px 4px; vertical-align: top; }
    tbody tr + tr td { border-top: 0.5px dotted #999; }
    .r { text-align: right; } .c { text-align: center; }
    .mono { font-variant-numeric: tabular-nums; letter-spacing: .2px; }
    .sub { font-size: 9px; color: #333; }
    .block { break-inside: avoid; page-break-inside: avoid; }
    .totals { display: flex; flex-wrap: wrap; gap: 4px 24px; margin-top: 4px; padding-top: 3px; border-top: 1px solid #000; font-weight: 700; }
    .legend { margin-top: 14px; padding-top: 4px; border-top: 1px solid #000; font-size: 8.5px; color: #222; }
    .legend .scale { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-bottom: 2px; }
    .sign { display: flex; justify-content: space-between; margin-top: 34px; font-size: 9.5px; }
    .sign div { border-top: 1px dotted #000; padding-top: 2px; min-width: 150px; text-align: center; }
    .empty { padding: 24px; text-align: center; color: #444; }
    @media screen {
      body { background: #e6e6e6; }
      .paper { background: #fff; width: 210mm; min-height: 297mm; margin: 16px auto; padding: 12mm; box-shadow: 0 1px 4px rgba(0,0,0,.25); }
      .print-btn { position: fixed; top: 12px; right: 12px; padding: 8px 14px; font: 13px Arial, sans-serif; cursor: pointer; }
    }
    @media print { .print-btn { display: none; } .paper { padding: 0; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  <div class="paper">
    <header class="head">
      <img src="${frame.logoDataUri}" alt="ULAB" />
      <div class="uni">University of Liberal Arts Bangladesh
        <small>${esc(frame.departmentName)}</small>
        <small>688 Beribadh Road, Mohammadpur, Dhaka-1207, Bangladesh</small>
      </div>
      <div class="doc"><h1>${esc(frame.title)}</h1>${frame.subtitle ? `<p>${esc(frame.subtitle)}</p>` : ''}<p>Date: ${esc(generated)}</p></div>
    </header>
    <p class="note">Department record of capstone results - not an official university transcript.</p>
    ${body}
    <div class="legend">
      <div class="scale">${GRADE_ORDER.map((g) => `<span>${g} = ${GRADE_POINTS[g].toFixed(1)}</span>`).join('')}</div>
      Marks are the components the track's grading scheme combines into the total out of 100. GP: grade point.
    </div>
  </div>
</body>
</html>`;
}

// ── Student: every capstone part, by term ──────────────────────────────────────────────

export interface StudentTerm {
  semesterName: string;
  sessionStatus: string;
  track: string;
  groupNumber: number;
  projectTitle: string;
  supervisorName: string | null;
  components: Component[];
  member: MemberGrade;
}

export function studentReport(
  frame: Frame,
  student: { studentId: string; name: string; program?: string | null },
  terms: StudentTerm[]
) {
  const graded = terms.filter((t) => t.member.letter && t.member.letter in GRADE_POINTS && t.sessionStatus === 'closed');
  const passed = graded.filter((t) => t.member.letter !== 'F');
  const avg = graded.length ? graded.reduce((n, t) => n + GRADE_POINTS[t.member.letter!], 0) / graded.length : null;

  const row = (t: StudentTerm) => {
    const final = t.sessionStatus === 'closed';
    const marks = t.components.map((c) => `${esc(c.short)} ${num(valueOf(t.member, c.key))}${c.max !== null ? `/${c.max}` : ''}`).join(' &nbsp;·&nbsp; ');
    return `<tr>
          <td class="mono">${esc(courseCode(frame.department, t.track))}</td>
          <td>${esc(courseTitle(t.track))} - Group ${t.groupNumber}${t.projectTitle ? `: ${esc(t.projectTitle)}` : ''}
            <div class="sub">${marks || 'No marks yet'}${t.supervisorName ? ` &nbsp;|&nbsp; Supervisor: ${esc(t.supervisorName)}` : ''}</div>
            ${!final ? '<div class="sub"><i>Term in progress - provisional</i></div>' : ''}
            ${t.member.missingComponents.length ? `<div class="sub"><i>Not yet graded: ${esc(t.member.missingComponents.join(', '))}</i></div>` : ''}</td>
          <td class="r">${total(t.member.score)}</td>
          <td class="c"><b>${esc(t.member.letter || '-')}</b></td>
          <td class="r">${final ? gp(t.member.letter) : '-'}</td>
        </tr>`;
  };
  const termNames = [...new Set(terms.map((t) => t.semesterName))];
  const blocks = termNames
    .map(
      (name) => `<section class="block">
      <h2>${esc(name)}</h2>
      <table><colgroup><col style="width:12%" /><col /><col style="width:9%" /><col style="width:7%" /><col style="width:6%" /></colgroup>
        <thead><tr><th>Course</th><th>Title</th><th class="r">Marks</th><th class="c">Grade</th><th class="r">GP</th></tr></thead>
        <tbody>${terms.filter((t) => t.semesterName === name).map(row).join('')}</tbody>
      </table>
    </section>`
    )
    .join('');

  const body = `
    <div class="id">
      <div><b>ID</b>: <span class="mono">${esc(student.studentId)}</span></div>
      <div><b>Department</b>: ${esc(frame.department)}</div>
      <div><b>Name</b>: ${esc(cleanName(student.name))}</div>
      <div><b>Program</b>: ${esc(student.program || '-')}</div>
    </div>
    ${blocks || '<p class="empty">No capstone records for this student.</p>'}
    <div class="totals">
      <span>Capstone parts completed: ${passed.length} of 3</span>
      <span>Graded: ${graded.length}</span>
      <span>Capstone GPA: ${avg === null ? '-' : avg.toFixed(2)}</span>
    </div>
    <div class="sign"><div>Prepared by</div><div>Capstone Coordinator</div><div>Head of Department</div></div>`;
  return page(frame, body);
}

// ── Groups: one block per group ────────────────────────────────────────────────────────

export interface GroupExtra {
  evaluators: string[];
  /** Initials from an imported workbook, when no supervisor is set yet. */
  supervisorLabel?: string | null;
}

function memberRows(group: GroupGrades, comps: Component[], withGroupCol = false) {
  return group.members
    .map(
      (m, i) => `<tr>
        <td class="r">${i + 1}</td>
        <td class="mono">${esc(m.studentId)}</td>
        <td>${esc(cleanName(m.name))}</td>
        ${withGroupCol ? `<td class="c">${group.groupNumber}</td>` : ''}
        ${comps.map((c) => `<td class="r">${num(valueOf(m, c.key))}</td>`).join('')}
        <td class="r"><b>${total(m.score)}</b></td>
        <td class="c"><b>${esc(m.letter || '-')}</b></td>
        <td class="r">${gp(m.letter)}</td>
      </tr>`
    )
    .join('');
}

const compHeads = (comps: Component[]) => comps.map((c) => `<th class="r">${esc(c.short)}${c.max !== null ? ` /${c.max}` : ''}</th>`).join('');

/** The same column widths in every table, so stacked group tables line up. */
function colgroup(comps: Component[], withGroup: boolean) {
  const fixed = [4, 11, withGroup ? 26 : 30, ...(withGroup ? [5] : [])];
  const tail = [8, 6, 6];
  const each = (100 - fixed.reduce((a, b) => a + b, 0) - tail.reduce((a, b) => a + b, 0)) / Math.max(1, comps.length);
  return `<colgroup>${[...fixed, ...comps.map(() => each), ...tail].map((w) => `<col style="width:${w.toFixed(2)}%" />`).join('')}</colgroup>`;
}

export function groupsReport(frame: Frame, groups: Array<{ grades: GroupGrades; extra: GroupExtra }>) {
  const body = groups.length
    ? groups
        .map(({ grades: g, extra }) => {
          const comps = componentsOf(g);
          return `<section class="block">
      <h3>${esc(courseCode(frame.department, g.track))} · Group ${g.groupNumber}${g.projectTitle ? ` - ${esc(g.projectTitle)}` : ''}</h3>
      <p class="meta">Supervisor: ${esc(g.supervisorName || extra.supervisorLabel || '-')}${extra.evaluators.length ? ` &nbsp;|&nbsp; Evaluators: ${esc(extra.evaluators.join(', '))}` : ''}</p>
      <table>${colgroup(comps, false)}
        <thead><tr><th class="r">#</th><th>ID</th><th>Name</th>${compHeads(comps)}<th class="r">Total</th><th class="c">Grade</th><th class="r">GP</th></tr></thead>
        <tbody>${memberRows(g, comps)}</tbody>
      </table>
    </section>`;
        })
        .join('')
    : '<p class="empty">No groups.</p>';
  return page(frame, body + '<div class="sign"><div>Capstone Coordinator</div><div>Head of Department</div></div>');
}

// ── Roster: every student, one table per track ─────────────────────────────────────────

export function rosterReport(frame: Frame, groups: GroupGrades[]) {
  const tracks = [...new Set(groups.map((g) => g.track))].sort();
  const body = tracks
    .map((track) => {
      const tg = groups.filter((g) => g.track === track).sort((a, b) => a.groupNumber - b.groupNumber);
      const comps = componentsOf(tg.find((g) => g.members.some((m) => m.trace?.length)) || tg[0]);
      const members = tg.flatMap((g) => g.members);
      const dist = GRADE_ORDER.map((l) => [l, members.filter((m) => m.letter === l).length] as const).filter(([, n]) => n > 0);
      const ungraded = members.filter((m) => !m.letter).length;
      let i = 0;
      const rows = tg
        .flatMap((g) =>
          g.members.map(
            (m) => `<tr>
          <td class="r">${++i}</td>
          <td class="mono">${esc(m.studentId)}</td>
          <td>${esc(cleanName(m.name))}</td>
          <td class="c">${g.groupNumber}</td>
          ${comps.map((c) => `<td class="r">${num(valueOf(m, c.key))}</td>`).join('')}
          <td class="r"><b>${total(m.score)}</b></td>
          <td class="c"><b>${esc(m.letter || '-')}</b></td>
          <td class="r">${gp(m.letter)}</td>
        </tr>`
          )
        )
        .join('');
      return `<section>
      <h2>${esc(courseCode(frame.department, track))} - ${esc(courseTitle(track))} &nbsp;<span class="sub">${members.length} students · ${tg.length} groups</span></h2>
      <table>${colgroup(comps, true)}
        <thead><tr><th class="r">#</th><th>ID</th><th>Name</th><th class="c">Grp</th>${compHeads(comps)}<th class="r">Total</th><th class="c">Grade</th><th class="r">GP</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <span>${dist.map(([l, n]) => `${l}: ${n}`).join(' &nbsp; ')}${ungraded ? ` &nbsp; Not graded: ${ungraded}` : ''}</span>
        <span>Passed: ${members.filter((m) => m.letter && m.letter !== 'F').length} of ${members.length}</span>
      </div>
    </section>`;
    })
    .join('');
  return page(frame, (body || '<p class="empty">No students.</p>') + '<div class="sign"><div>Capstone Coordinator</div><div>Head of Department</div></div>');
}
