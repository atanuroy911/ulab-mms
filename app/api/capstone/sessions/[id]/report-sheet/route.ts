import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import StudentAccount from '@/models/StudentAccount';
import Department from '@/models/Department';
import '@/models/Semester';
import { getCapstoneActor, isAdmin, isCoordinatorFor } from '@/lib/capstoneAuth';
import { esc, getLogoDataUri, REPORT_RUBRICS } from '@/lib/capstonePrint';

export const runtime = 'nodejs';

// GET /api/capstone/sessions/[id]/report-sheet?track=A
// Blank "Assessment Rubric for Term Final Report" for every group in one track, one group
// per sheet. The report is marked group-wise, so each sheet carries the project title and
// the whole member list rather than a single student. Replicates
// public/templates/capstone/Assessment Rubric for Report CSE4098A/B.docx.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const track = (request.nextUrl.searchParams.get('track') || '').toUpperCase() as 'A' | 'B' | 'C';
    if (!['A', 'B', 'C'].includes(track)) {
      return NextResponse.json({ error: 'track must be A, B or C' }, { status: 400 });
    }

    await dbConnect();

    const session = await CapstoneSession.findById(id).populate('semesterId', 'name');
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!isAdmin(actor) && !isCoordinatorFor(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const groups = await CapstoneGroup.find({ sessionId: id, track }).sort({ groupNumber: 1 });
    const studentIds = groups.flatMap((g) => g.members.filter((m) => !m.removedAt).map((m) => m.studentAccountId));
    const [students, department, logoDataUri] = await Promise.all([
      StudentAccount.find({ _id: { $in: studentIds } }).select('studentId name').lean(),
      Department.findOne({ code: session.department }).select('name').lean(),
      getLogoDataUri(),
    ]);
    const studentMap = new Map(students.map((s: any) => [String(s._id), s]));

    const semesterName =
      typeof session.semesterId === 'object' && session.semesterId !== null ? (session.semesterId as any).name : '';
    const courseCode = `${session.department}4098${track}`;
    const departmentName = (department as any)?.name || session.department;
    const criteria = REPORT_RUBRICS[track];
    const maxMarks = criteria.length * 3;

    const banner = `
      <div class="banner">
        <img src="${logoDataUri}" alt="ULAB" />
        <div class="dept">
          <div>Department of</div>
          <div class="name">${esc(departmentName)}</div>
          <div>University of Liberal Arts Bangladesh</div>
        </div>
      </div>`;

    const sheets = groups
      .map((group) => {
        const members = group.members
          .filter((m) => !m.removedAt)
          .map((m) => {
            const s: any = studentMap.get(String(m.studentAccountId));
            return `${esc(s?.studentId || m.studentIdText)}${s?.name ? ` — ${esc(s.name)}` : ''}`;
          });
        if (members.length === 0) return '';

        // The banner sits in <thead> so Chrome repeats it at the top of every printed page a
        // group's rubric runs onto, as the Word template's page header does.
        return `
      <table class="sheet">
        <colgroup>
          <col style="width:15%" /><col style="width:8%" /><col style="width:21.5%" /><col style="width:21.5%" /><col style="width:26%" /><col style="width:8%" />
        </colgroup>
        <thead><tr><td colspan="6" class="plain">${banner}</td></tr></thead>
        <tbody>
          <tr><td colspan="6" class="plain">
            <div class="title">${esc(courseCode)}: Assessment Rubric for Term Final Report</div>
            <div class="field"><b>Project Title:</b> ${esc(group.projectTitle)}</div>
            <div class="field"><b>Group:</b> ${group.groupNumber} &nbsp;&nbsp; <b>Members:</b> ${members.join('; ')}</div>
            <div class="field split">
              <span><b>(Evaluator/Supervisor) Name &amp; Designation:</b> <span class="blank"></span></span>
              <span><b>Semester:</b> ${esc(semesterName)}</span>
            </div>
          </td></tr>
          <tr class="head">
            <th>Criteria</th><th>No / wrong answer (0)</th><th>Poor (1)</th><th>Satisfactory (2)</th><th>Excellent (3)</th><th>Marks</th>
          </tr>
          ${criteria
            .map(
              (c) => `
          <tr class="row">
            <th class="crit">${esc(c.label)}</th>
            <td class="center">No / wrong answer</td>
            ${c.levels.map((l) => `<td>${esc(l)}</td>`).join('')}
            <td></td>
          </tr>`
            )
            .join('')}
          <tr class="row comments">
            <td colspan="5"><b>Overall Comments:</b></td>
            <td class="total"><b>Total Marks:</b><div class="of">/ ${maxMarks}</div></td>
          </tr>
          <tr><td colspan="6" class="plain">
            <div class="signature"><div class="line"></div>Evaluator’s Signature</div>
          </td></tr>
        </tbody>
      </table>`;
      })
      .filter(Boolean)
      .join('');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(courseCode)} Report Rubric - ${esc(semesterName)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 10mm 12mm 10mm; }
    html, body { margin: 0; padding: 0; color: #000; font-family: "Times New Roman", Times, serif; }
    table.sheet { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10.5px; break-before: page; page-break-before: always; }
    table.sheet:first-of-type { break-before: auto; page-break-before: auto; }
    thead { display: table-header-group; }
    td.plain { border: none; padding: 0; }
    .banner { display: flex; align-items: center; gap: 14px; margin: 0 0 8px 40px; }
    .banner img { height: 58px; width: auto; }
    .banner .dept { color: #7f7f7f; font-family: Calibri, Arial, sans-serif; font-size: 14px; line-height: 1.25; }
    .banner .dept .name { font-weight: 700; font-size: 15px; }
    .title { text-align: center; font-weight: 700; text-decoration: underline; font-size: 13px; margin: 4px 0 10px; }
    .field { font-size: 12.5px; margin: 0 0 8px; }
    .field.split { display: flex; justify-content: space-between; gap: 16px; }
    .blank { display: inline-block; min-width: 180px; border-bottom: 1px dotted #000; }
    tr.head th { border: 1px solid #000; padding: 4px; font-size: 11px; text-align: center; vertical-align: top; }
    tr.row th, tr.row td { border: 1px solid #000; padding: 3px 4px; vertical-align: top; text-align: justify; }
    tr.row { break-inside: avoid; page-break-inside: avoid; }
    th.crit { text-align: left !important; font-weight: 700; }
    td.center { text-align: center !important; }
    tr.comments td { height: 48px; }
    td.total { font-size: 10px; }
    td.total .of { margin-top: 18px; text-align: right; }
    .signature { margin-top: 48px; font-size: 11px; width: 170px; text-align: center; }
    .signature .line { border-top: 1px solid #000; margin-bottom: 2px; }
    .empty { text-align: center; padding: 40px; font-family: Arial, sans-serif; }
    @media screen {
      body { background: #e5e5e5; }
      .paper { background: #fff; width: 210mm; margin: 16px auto; padding: 10mm; box-sizing: border-box; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
      table.sheet + table.sheet { margin-top: 32px; border-top: 6px solid #e5e5e5; }
      .print-btn { position: fixed; top: 12px; right: 12px; padding: 8px 14px; font: 14px Arial, sans-serif; cursor: pointer; }
    }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  <div class="paper">
    ${sheets || `<p class="empty">Track ${esc(track)} has no groups with active members yet.</p>`}
  </div>
</body>
</html>`;

    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error) {
    console.error('report-sheet error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to build sheet' }, { status: 500 });
  }
}
