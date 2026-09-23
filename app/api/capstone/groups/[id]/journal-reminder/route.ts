import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import User from '@/models/User';
import { getCapstoneActor, canManageGroup, isGroupSupervisor } from '@/lib/capstoneAuth';
import { sendGroupJournalEmails, REMINDER_COOLDOWN_MS } from '@/lib/capstoneJournalEmails';

export const runtime = 'nodejs';

// POST /api/capstone/groups/[id]/journal-reminder
// Body (optional): { studentAccountIds?: string[] } - defaults to every active member.
// Emails each student a reminder to keep their weekly journal up to date, with their own
// submitted/total weeks. Allowed for the group's supervisor and for coordinators/admins.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const studentAccountIds: string[] | undefined = Array.isArray(body?.studentAccountIds)
      ? body.studentAccountIds.map(String)
      : undefined;

    await dbConnect();
    const group = await CapstoneGroup.findById(id).select('supervisorId sessionId lastJournalReminderAt members');
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (!isGroupSupervisor(actor, group) && !(await canManageGroup(actor, group))) {
      return NextResponse.json({ error: 'Only the supervisor or a coordinator can send reminders' }, { status: 403 });
    }

    // Guards against a double-click or two people pressing it at once, not against a
    // deliberate follow-up later in the day.
    const last = group.lastJournalReminderAt ? new Date(group.lastJournalReminderAt).getTime() : 0;
    if (Date.now() - last < REMINDER_COOLDOWN_MS) {
      const minutes = Math.ceil((REMINDER_COOLDOWN_MS - (Date.now() - last)) / 60000);
      return NextResponse.json(
        { error: `A reminder was just sent to this group. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` },
        { status: 429 }
      );
    }

    const sender = actor.systemAccount
      ? null
      : await User.findById(actor.userId).select('name').lean<{ name?: string }>();
    const result = await sendGroupJournalEmails(id, 'reminder', {
      studentAccountIds,
      senderName: sender?.name,
    });

    return NextResponse.json({ ...result, lastJournalReminderAt: result.sent > 0 ? new Date() : group.lastJournalReminderAt });
  } catch (error) {
    console.error('POST /api/capstone/groups/[id]/journal-reminder error:', error);
    return NextResponse.json({ error: 'Failed to send reminders' }, { status: 500 });
  }
}
