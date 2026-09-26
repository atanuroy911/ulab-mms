import { NextRequest, NextResponse, after } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import { getCapstoneActor, canManageDepartment } from '@/lib/capstoneAuth';
import { buildProgressionPlan, moveGroups } from '@/lib/capstoneProgressionServer';
import { sendGroupJournalEmails } from '@/lib/capstoneJournalEmails';
import type { Decision } from '@/lib/capstoneProgression';

// GET  /api/capstone/sessions/[id]/progression - who would move to the next session, and why
// POST /api/capstone/sessions/[id]/progression - move them
//   { targetSessionId, groupIds: [...], decisions: { [groupId]: { [studentAccountId]: 'move'|'hold'|'withdrawn' } }, notify?: boolean }
// Coordinators / admins of the session's department only. See lib/capstoneProgressionServer.ts.

async function authorise(id: string) {
  const actor = await getCapstoneActor();
  if (!actor) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  await dbConnect();
  const session = await CapstoneSession.findById(id).select('department');
  if (!session) return { error: NextResponse.json({ error: 'Session not found' }, { status: 404 }) };
  if (!canManageDepartment(actor, session.department)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { actor };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorise(id);
    if (auth.error) return auth.error;
    const plan = await buildProgressionPlan(id);
    if (!plan) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    return NextResponse.json(plan);
  } catch (error) {
    console.error('GET progression error:', error);
    return NextResponse.json({ error: 'Failed to prepare the move' }, { status: 500 });
  }
}

const DECISIONS: Decision[] = ['move', 'hold', 'withdrawn'];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorise(id);
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const targetSessionId = typeof body?.targetSessionId === 'string' ? body.targetSessionId : '';
    const groupIds: string[] = Array.isArray(body?.groupIds) ? body.groupIds.filter((x: unknown) => typeof x === 'string') : [];
    if (!targetSessionId) return NextResponse.json({ error: 'Choose the session to move to' }, { status: 400 });
    if (groupIds.length === 0) return NextResponse.json({ error: 'Choose at least one group' }, { status: 400 });

    // Only well-formed decisions get through.
    const decisions: Record<string, Record<string, Decision>> = {};
    for (const [groupId, byStudent] of Object.entries((body?.decisions || {}) as Record<string, Record<string, unknown>>)) {
      decisions[groupId] = {};
      for (const [studentId, d] of Object.entries(byStudent || {})) {
        if (DECISIONS.includes(d as Decision)) decisions[groupId][studentId] = d as Decision;
      }
    }

    const result = await moveGroups({
      sourceSessionId: id,
      targetSessionId,
      groupIds,
      decisions,
      actorId: auth.actor!.systemAccount ? null : auth.actor!.userId,
    });
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

    if (body?.notify === true) {
      for (const m of result.moved) after(() => sendGroupJournalEmails(m.targetGroupId, 'added').catch(() => undefined));
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('POST progression error:', error);
    return NextResponse.json({ error: 'Failed to move groups' }, { status: 500 });
  }
}
