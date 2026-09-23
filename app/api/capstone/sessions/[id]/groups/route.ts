import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import { parseMemberInputs, resolveMembers } from '@/lib/capstoneStudentAccounts';
import { getCapstoneActor, canManageDepartment } from '@/lib/capstoneAuth';
import { assignableUserError } from '@/lib/webAdminAccount';
import { sendGroupJournalEmails } from '@/lib/capstoneJournalEmails';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const session = await CapstoneSession.findById(id).select('department');
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!canManageDepartment(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const groups = await CapstoneGroup.find({ sessionId: id })
      .populate('supervisorId', 'name email invitePending')
      .populate('evaluators.evaluatorId', 'name email')
      .populate('members.studentAccountId', 'studentId name email')
      .sort({ track: 1, groupNumber: 1 });

    return NextResponse.json(groups);
  } catch (error) {
    console.error('GET /api/capstone/sessions/[id]/groups error:', error);
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 });
  }
}

// Body: { track, projectTitle, supervisorId, members: [{ studentId, name?, email? }] }
//
// `members` is the preferred shape - supplying name and email up front means no URMS lookup
// is needed at all. The older { memberStudentIds, memberNames } form is still accepted (see
// parseMemberInputs). Members are looked up/created against StudentAccount; a placeholder
// record is fine, since the account becomes "live" the first time that student signs in.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const track = typeof body?.track === 'string' ? body.track : '';
    const projectTitle = typeof body?.projectTitle === 'string' ? body.projectTitle.trim() : '';
    const supervisorId = typeof body?.supervisorId === 'string' ? body.supervisorId : '';
    const memberInputs = parseMemberInputs(body);

    if (!track || !['A', 'B', 'C'].includes(track)) {
      return NextResponse.json({ error: 'A valid track (A/B/C) is required' }, { status: 400 });
    }
    if (!projectTitle) {
      return NextResponse.json({ error: 'Project title is required' }, { status: 400 });
    }
    if (!supervisorId) {
      return NextResponse.json({ error: 'A supervisor is required' }, { status: 400 });
    }
    if (memberInputs.length === 0) {
      return NextResponse.json({ error: 'At least one member is required' }, { status: 400 });
    }

    await dbConnect();

    const session = await CapstoneSession.findById(id);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!canManageDepartment(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (session.status === 'closed') {
      return NextResponse.json({ error: 'This session is closed' }, { status: 409 });
    }

    const supervisorError = await assignableUserError(supervisorId);
    if (supervisorError) return NextResponse.json({ error: supervisorError }, { status: 400 });

    const { resolved, warnings } = await resolveMembers(memberInputs, session.department);
    const memberDocs = resolved.map(({ account, studentIdText }) => ({
      studentAccountId: account._id,
      studentIdText,
      joinedAt: new Date(),
      role: 'member' as const,
    }));

    // A student may only be an active member of ONE group per session - otherwise their
    // per-session-unique WeeklyJournalEntry (keyed sessionId+studentAccountId+weekNumber)
    // gets silently reparented between groups the moment they submit for either one.
    const accountIds = memberDocs.map((m) => m.studentAccountId);
    const conflictingGroup = await CapstoneGroup.findOne({
      sessionId: id,
      members: { $elemMatch: { studentAccountId: { $in: accountIds }, removedAt: null } },
    }).select('members track groupNumber');
    if (conflictingGroup) {
      const conflictingIds = new Set(
        conflictingGroup.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId))
      );
      const conflictingText = memberDocs
        .filter((m) => conflictingIds.has(String(m.studentAccountId)))
        .map((m) => m.studentIdText)
        .join(', ');
      return NextResponse.json(
        { error: `Already an active member of another group this session: ${conflictingText} (Track ${conflictingGroup.track} #${conflictingGroup.groupNumber})` },
        { status: 409 }
      );
    }

    // groupNumber is a read-max-then-insert counter, so two coordinators creating a group in
    // the same track at the same instant can race for the same number - retry a few times on
    // the unique-index collision rather than surfacing a raw Mongo error.
    let group;
    for (let attempt = 0; attempt < 5; attempt++) {
      const lastGroup = await CapstoneGroup.findOne({ sessionId: id, track }).sort({ groupNumber: -1 }).select('groupNumber');
      const groupNumber = (lastGroup?.groupNumber || 0) + 1;
      try {
        group = await CapstoneGroup.create({
          sessionId: id,
          track,
          groupNumber,
          projectTitle,
          members: memberDocs,
          supervisorId,
          evaluators: [],
          createdBy: actor.userId,
        });
        break;
      } catch (err: any) {
        if (err?.code === 11000 && attempt < 4) continue;
        throw err;
      }
    }

    // "Save & email" in the New Group dialog: welcome every member and explain the weekly
    // journal. Sent only after the group exists; a mail failure never undoes the create.
    const email = body?.notifyStudents === true
      ? await sendGroupJournalEmails(String(group!._id), 'added')
      : undefined;

    // Warnings travel with the created group rather than failing the request - a duplicate
    // email on one member shouldn't undo the other four.
    return NextResponse.json(
      { ...group!.toObject(), ...(warnings.length > 0 ? { warnings } : {}), ...(email ? { email } : {}) },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/capstone/sessions/[id]/groups error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create group' }, { status: 500 });
  }
}
