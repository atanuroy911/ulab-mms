import { esc } from '@/lib/capstonePrint';
import { entryState, type JournalEntryState } from '@/lib/capstoneJournalStatus';
import { parseJournal, JOURNAL_SECTIONS } from '@/lib/journalSections';
import { courseCode, type Frame } from '@/lib/capstoneTranscript';

// The weekly journal as a printable record: one block per group, one compact table per
// student, every week with when it was recorded and when the supervisor responded. Like the
// grade reports, a styled HTML page the browser prints to PDF.

export interface JournalReportEntry {
  weekNumber: number;
  workDone: string;
  submittedAt?: Date | null;
  supervisorComment?: string;
  supervisorReviewedAt?: Date | null;
  reviewerName?: string | null;
  correctedAt?: Date | null;
}

export interface JournalReportMember {
  studentId: string;
  name: string;
  leader: boolean;
  journalMark: number | null;
  entries: JournalReportEntry[];
}

export interface JournalReportGroup {
  track: string;
  groupNumber: number;
  projectTitle: string;
  supervisorName: string | null;
  members: JournalReportMember[];
}

const STATE_LABEL: Record<JournalEntryState, string> = {
  reviewed: 'Reviewed',
  submitted: 'Awaiting review',
  missed: 'Not submitted',
  'not-started': 'Not written',
};

/** "02 Oct 2026, 14:05" in Dhaka time - the record must not depend on the server's zone. */
export function dhakaDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(d));
  const p = (t: string) => parts.find((x) => x.type === t)?.value || '';
  return `${p('day')} ${p('month')} ${p('year')}, ${p('hour')}:${p('minute')}`;
}

const when = (d: Date | null | undefined) => {
  const s = dhakaDateTime(d);
  if (!s) return '-';
  const [date, time] = s.split(', ');
  return `${esc(date)}<br><span class="sub">${esc(time)}</span>`;
};

/** The guided answers inline, each led by its heading; older free text as it is. */
function entryHtml(text: string) {
  if (!text.trim()) return '';
  const { answers, structured } = parseJournal(text);
  if (!structured) return esc(text.trim()).replace(/\n+/g, '<br>');
  return JOURNAL_SECTIONS.filter((s) => answers[s.key].trim())
    .map((s) => `<div><b>${esc(s.heading)}:</b> ${esc(answers[s.key].trim()).replace(/\n+/g, '<br>')}</div>`)
    .join('');
}

