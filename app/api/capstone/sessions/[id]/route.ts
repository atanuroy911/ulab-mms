import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import GradingScheme from '@/models/GradingScheme';
import CapstoneSession, { CapstoneSessionStatus } from '@/models/CapstoneSession';
import { getCapstoneActor, canManageDepartment, isAdmin } from '@/lib/capstoneAuth';
import { deleteSessionCascade } from '@/lib/capstoneCascadeDelete';

const VALID_TRANSITIONS: Record<CapstoneSessionStatus, CapstoneSessionStatus[]> = {
  draft: ['open'],
  open: ['grading'],
  grading: ['closed', 'open'],
  closed: ['grading'],
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const session = await CapstoneSession.findById(id).populate('semesterId', 'name');
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!canManageDepartment(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error('GET /api/capstone/sessions/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    await dbConnect();

    const session = await CapstoneSession.findById(id);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!canManageDepartment(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (typeof body?.title === 'string') session.title = body.title.trim();
    if (typeof body?.journalWeekCount === 'number' && body.journalWeekCount >= 1) {
      session.journalWeekCount = body.journalWeekCount;
    }

    if (Array.isArray(body?.trackOpenState)) {
      // [{ track: 'A', isOpen: false }, ...]
      for (const entry of body.trackOpenState) {
        const track = session.tracks.find((t) => t.track === entry.track);
        if (track) track.isOpen = !!entry.isOpen;
      }
    }

    // Pin a grading scheme to one or more tracks:
    //   trackSchemes: [{ track: 'A', gradingSchemeId: '...', gradingSchemeVersion: 2 }]
    //
    // A track is always pinned to a specific PUBLISHED version, never to the scheme's live
    // draft. That is what stops a coordinator's later edit from silently re-grading a cohort
    // that was already marked under the old arithmetic. Passing a null id unpins.
    if (Array.isArray(body?.trackSchemes)) {
      for (const entry of body.trackSchemes) {
        const track = session.tracks.find((t) => t.track === entry?.track);
        if (!track) {
          return NextResponse.json({ error: `Unknown track "${entry?.track}"` }, { status: 400 });
        }

        if (!entry.gradingSchemeId) {
          track.gradingSchemeId = null;
          track.gradingSchemeVersion = null;
          continue;
        }

        const scheme = await GradingScheme.findById(entry.gradingSchemeId);
        if (!scheme) {
          return NextResponse.json({ error: 'Grading scheme not found' }, { status: 404 });
        }
        // Cross-department pinning would let one department's coordinator grade another's
        // students under arithmetic they control.
        if (scheme.department !== session.department) {
          return NextResponse.json(
            { error: 'That grading scheme belongs to a different department' },
            { status: 400 }
          );
        }

        const version = Number(entry.gradingSchemeVersion ?? scheme.currentVersion);
        if (!scheme.versions.some((v) => v.version === version)) {
          return NextResponse.json(
            {
              error: `Version ${version} of "${scheme.name}" has not been published yet. Publish it before pinning it to a track.`,
            },
            { status: 400 }
          );
        }

        track.gradingSchemeId = scheme._id as typeof track.gradingSchemeId;
        track.gradingSchemeVersion = version;
      }
      session.markModified('tracks');
    }

    if (typeof body?.status === 'string') {
      const nextStatus = body.status as CapstoneSessionStatus;
      const allowed = VALID_TRANSITIONS[session.status as CapstoneSessionStatus] || [];
      if (!allowed.includes(nextStatus)) {
        return NextResponse.json(
          { error: `Cannot transition from ${session.status} to ${nextStatus}` },
          { status: 400 }
        );
      }
      // Reopening a closed session for correction is admin-only and requires a reason.
      if (session.status === 'closed' && nextStatus === 'grading') {
        if (!isAdmin(actor)) {
          return NextResponse.json({ error: 'Only an admin can reopen a closed session' }, { status: 403 });
        }
        if (!body?.reason || typeof body.reason !== 'string' || !body.reason.trim()) {
          return NextResponse.json({ error: 'A reason is required to reopen a closed session' }, { status: 400 });
        }
      }

      session.status = nextStatus;
      session.statusHistory.push({ status: nextStatus, at: new Date(), byUserId: actor.userId as any });
      if (nextStatus === 'closed') session.closedAt = new Date();
      if (nextStatus === 'grading' && session.closedAt) session.closedAt = null;
    }

    await session.save();
    return NextResponse.json(session);
  } catch (error: any) {
    console.error('PATCH /api/capstone/sessions/[id] error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update session' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    await dbConnect();

    const session = await CapstoneSession.findById(id).select('department');
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!canManageDepartment(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await deleteSessionCascade(id);
    if (!result.deleted) {
      const reason = 'reason' in result ? result.reason : 'unknown';
      return NextResponse.json({ error: `Cannot delete: ${reason}` }, { status: 409 });
    }

    return NextResponse.json({ message: 'Session deleted', groupsDeleted: result.groupsDeleted });
  } catch (error) {
    console.error('DELETE /api/capstone/sessions/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
