import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import { resolveMembers } from '@/lib/capstoneStudentAccounts';
import { sendGroupJournalEmails } from '@/lib/capstoneJournalEmails';
import { getCapstoneActor, canManageGroup } from '@/lib/capstoneAuth';

// Add a member to an existing group. Coordinator/admin only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const studentIdText = typeof body?.studentId === 'string' ? body.studentId.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!studentIdText) {
      return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
    }

    await dbConnect();

    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (!(await canManageGroup(actor, group))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const session = await CapstoneSession.findById(group.sessionId).select('status department');
    if (session?.status === 'grading' || session?.status === 'closed') {
      return NextResponse.json({ error: 'The cohort is locked for this session status' }, { status: 409 });
    }

    const alreadyActive = group.members.some((m) => m.studentIdText === studentIdText && !m.removedAt);
    if (alreadyActive) {
      return NextResponse.json({ error: 'This student is already an active member' }, { status: 400 });
    }

    // Same resolution path as bulk group creation, so a member added one-at-a-time gets
    // their name and email recorded identically.
    const { resolved, warnings } = await resolveMembers(
      [{ studentId: studentIdText, name: name || undefined, email: email || undefined }],
      session?.department || ''
    );
    const account = resolved[0].account;

    // A student may only be an active member of ONE group per session - see the identical
    // check in app/api/capstone/sessions/[id]/groups/route.ts for why (journal entries are
    // keyed per-session, not per-group).
    const conflictingGroup = await CapstoneGroup.findOne({
      sessionId: group.sessionId,
      _id: { $ne: group._id },
      members: { $elemMatch: { studentAccountId: account._id, removedAt: null } },
    }).select('track groupNumber');
    if (conflictingGroup) {
      return NextResponse.json(
        { error: `Already an active member of Track ${conflictingGroup.track} #${conflictingGroup.groupNumber} this session` },
        { status: 409 }
      );
    }

    group.members.push({
      studentAccountId: account._id as any,
      studentIdText,
      joinedAt: new Date(),
      role: 'member',
    } as any);
    await group.save();

    // "Save & email" in the Add Members dialog: tell the student they've joined and how the
    // weekly journal works. Sent only after the save succeeded; a mail failure never undoes it.
    const emailResult =
      body?.notify === true
        ? await sendGroupJournalEmails(id, 'added', { studentAccountIds: [String(account._id)] })
        : undefined;

    const payload = {
      ...group.toObject(),
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(emailResult ? { email: emailResult } : {}),
    };
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('POST /api/capstone/groups/[id]/members error:', error);
    return NextResponse.json({ error: error.message || 'Failed to add member' }, { status: 500 });
  }
}
