import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import WeeklyJournalEntry from '@/models/WeeklyJournalEntry';
import { getCapstoneActor, canManageGroup, isGroupGrader, isGroupSupervisor } from '@/lib/capstoneAuth';

// GET: every journal entry for every active member of this group (supervisor's weekly
// review screen). Coordinator/admin can also read for oversight.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const group = await CapstoneGroup.findById(id).populate('members.studentAccountId', 'studentId name');
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    if (!isGroupGrader(actor, group) && !(await canManageGroup(actor, group))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const entries = await WeeklyJournalEntry.find({ groupId: id }).sort({ studentAccountId: 1, weekNumber: 1 });

    return NextResponse.json({ group, entries });
  } catch (error) {
    console.error('GET /api/capstone/groups/[id]/journal error:', error);
    return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 });
  }
}

// PATCH: supervisor comments on one entry. Body: { entryId, comment }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const entryId = typeof body?.entryId === 'string' ? body.entryId : '';
    const comment = typeof body?.comment === 'string' ? body.comment : '';

    if (!entryId) return NextResponse.json({ error: 'entryId is required' }, { status: 400 });

    await dbConnect();

    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    // Only the group's supervisor comments on the journal - not evaluators, matching the
    // spreadsheet/docx flow where the supervisor is who the student meets weekly.
    if (!isGroupSupervisor(actor, group) && !(await canManageGroup(actor, group))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const entry = await WeeklyJournalEntry.findOne({ _id: entryId, groupId: id });
    if (!entry) return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });

    entry.supervisorComment = comment;
    entry.supervisorReviewedAt = new Date();
    entry.supervisorId = actor.userId as any;
    await entry.save();

    return NextResponse.json(entry);
  } catch (error: any) {
    console.error('PATCH /api/capstone/groups/[id]/journal error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save comment' }, { status: 500 });
  }
}