function memberBlock(m: JournalReportMember, weekCount: number) {
  const byWeek = new Map(m.entries.map((e) => [e.weekNumber, e]));
  const weeks = Math.max(weekCount, ...m.entries.map((e) => e.weekNumber), 0);
  const counts = { reviewed: 0, submitted: 0, missed: 0, 'not-started': 0 } as Record<JournalEntryState, number>;
  const rows = Array.from({ length: weeks }, (_, i) => i + 1)
    .map((week) => {
      const e = byWeek.get(week);
      const state = entryState(e);
      counts[state]++;
      if (state === 'not-started') {
        return `<tr class="nil"><td class="c">${week}</td><td>-</td><td class="sub">Not written</td><td></td><td>-</td><td class="sub">${STATE_LABEL[state]}</td></tr>`;
      }
      const feedback =
        state === 'reviewed' || state === 'missed'
          ? esc(e!.supervisorComment?.trim() || (state === 'reviewed' ? 'Acknowledged without comment.' : '')).replace(/\n+/g, '<br>') +
            (e!.reviewerName ? `<div class="sub">- ${esc(e!.reviewerName)}</div>` : '')
          : '';
      return `<tr>
        <td class="c"><b>${week}</b></td>
        <td class="mono">${e!.submittedAt ? when(e!.submittedAt) : '-'}</td>
        <td>${state === 'missed' && !e!.workDone.trim() ? '<span class="sub">Not submitted</span>' : entryHtml(e!.workDone)}</td>
        <td>${feedback}</td>
        <td class="mono">${e!.supervisorReviewedAt ? when(e!.supervisorReviewedAt) : '-'}</td>
        <td>${STATE_LABEL[state]}${e!.correctedAt ? `<div class="sub">Corrected ${esc(dhakaDateTime(e!.correctedAt))}</div>` : ''}</td>
      </tr>`;
    })
    .join('');
  const summary = [
    `${counts.reviewed} reviewed`,
    counts.submitted ? `${counts.submitted} awaiting review` : '',
    counts.missed ? `${counts.missed} not submitted` : '',
    counts['not-started'] ? `${counts['not-started']} not written` : '',
    m.journalMark !== null ? `journal mark ${m.journalMark}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<div class="member">
      <h4><span class="mono">${esc(m.studentId)}</span> &nbsp;${esc(m.name)}${m.leader ? ' <span class="sub">(leader)</span>' : ''}<span class="sum">${esc(summary)}</span></h4>
      <table>
        <colgroup><col style="width:4%" /><col style="width:10%" /><col style="width:45%" /><col style="width:21%" /><col style="width:10%" /><col style="width:10%" /></colgroup>
        <thead><tr><th class="c">Wk</th><th>Recorded</th><th>Journal entry</th><th>Supervisor response</th><th>Responded</th><th>Status</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="sub">No weeks set for this session.</td></tr>'}</tbody>
      </table>
    </div>`;
}

export function journalReport(frame: Frame, groups: JournalReportGroup[], weekCount: number) {
  const generated = dhakaDateTime(new Date());
  const body = groups.length
    ? groups
        .map(
          (g) => `<section class="group">
      <h3>${esc(courseCode(frame.department, g.track))} · Group ${g.groupNumber}${g.projectTitle ? ` - ${esc(g.projectTitle)}` : ''}</h3>
      <p class="meta">Supervisor: ${esc(g.supervisorName || 'Not assigned')} &nbsp;|&nbsp; Members: ${g.members.length} &nbsp;|&nbsp; Weeks: ${weekCount}</p>
      ${g.members.length ? g.members.map((m) => memberBlock(m, weekCount)).join('') : '<p class="sub">No active members.</p>'}
      <div class="sign"><div>Supervisor</div><div>Capstone Coordinator</div></div>
    </section>`
        )
        .join('')
    : '<p class="empty">No groups to show.</p>';

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(frame.title)}${frame.subtitle ? ` - ${esc(frame.subtitle)}` : ''}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm 10mm 12mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8.5px Arial, sans-serif; } }
    * { box-sizing: border-box; }
    html, body { margin: 0; color: #000; font: 9.5px/1.3 Arial, Helvetica, sans-serif; }
    .head { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding-bottom: 6px; border-bottom: 1.5px solid #000; }
    .head img { height: 50px; }
    .uni { font: 700 16px/1.1 "Times New Roman", Times, serif; }
    .uni small { display: block; font: 9px/1.4 Arial, sans-serif; color: #222; }
    .doc { text-align: right; }
    .doc h1 { margin: 0; font: 700 17px/1.1 "Times New Roman", Times, serif; }
    .doc p { margin: 2px 0 0; font-size: 9px; }
    .group + .group { break-before: page; page-break-before: always; }
    h3 { margin: 10px 0 1px; font: 700 12px/1.25 Arial, sans-serif; border-bottom: 1px solid #000; padding-bottom: 2px; }
    .meta { margin: 2px 0 4px; font-size: 9px; color: #222; }
    .member { margin-top: 8px; }
    h4 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; margin: 0 0 2px; font: 700 10.5px/1.25 Arial, sans-serif; break-after: avoid; page-break-after: avoid; }
    h4 .sum { margin-left: auto; font-weight: 400; font-size: 8.5px; color: #333; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    th { font-weight: 700; text-align: left; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2px 4px; font-size: 8.5px; background: #f2f2f2; }
    td { padding: 2px 4px; vertical-align: top; overflow-wrap: anywhere; border-bottom: 0.5px solid #bbb; }
    td div + div { margin-top: 1px; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    tr.nil td { color: #555; padding-top: 1px; padding-bottom: 1px; }
    .c { text-align: center; }
    .mono { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .sub { font-size: 8px; color: #444; }
    .sign { display: flex; justify-content: space-between; margin-top: 26px; font-size: 9px; break-inside: avoid; }
    .sign div { border-top: 1px dotted #000; padding-top: 2px; min-width: 160px; text-align: center; }
    .foot { margin-top: 10px; font-size: 8px; color: #333; }
    .empty { padding: 24px; text-align: center; color: #444; }
    @media screen {
      body { background: #e6e6e6; }
      .paper { background: #fff; width: 297mm; min-height: 210mm; margin: 16px auto; padding: 10mm; box-shadow: 0 1px 4px rgba(0,0,0,.25); }
      .group + .group { margin-top: 18px; padding-top: 10px; border-top: 2px dashed #bbb; }
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
      <div class="doc"><h1>${esc(frame.title)}</h1>${frame.subtitle ? `<p>${esc(frame.subtitle)}</p>` : ''}<p>Generated: ${esc(generated)}</p></div>
    </header>
    ${body}
    <p class="foot">Times are Bangladesh time (GMT+6). Recorded: when the student last saved the entry. Responded: when the supervisor reviewed it or closed the week.</p>
  </div>
</body>
</html>`;
}
