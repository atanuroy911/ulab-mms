import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import StudentAccount from '@/models/StudentAccount';
import Department from '@/models/Department';
import User from '@/models/User';
import '@/models/Semester';
import { getCapstoneActor, isAdmin, isCoordinatorFor } from '@/lib/capstoneAuth';
import { esc, getLogoDataUri } from '@/lib/capstonePrint';

export const runtime = 'nodejs';

// GET /api/capstone/sessions/[id]/presentation-sheet?track=A
// Blank "Assessment Rubrics for Term Final Presentation" sheet for one track, pre-filled with
// every group's students and supervisor, for evaluators to score by hand during the
// presentations. Same approach as the attendance/CO-PO exports: styled HTML the browser
// prints to PDF, no server-side PDF dependency. Layout replicates
// public/templates/capstone/Capstone 4098A Presentation Marking Summer 2026.pdf.

const CRITERIA = [
  'Presentation Skills (Eye contact, Language, Visual aid)',
  'Organization of the Presentation Material [CO5: A1]',
  'Contents',
  'Question Answer',
  'Time management',
];

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const track = (request.nextUrl.searchParams.get('track') || '').toUpperCase();
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
    const supervisorIds = groups.map((g) => g.supervisorId);
    const [students, supervisors, department, logoDataUri] = await Promise.all([
      StudentAccount.find({ _id: { $in: studentIds } }).select('studentId name').lean(),
      User.find({ _id: { $in: supervisorIds } }).select('name').lean(),
      Department.findOne({ code: session.department }).select('name').lean(),
      getLogoDataUri(),
    ]);
    const studentMap = new Map(students.map((s: any) => [String(s._id), s]));
    const supervisorMap = new Map(supervisors.map((u: any) => [String(u._id), u.name as string]));

    const semesterName =
      typeof session.semesterId === 'object' && session.semesterId !== null ? (session.semesterId as any).name : '';
    const courseCode = `${session.department}4098${track}`;
    const departmentName = (department as any)?.name || session.department;

    const groupBodies = groups
      .map((group) => {
        const members = group.members
          .filter((m) => !m.removedAt)
          .map((m) => {
            const s: any = studentMap.get(String(m.studentAccountId));
            return { studentId: s?.studentId || m.studentIdText, name: s?.name || '' };
          });
        if (members.length === 0) return '';
        const supervisor = supervisorMap.get(String(group.supervisorId)) || '';
        const rows = members
          .map(
            (m, i) => `
            <tr>
              ${i === 0 ? `<td class="sl" rowspan="${members.length}">${group.groupNumber}</td>` : ''}
              <td class="sid student">${esc(m.studentId)}</td>
              <td class="sname student">${esc(m.name)}</td>
              ${i === 0 ? `<td class="sup" rowspan="${members.length}">${esc(supervisor)}</td>` : ''}
              ${CRITERIA.map(() => '<td class="score"></td>').join('')}
              <td class="score"></td>
            </tr>`
          )
          .join('');
        // Each group is its own tbody so the browser keeps a group's rows on one page, and
        // the blank separator row mirrors the gap between groups on the paper template.
        return `<tbody class="group">${rows}<tr class="gap"><td colspan="${CRITERIA.length + 5}"></td></tr></tbody>`;
      })
      .join('');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(courseCode)} Presentation Marking - ${esc(semesterName)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 10mm 18mm 10mm;
      @bottom-left { content: "- - - - - - - - - - -\\A Signature & Date"; white-space: pre; font: 10px Arial, sans-serif; }
      @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 13px "Times New Roman", serif; }
    }
    html, body { margin: 0; padding: 0; color: #000; font-family: "Times New Roman", Times, serif; }
    .banner { display: flex; align-items: center; gap: 12px; }
    .banner img { height: 62px; width: auto; }
    .banner .dept { color: #1f5aa6; font-family: Arial, Helvetica, sans-serif; font-size: 24px; font-weight: 600; line-height: 1.1; }
    .titles { text-align: center; font-size: 14px; margin-top: 18px; }
    .titles p { margin: 0 0 12px; }
    .titles .semester { margin-left: 30px; }
    .evaluator { font-size: 14px; margin: 4px 0 10px 18px; }
    .evaluator span { display: inline-block; min-width: 360px; border-bottom: 1px dotted #000; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
    th, td { border: 1px solid #000; padding: 2px 4px; vertical-align: top; }
    th { text-align: left; font-weight: 700; }
    thead { display: table-header-group; }
    .legend th { text-align: center; }
    tbody.group { break-inside: avoid; page-break-inside: avoid; }
    td.sl { text-align: center; font-size: 14px; }
    td.sup { text-align: center; font-size: 12px; }
    td.student { background: #ead1dc; font-family: Calibri, Arial, sans-serif; font-size: 11px; height: 26px; }
    td.sid { text-align: center; }
    tr.gap td { height: 12px; padding: 0; }
    .empty { text-align: center; padding: 40px; font-family: Arial, sans-serif; }
    @media screen {
      body { background: #e5e5e5; }
      .paper { background: #fff; width: 210mm; margin: 16px auto; padding: 12mm 10mm; box-shadow: 0 1px 4px rgba(0,0,0,.2); box-sizing: border-box; }
      .print-btn { position: fixed; top: 12px; right: 12px; padding: 8px 14px; font: 14px Arial, sans-serif; cursor: pointer; }
    }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  <div class="paper">
    <div class="banner">
      <img src="${logoDataUri}" alt="ULAB" />
      <div class="dept">Department of ${esc(departmentName)}</div>
    </div>
    <div class="titles">
      <p>School of Science and Engineering</p>
      <p>${esc(courseCode)}: Assessment Rubrics for Term Final Presentation <span class="semester">Semester: ${esc(semesterName)}</span></p>
    </div>
    <div class="evaluator">Evaluator Name &amp; Designation: <span>&nbsp;</span></div>
    ${
      groupBodies
        ? `<table>
      <colgroup>
        <col style="width:6%" /><col style="width:10%" /><col style="width:13%" /><col style="width:10%" />
        <col style="width:7.5%" /><col style="width:10%" /><col style="width:8%" /><col style="width:8.5%" /><col style="width:7.5%" /><col style="width:11%" />
      </colgroup>
      <thead>
        <tr>
          <th>SL</th><th>Student Id</th><th>Student Name</th><th>Supervisor Name</th>
          ${CRITERIA.map((c) => `<th>${esc(c)}</th>`).join('')}
          <th>Total Marks</th>
        </tr>
        <tr class="legend">
          <th></th><th></th><th></th><th></th>
          <th colspan="${CRITERIA.length + 1}">No or Wrong Answer (0), Poor (3), Satisfactory (6), Excellent (9)</th>
        </tr>
      </thead>
      ${groupBodies}
    </table>`
        : `<p class="empty">Track ${esc(track)} has no groups with active members yet.</p>`
    }
  </div>
</body>
</html>`;

    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error) {
    console.error('presentation-sheet error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to build sheet' }, { status: 500 });
  }
}
