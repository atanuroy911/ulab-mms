import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import WeeklyJournalEntry from '@/models/WeeklyJournalEntry';
import StudentAccount from '@/models/StudentAccount';
import { getCapstoneActor, isGroupGrader, canManageGroup } from '@/lib/capstoneAuth';
import { entryState } from '@/lib/capstoneJournalStatus';

// GET /api/capstone/groups/[id]/journal/export
// Returns a CSV of all journal entries for the group, grouped by member.
// Supervisor, active evaluators, and coordinators/admins can export.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const canManage = await canManageGroup(actor, group);
    if (!canManage && !isGroupGrader(actor, group)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const activeMembers = group.members.filter((m: any) => !m.removedAt);
    const studentIds = activeMembers.map((m: any) => m.studentAccountId);

    const [accounts, entries] = await Promise.all([
      StudentAccount.find({ _id: { $in: studentIds } }).select('studentId name'),
      WeeklyJournalEntry.find({ sessionId: group.sessionId, studentAccountId: { $in: studentIds } }).sort({ studentAccountId: 1, weekNumber: 1 }),
    ]);

    const accountMap = new Map(accounts.map((a: any) => [String(a._id), a]));

    // Build CSV
    const rows: string[] = [
      // header
      ['Student ID', 'Student Name', 'Week', 'Status', 'Work Done', 'Submitted At', 'Supervisor Comment', 'Reviewed At']
        .map((h) => `"${h}"`)
        .join(','),
    ];

    for (const member of activeMembers) {
      const sid = String(member.studentAccountId);
      const acc = accountMap.get(sid);
      const studentId = acc?.studentId || sid;
      const studentName = acc?.name || '';

      const memberEntries = entries.filter((e: any) => String(e.studentAccountId) === sid);
      if (memberEntries.length === 0) {
        rows.push(`"${studentId}","${studentName}","","","","","",""`);
      } else {
        for (const entry of memberEntries) {
          rows.push(
            [
              studentId,
              studentName,
              entry.weekNumber,
              { reviewed: 'Reviewed', missed: 'Not submitted', submitted: 'Awaiting review', 'not-started': '' }[entryState(entry)],
              (entry.workDone || '').replace(/"/g, '""'),
              entry.submittedAt ? new Date(entry.submittedAt).toISOString() : '',
              (entry.supervisorComment || '').replace(/"/g, '""'),
              entry.supervisorReviewedAt ? new Date(entry.supervisorReviewedAt).toISOString() : '',
            ]
              .map((v) => `"${v}"`)
              .join(',')
          );
        }
      }
    }

    const csv = rows.join('\r\n');
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="journal-${id}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('GET /api/capstone/groups/[id]/journal/export error:', error);
    return NextResponse.json({ error: error.message || 'Export failed' }, { status: 500 });
  }
}
