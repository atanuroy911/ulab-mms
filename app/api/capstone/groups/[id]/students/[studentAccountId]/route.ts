import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import StudentAccount from '@/models/StudentAccount';
import WeeklyJournalEntry from '@/models/WeeklyJournalEntry';
import '@/models/Semester';
import { getCapstoneActor, canManageGroup, isGroupGrader, isGroupSupervisor } from '@/lib/capstoneAuth';
import { computeSessionGrades, redactMemberForGrader } from '@/lib/capstoneGrades';
import { getMarkingPlan, componentsFor } from '@/lib/capstoneMarkingPlan';
import { isPlausibleEmail } from '@/lib/mail';

type Params = { params: Promise<{ id: string; studentAccountId: string }> };

async function load(id: string, studentAccountId: string) {
  const group = await CapstoneGroup.findById(id);
  if (!group) return { error: NextResponse.json({ error: 'Group not found' }, { status: 404 }) };
  const member = group.members.find((m) => String(m.studentAccountId) === studentAccountId);
  if (!member) return { error: NextResponse.json({ error: 'Not a member of this group' }, { status: 404 }) };
  return { group, member };
}

// GET /api/capstone/groups/[id]/students/[studentAccountId]
// One student's page in a group: details, grade breakdown under the pinned scheme, every mark,
// and weekly-journal progress. Coordinators/admins see everything; the group's supervisor and
// evaluators see other graders' marks only after submitting their own (redactMemberForGrader).
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, studentAccountId } = await params;
    await dbConnect();

    const loaded = await load(id, studentAccountId);
    if ('error' in loaded) return loaded.error;
    const { group, member } = loaded;

    const canManage = await canManageGroup(actor, group);
    const grader = isGroupGrader(actor, group);
    if (!canManage && !grader) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const role: 'supervisor' | 'evaluator' = isGroupSupervisor(actor, group) ? 'supervisor' : 'evaluator';

    const session = await CapstoneSession.findById(group.sessionId).populate('semesterId', 'name');
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const [student, entries, computed] = await Promise.all([
      StudentAccount.findById(studentAccountId).select('studentId name email').lean(),
      WeeklyJournalEntry.find({ groupId: group._id, studentAccountId })
        .select('weekNumber submittedAt supervisorComment supervisorReviewedAt')
        .sort({ weekNumber: 1 })
        .lean(),
      computeSessionGrades(session, { _id: group._id }),
    ]);

    const groupGrades = computed.groups[0];
    let grade = groupGrades?.members.find((m) => m.studentAccountId === studentAccountId) || null;
    if (grade && !canManage) {
      const plan = await getMarkingPlan(group.sessionId, group.track);
      grade = redactMemberForGrader(grade, actor.userId, componentsFor(plan, role));
    }
    const trackReport = computed.tracks.find((t) => t.track === group.track) || null;

    return NextResponse.json({
      student: {
        studentAccountId,
        studentId: student?.studentId || member.studentIdText,
        name: student?.name || '',
        email: student?.email || '',
        removedAt: member.removedAt || null,
      },
      group: {
        _id: String(group._id),
        track: group.track,
        groupNumber: group.groupNumber,
        projectTitle: group.projectTitle,
      },
      session: {
        _id: String(session._id),
        department: session.department,
        status: session.status,
        semesterName:
          typeof session.semesterId === 'object' && session.semesterId !== null
            ? (session.semesterId as unknown as { name?: string }).name
            : undefined,
        journalWeekCount: session.journalWeekCount,
      },
      scheme: groupGrades ? { name: groupGrades.schemeName, version: groupGrades.schemeVersion, status: trackReport?.status } : null,
      grade,
      journal: entries.map((e) => ({
        weekNumber: e.weekNumber,
        submitted: !!e.submittedAt,
        reviewed: !!e.supervisorReviewedAt,
      })),
      viewer: { canManage, role: canManage ? 'coordinator' : role },
    });
  } catch (error) {
    console.error('GET /api/capstone/groups/[id]/students/[studentAccountId] error:', error);
    return NextResponse.json({ error: 'Failed to load student' }, { status: 500 });
  }
}

// PATCH { name?, email? } - coordinators/admins correct a student's details. The student ID is
// not editable here: it is what their Google sign-in is matched on, so changing it would detach
// their journal and marks. Remove and re-add the student instead.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, studentAccountId } = await params;
    const body = await request.json().catch(() => ({}));
    await dbConnect();

    const loaded = await load(id, studentAccountId);
    if ('error' in loaded) return loaded.error;
    if (!(await canManageGroup(actor, loaded.group))) {
      return NextResponse.json({ error: 'Only a coordinator can edit student details' }, { status: 403 });
    }

    const update: Record<string, string> = {};
    const unset: Record<string, ''> = {};
    if (typeof body?.name === 'string') {
      if (!body.name.trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      update.name = body.name.trim();
    }
    if (typeof body?.email === 'string') {
      const email = body.email.trim().toLowerCase();
      if (email && !isPlausibleEmail(email)) return NextResponse.json({ error: 'That email does not look valid' }, { status: 400 });
      // Email is unique+sparse: clear it by removing the field, never by writing null/''.
      if (email) update.email = email;
      else unset.email = '';
    }

    try {
      const student = await StudentAccount.findByIdAndUpdate(
        studentAccountId,
        { ...(Object.keys(update).length ? { $set: update } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { new: true, runValidators: true }
      )
        .select('studentId name email')
        .lean();
      return NextResponse.json({ student });
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) {
        return NextResponse.json({ error: 'Another student already uses that email' }, { status: 409 });
      }
      throw err;
    }
  } catch (error) {
    console.error('PATCH /api/capstone/groups/[id]/students/[studentAccountId] error:', error);
    return NextResponse.json({ error: 'Failed to update student' }, { status: 500 });
  }
}
