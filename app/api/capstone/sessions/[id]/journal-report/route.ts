import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneMarkSubmission from '@/models/CapstoneMarkSubmission';
import WeeklyJournalEntry from '@/models/WeeklyJournalEntry';
import StudentAccount from '@/models/StudentAccount';
import Semester from '@/models/Semester';
import User from '@/models/User';
import { getCapstoneActor, canManageDepartment } from '@/lib/capstoneAuth';
import { courseCode } from '@/lib/capstoneTranscript';
import { frameFor } from '@/lib/capstoneTranscriptData';
import { journalReport, type JournalReportGroup } from '@/lib/capstoneJournalReport';

export const runtime = 'nodejs';

// GET /api/capstone/sessions/[id]/journal-report[?track=A][&groupId=...][&mine=1]
// The weekly journals as one printable PDF: a block per group, a table per student.
// Coordinators/admins: any group of the session. A supervisor: only the groups they
// supervise (mine=1 is implied for them).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    await dbConnect();
    const session = await CapstoneSession.findById(id).select('department semesterId journalWeekCount').lean();
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const sp = request.nextUrl.searchParams;
    const track = (sp.get('track') || '').toUpperCase();
    const groupId = sp.get('groupId') || '';
    if (track && !['A', 'B', 'C'].includes(track)) return NextResponse.json({ error: 'track must be A, B or C' }, { status: 400 });
    if (groupId && !mongoose.Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const manager = canManageDepartment(actor, session.department);
    const mine = !manager || sp.get('mine') === '1';
    if (mine && actor.systemAccount) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const filter: Record<string, unknown> = { sessionId: session._id };
    if (track) filter.track = track;
    if (groupId) filter._id = groupId;
    if (mine) filter.supervisorId = actor.userId;
    const groups = await CapstoneGroup.find(filter).sort({ track: 1, groupNumber: 1 }).lean();
    if (!manager && groups.length === 0) {
      return NextResponse.json({ error: groupId ? 'Only the group’s supervisor or a coordinator can export its journal' : 'You supervise no groups in this session' }, { status: 403 });
    }

    const active = groups.map((g) => ({ ...g, members: g.members.filter((m) => !m.removedAt) }));
    const studentIds = active.flatMap((g) => g.members.map((m) => m.studentAccountId));
    const [students, entries, marks, semester] = await Promise.all([
      StudentAccount.find({ _id: { $in: studentIds } }).select('studentId name').lean(),
      // By session, not group: a student who moved groups keeps their earlier weeks.
      WeeklyJournalEntry.find({ sessionId: session._id, studentAccountId: { $in: studentIds } })
        .select('studentAccountId weekNumber workDone submittedAt supervisorComment supervisorReviewedAt supervisorId correctedAt')
        .sort({ weekNumber: 1 })
        .lean(),
      CapstoneMarkSubmission.find({ groupId: { $in: active.map((g) => g._id) }, component: 'weeklyJournal', submitterRole: 'supervisor', status: 'submitted' })
        .select('studentAccountId rawScore')
        .lean(),
      Semester.findById(session.semesterId).select('name').lean<{ name?: string }>(),
    ]);
    const userIds = [...new Set([...active.map((g) => String(g.supervisorId || '')), ...entries.map((e) => String(e.supervisorId || ''))].filter(Boolean))];
    const users = await User.find({ _id: { $in: userIds } }).select('name').lean();
    const userName = new Map(users.map((u) => [String(u._id), u.name as string]));
    const studentById = new Map(students.map((s) => [String(s._id), s]));
    const markOf = new Map(marks.map((m) => [String(m.studentAccountId), m.rawScore as number]));
    const entriesOf = new Map<string, typeof entries>();
    for (const e of entries) {
      const k = String(e.studentAccountId);
      entriesOf.set(k, [...(entriesOf.get(k) || []), e]);
    }

    const reportGroups: JournalReportGroup[] = active.map((g) => ({
      track: g.track,
      groupNumber: g.groupNumber,
      projectTitle: g.projectTitle || '',
      supervisorName: g.supervisorId ? userName.get(String(g.supervisorId)) || null : g.supervisorLabel || null,
      members: g.members.map((m) => {
        const sid = String(m.studentAccountId);
        const acc = studentById.get(sid);
        return {
          studentId: acc?.studentId || m.studentIdText,
          name: (acc?.name || '').replace(/\s*\(\d{6,}\)\s*$/, ''),
          leader: m.role === 'leader',
          journalMark: markOf.has(sid) ? markOf.get(sid)! : null,
          entries: (entriesOf.get(sid) || []).map((e) => ({
            weekNumber: e.weekNumber,
            workDone: e.workDone || '',
            submittedAt: e.submittedAt,
            supervisorComment: e.supervisorComment,
            supervisorReviewedAt: e.supervisorReviewedAt,
            reviewerName: e.supervisorId ? userName.get(String(e.supervisorId)) || null : null,
            correctedAt: e.correctedAt,
          })),
        };
      }),
    }));

    const what =
      groupId && groups[0]
        ? `${courseCode(session.department, groups[0].track)} Group ${groups[0].groupNumber}`
        : `${track ? courseCode(session.department, track) : 'All tracks'}${mine ? ` · groups supervised by ${userName.get(actor.userId) || 'me'}` : ''}`;
    const frame = await frameFor(session.department, 'Weekly Journal Record', `${semester?.name || ''} · ${what}`);
    const html = journalReport(frame, reportGroups, session.journalWeekCount || 0);
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/capstone/sessions/[id]/journal-report error:', error);
    return NextResponse.json({ error: 'Failed to build the journal report' }, { status: 500 });
  }
}
