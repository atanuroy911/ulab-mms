import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import { getCapstoneActor, canManageGroup } from '@/lib/capstoneAuth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const evaluatorId = typeof body?.evaluatorId === 'string' ? body.evaluatorId : '';
    if (!evaluatorId) return NextResponse.json({ error: 'evaluatorId is required' }, { status: 400 });

    await dbConnect();

    const group = await CapstoneGroup.findById(id);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    if (!(await canManageGroup(actor, group))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (String(group.supervisorId) === evaluatorId) {
      return NextResponse.json(
        { error: "This group's supervisor cannot also be an evaluator (their score would count twice)" },
        { status: 400 }
      );
    }

    const alreadyActive = group.evaluators.some((e) => !e.unassignedAt && String(e.evaluatorId) === evaluatorId);
    if (alreadyActive) {
      return NextResponse.json({ error: 'This person is already an active evaluator' }, { status: 400 });
    }

    group.evaluators.push({
      evaluatorId: evaluatorId as any,
      assignedAt: new Date(),
      assignedBy: actor.userId as any,
    } as any);
    await group.save();

    return NextResponse.json(group);
  } catch (error: any) {
    console.error('POST /api/capstone/groups/[id]/evaluators error:', error);
    return NextResponse.json({ error: error.message || 'Failed to assign evaluator' }, { status: 500 });
  }
}
