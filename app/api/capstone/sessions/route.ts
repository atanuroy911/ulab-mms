import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import Semester from '@/models/Semester';
import { getCapstoneActor, isAdmin, canManageDepartment } from '@/lib/capstoneAuth';
import mongoose from 'mongoose';

// GET: sessions the actor can manage (admin sees all; coordinator sees their department(s)).
// ?mine=true also includes sessions where the actor is supervisor/evaluator of any group.
export async function GET(request: NextRequest) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const mine = searchParams.get('mine') === 'true';

    await dbConnect();

    let sessionIds: Set<string> | null = null;

    // mine=true: union of (coordinator dept sessions) + (sessions where user is grader on any group)
    if (mine && !isAdmin(actor)) {
      sessionIds = new Set<string>();

      // Sessions from coordinator departments
      if (actor.coordinatorDepartments.length > 0) {
        const deptSessions = await CapstoneSession.find({
          department: { $in: actor.coordinatorDepartments },
        }).select('_id');
        deptSessions.forEach((s) => sessionIds!.add(String(s._id)));
      }

      // Sessions from groups where this user is supervisor or active evaluator
      if (!actor.systemAccount) {
        const uid = new mongoose.Types.ObjectId(actor.userId);
        const graderGroups = await CapstoneGroup.find({
          $or: [
            { supervisorId: uid },
            { evaluators: { $elemMatch: { evaluatorId: uid, unassignedAt: null } } },
          ],
        }).select('sessionId');
        graderGroups.forEach((g) => sessionIds!.add(String(g.sessionId)));
      }
    }

    let query: Record<string, unknown> = {};
    if (!isAdmin(actor)) {
      if (sessionIds !== null) {
        if (sessionIds.size === 0) return NextResponse.json([]);
        query._id = { $in: [...sessionIds].map((id) => new mongoose.Types.ObjectId(id)) };
      } else {
        if (actor.coordinatorDepartments.length === 0) return NextResponse.json([]);
        query.department = { $in: actor.coordinatorDepartments };
      }
    }

    const sessions = await CapstoneSession.find(query)
      .populate('semesterId', 'name')
      .sort({ createdAt: -1 });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error('GET /api/capstone/sessions error:', error);
    return NextResponse.json({ error: 'Failed to fetch capstone sessions' }, { status: 500 });
  }
}

// POST: open a new capstone session for a semester+department. Tracks default to A/B/C.
export async function POST(request: NextRequest) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const semesterId = typeof body?.semesterId === 'string' ? body.semesterId : '';
    const department = typeof body?.department === 'string' ? body.department.trim().toUpperCase() : '';
    const tracks: string[] = Array.isArray(body?.tracks) && body.tracks.length > 0 ? body.tracks : ['A', 'B', 'C'];
    const journalWeekCount = Number(body?.journalWeekCount) || 12;
    const title = typeof body?.title === 'string' ? body.title.trim() : '';

    if (!semesterId || !department) {
      return NextResponse.json({ error: 'semesterId and department are required' }, { status: 400 });
    }

    if (!canManageDepartment(actor, department)) {
      return NextResponse.json({ error: 'You do not have coordinator/admin authority over this department' }, { status: 403 });
    }

    await dbConnect();

    const semester = await Semester.findById(semesterId);
    if (!semester) {
      return NextResponse.json({ error: 'Semester not found' }, { status: 404 });
    }

    const existing = await CapstoneSession.findOne({ semesterId, department });
    if (existing) {
      return NextResponse.json({ error: 'A capstone session already exists for this semester and department' }, { status: 409 });
    }

    const session = await CapstoneSession.create({
      semesterId,
      department,
      title,
      journalWeekCount,
      tracks: tracks.map((track) => ({ track, isOpen: true })),
      status: 'draft',
      statusHistory: [{ status: 'draft', at: new Date(), byUserId: actor.userId }],
      // The Web Admin system account is not a coordinator anyone can reach.
      coordinatorIds: actor.systemAccount ? [] : [actor.userId],
      createdBy: actor.userId,
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/capstone/sessions error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create capstone session' }, { status: 500 });
  }
}
