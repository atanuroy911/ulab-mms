import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneMarkSubmission from '@/models/CapstoneMarkSubmission';
import StudentAccount from '@/models/StudentAccount';
import User from '@/models/User';
import { getCapstoneActor, isAdmin, isCoordinatorFor } from '@/lib/capstoneAuth';

// GET /api/capstone/sessions/[id]/marks-export
// Returns a CSV with all submitted marks for every group in a session.
// Admin or coordinator for this department only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const session = await CapstoneSession.findById(id).populate('semesterId', 'name');
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    if (!isAdmin(actor) && !isCoordinatorFor(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const groups = await CapstoneGroup.find({ sessionId: id }).sort({ track: 1, groupNumber: 1 });
    const submissions = await CapstoneMarkSubmission.find({ sessionId: id });

    // Collect all student IDs and user IDs for lookup
    const allStudentIds = new Set<string>();
    const allUserIds = new Set<string>();

    for (const g of groups) {
      for (const m of g.members) {
        if (!m.removedAt) allStudentIds.add(String(m.studentAccountId));
      }
      if (g.supervisorId) allUserIds.add(String(g.supervisorId));
      for (const ev of g.evaluators) {
        if (!ev.unassignedAt) allUserIds.add(String(ev.evaluatorId));
      }
    }

    const [students, users] = await Promise.all([
      StudentAccount.find({ _id: { $in: [...allStudentIds] } }).select('studentId name'),
      User.find({ _id: { $in: [...allUserIds] } }).select('name email'),
    ]);

    const studentMap = new Map(students.map((s: any) => [String(s._id), s]));
    const userMap = new Map(users.map((u: any) => [String(u._id), u]));

    // Index submissions: studentAccountId -> component -> submitterId -> rawScore
    const subIndex = new Map<string, Map<string, Map<string, number>>>();
    for (const sub of submissions) {
      const sid = String(sub.studentAccountId);
      if (!subIndex.has(sid)) subIndex.set(sid, new Map());
      const bySid = subIndex.get(sid)!;
      if (!bySid.has(sub.component)) bySid.set(sub.component, new Map());
      bySid.get(sub.component)!.set(String(sub.submitterId), sub.rawScore);
    }

    const semName = typeof session.semesterId === 'object' && session.semesterId !== null
      ? (session.semesterId as any).name
      : String(session.semesterId || '');

    const COMPONENTS = ['weeklyJournal', 'peer', 'report', 'presentation'];
    const ROLES = ['supervisor', 'evaluator1', 'evaluator2'];

    const headers = [
      'Group', 'Track', 'Supervisor', 'Student ID', 'Student Name',
      ...COMPONENTS.flatMap((c) => ROLES.map((r) => `${c}_${r}`)),
    ];

    const rows: string[] = [headers.map((h) => `"${h}"`).join(',')];

    for (const group of groups) {
      const supervisorId = String(group.supervisorId);
      const supervisor = userMap.get(supervisorId);
      const supervisorName = supervisor?.name || supervisorId;
      const activeEvaluatorIds = group.evaluators.filter((e: any) => !e.unassignedAt).map((e: any) => String(e.evaluatorId));

      const activeMembers = group.members.filter((m: any) => !m.removedAt);
      for (const member of activeMembers) {
        const memberId = String(member.studentAccountId);
        const student = studentMap.get(memberId);
        const studentId = student?.studentId || memberId;
        const studentName = student?.name || '';

        const bySub = subIndex.get(memberId);
        const markCols: (number | string)[] = [];

        for (const component of COMPONENTS) {
          const byComp = bySub?.get(component);
          // Supervisor
          markCols.push(byComp?.get(supervisorId) ?? '');
          // Evaluator 1 and 2
          for (let e = 0; e < 2; e++) {
            const evId = activeEvaluatorIds[e];
            markCols.push(evId && byComp?.get(evId) !== undefined ? byComp!.get(evId)! : '');
          }
        }

        rows.push(
          [
            `"${group.projectTitle.replace(/"/g, '""')}"`,
            `"${group.track}"`,
            `"${supervisorName.replace(/"/g, '""')}"`,
            `"${studentId}"`,
            `"${studentName.replace(/"/g, '""')}"`,
            ...markCols.map((v) => `"${v}"`),
          ].join(',')
        );
      }
    }

    const csv = rows.join('\r\n');
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="capstone-marks-${session.department}-${semName}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('GET /api/capstone/sessions/[id]/marks-export error:', error);
    return NextResponse.json({ error: error.message || 'Export failed' }, { status: 500 });
  }
}
