import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import { getCapstoneActor, canManageGroup } from '@/lib/capstoneAuth';

// Soft-unassign, not remove: keeps any marks that evaluator already submitted attributable
// (see models/CapstoneGroup.ts) while excluding them from the evaluator set the grading
// engine averages over going forward.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; evaluatorId: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, evaluatorId } = await params;
    await dbConnect();

    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (!(await canManageGroup(actor, group))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const entry = group.evaluators.find((e) => !e.unassignedAt && String(e.evaluatorId) === evaluatorId);
    if (!entry) return NextResponse.json({ error: 'Evaluator assignment not found' }, { status: 404 });

    entry.unassignedAt = new Date();
    await group.save();

    return NextResponse.json(group);
  } catch (error) {
    console.error('DELETE /api/capstone/groups/[id]/evaluators/[evaluatorId] error:', error);
    return NextResponse.json({ error: 'Failed to remove evaluator' }, { status: 500 });
  }
}
