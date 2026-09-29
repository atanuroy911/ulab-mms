import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneMarkSubmission from '@/models/CapstoneMarkSubmission';
import { getCapstoneActor, canManageGroup } from '@/lib/capstoneAuth';
import { assignableUserError } from '@/lib/webAdminAccount';
import { linkPlaceholder, removePlaceholder } from '@/lib/capstonePlaceholders';

// Evaluators known only by name (initials from an imported workbook). Their imported marks
// count as the group's panel until a coordinator either links the name to a real person -
// the marks become that person's and they join the group as an evaluator - or removes it,
// after which the marks are kept but no longer count.
//
// A name is one id across the whole session (every group "MGK" evaluated shares it), so
// linking can be done once for all of those groups.

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  const actor = await getCapstoneActor();
  if (!actor) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  await dbConnect();
  if (!mongoose.Types.ObjectId.isValid(id)) return { error: NextResponse.json({ error: 'Group not found' }, { status: 404 }) };
  const group = await CapstoneGroup.findById(id);
  if (!group) return { error: NextResponse.json({ error: 'Group not found' }, { status: 404 }) };
  if (!(await canManageGroup(actor, group))) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { actor, group };
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { group, error } = await load(id);
    if (error) return error;

    const active = (group.placeholderEvaluators || []).filter((p) => !p.removedAt);
    const ids = active.map((p) => p.id);
    const [marks, groups] = await Promise.all([
      CapstoneMarkSubmission.aggregate([{ $match: { groupId: group._id, submitterId: { $in: ids } } }, { $group: { _id: '$submitterId', n: { $sum: 1 } } }]),
      CapstoneGroup.find({ sessionId: group.sessionId, 'placeholderEvaluators.id': { $in: ids } })
        .select('placeholderEvaluators')
        .lean(),
    ]);
    const marksOf = new Map(marks.map((m) => [String(m._id), m.n as number]));
    return NextResponse.json({
      supervisorLabel: group.supervisorId ? null : group.supervisorLabel ?? null,
      placeholders: active.map((p) => ({
        id: String(p.id),
        label: p.label,
        marks: marksOf.get(String(p.id)) || 0,
        // Groups in this session where the same name is still unlinked (this one included).
        groupsInSession: groups.filter((g) => (g.placeholderEvaluators || []).some((x) => String(x.id) === String(p.id) && !x.removedAt)).length,
      })),
    });
  } catch (err) {
    console.error('GET /api/capstone/groups/[id]/placeholders error:', err);
    return NextResponse.json({ error: 'Failed to load name-only evaluators' }, { status: 500 });
  }
}

/** Body: { placeholderId, action: 'link', userId, everywhere? } or { placeholderId, action: 'remove' }. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { actor, group, error } = await load(id);
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const placeholderId = typeof body?.placeholderId === 'string' ? body.placeholderId : '';
    const own = (group.placeholderEvaluators || []).find((p) => String(p.id) === placeholderId && !p.removedAt);
    if (!own) return NextResponse.json({ error: 'That name-only evaluator is not on this group' }, { status: 404 });

    if (body?.action === 'remove') {
      await removePlaceholder(group, placeholderId);
      return NextResponse.json({ removed: own.label });
    }

    if (body?.action !== 'link') return NextResponse.json({ error: "action must be 'link' or 'remove'" }, { status: 400 });
    const userId = typeof body?.userId === 'string' ? body.userId : '';
    const userError = await assignableUserError(userId);
    if (userError) return NextResponse.json({ error: userError }, { status: 400 });

    const { linked, skipped } = await linkPlaceholder(group, placeholderId, userId, actor!.userId, !!body?.everywhere);
    return NextResponse.json({ label: own.label, linked, skipped });
  } catch (err) {
    console.error('POST /api/capstone/groups/[id]/placeholders error:', err);
    return NextResponse.json({ error: 'Failed to update the name-only evaluator' }, { status: 500 });
  }
}
