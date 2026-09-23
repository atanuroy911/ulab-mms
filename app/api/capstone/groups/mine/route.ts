import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import { getCapstoneActor } from '@/lib/capstoneAuth';

// Groups the signed-in teacher supervises or actively evaluates, across all sessions.
export async function GET(request: NextRequest) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await dbConnect();

    const groups = await CapstoneGroup.find({
      $or: [
        { supervisorId: actor.userId },
        { evaluators: { $elemMatch: { evaluatorId: actor.userId, unassignedAt: null } } },
      ],
    })
      .populate('sessionId', 'department status semesterId')
      .populate('members.studentAccountId', 'studentId name email')
      .sort({ createdAt: -1 });

    return NextResponse.json(groups);
  } catch (error) {
    console.error('GET /api/capstone/groups/mine error:', error);
    return NextResponse.json({ error: 'Failed to fetch your groups' }, { status: 500 });
  }
}
