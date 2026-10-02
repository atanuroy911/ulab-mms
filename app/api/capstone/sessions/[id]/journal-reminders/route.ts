import { NextRequest, NextResponse, after } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import User from '@/models/User';
import { getCapstoneActor, canManageDepartment } from '@/lib/capstoneAuth';
import { isRunning } from '@/lib/capstoneStatus';
import { sendGroupJournalEmails, REMINDER_COOLDOWN_MS } from '@/lib/capstoneJournalEmails';

export const runtime = 'nodejs';

/** Pause between two emails, so a session-wide batch isn't refused by the mail server (421). */
const EMAIL_GAP_MS = 1200;

// POST /api/capstone/sessions/[id]/journal-reminders  { track?: 'A' | 'B' | 'C' }
// The coordinator reminds every student of every group (or one track's) to bring their weekly
// journal up to date - the same email and portal note as a group's own reminder button, each
// with the student's submitted/total weeks. Groups reminded in the last few minutes are
// skipped. Each group is claimed first, so a double click or two coordinators at once never
// email anyone twice. Sending runs after the response: it takes a while for a whole session.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const track = typeof body?.track === 'string' && body.track ? body.track.toUpperCase() : '';
    if (track && !['A', 'B', 'C'].includes(track)) return NextResponse.json({ error: 'track must be A, B or C' }, { status: 400 });

    await dbConnect();
    const session = await CapstoneSession.findById(id).select('department status').lean();
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!canManageDepartment(actor, session.department)) {
      return NextResponse.json({ error: 'Only a coordinator can remind every group' }, { status: 403 });
    }
    if (!isRunning(session.status)) {
      return NextResponse.json({ error: 'Journal reminders can only be sent while the session is running' }, { status: 409 });
    }

    const filter: Record<string, unknown> = { sessionId: session._id };
    if (track) filter.track = track;
    const groups = await CapstoneGroup.find(filter).select('members lastJournalReminderAt').lean();
    const withStudents = groups.filter((g) => g.members.some((m) => !m.removedAt));
    if (withStudents.length === 0) return NextResponse.json({ error: 'No group has students yet' }, { status: 409 });

    // Claim each group: set its reminder time now, unless it was reminded moments ago.
    const now = new Date();
    const cutoff = new Date(now.getTime() - REMINDER_COOLDOWN_MS);
    const claimed: string[] = [];
    for (const g of withStudents) {
      const r = await CapstoneGroup.updateOne(
        { _id: g._id, $or: [{ lastJournalReminderAt: null }, { lastJournalReminderAt: { $lt: cutoff } }] },
        { $set: { lastJournalReminderAt: now } }
      );
      if (r.modifiedCount === 1) claimed.push(String(g._id));
    }
    const students = withStudents
      .filter((g) => claimed.includes(String(g._id)))
      .reduce((n, g) => n + g.members.filter((m) => !m.removedAt).length, 0);
    const skipped = withStudents.length - claimed.length;
    if (claimed.length === 0) {
      return NextResponse.json({ error: 'Every group was reminded a few minutes ago. Try again later.' }, { status: 429 });
    }

    const sender = actor.systemAccount ? null : await User.findById(actor.userId).select('name').lean<{ name?: string }>();
    const senderName = sender?.name || 'Your capstone coordinator';
    after(async () => {
      const total = { sent: 0, failed: 0, noEmail: 0 };
      for (const groupId of claimed) {
        try {
          const r = await sendGroupJournalEmails(groupId, 'reminder', { senderName, gapMs: EMAIL_GAP_MS });
          total.sent += r.sent;
          total.failed += r.failed;
          total.noEmail += r.noEmail.length;
        } catch (err) {
          console.error(`[journal-reminders] group ${groupId} failed:`, err);
        }
        await new Promise((r) => setTimeout(r, EMAIL_GAP_MS));
      }
      console.warn(`[journal-reminders] session ${id}${track ? ` track ${track}` : ''} by ${senderName}: ${total.sent} sent, ${total.failed} failed, ${total.noEmail} without email`);
    });

    return NextResponse.json({ groups: claimed.length, students, skipped, sentAt: now });
  } catch (error) {
    console.error('POST /api/capstone/sessions/[id]/journal-reminders error:', error);
    return NextResponse.json({ error: 'Failed to send reminders' }, { status: 500 });
  }
}
