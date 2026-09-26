import { NextRequest, NextResponse, after } from 'next/server';
import dbConnect from '@/lib/mongodb';
import GradingScheme from '@/models/GradingScheme';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession, { CapstoneSessionStatus } from '@/models/CapstoneSession';
import { getCapstoneActor, canManageDepartment, isAdmin } from '@/lib/capstoneAuth';
import { deleteSessionCascade, previewSessionCascade } from '@/lib/capstoneCascadeDelete';
import { syncJournalCompletion } from '@/lib/capstoneJournalWorkflow';

// Setting up -> Running -> Finished. Finishing publishes the results; the department's
// coordinators (and admins) can reopen a finished session. 'grading' is an older Running stage, so it can finish too.
const VALID_TRANSITIONS: Record<CapstoneSessionStatus, CapstoneSessionStatus[]> = {
  draft: ['open'],
  open: ['closed'],
  grading: ['closed', 'open'],
  closed: ['open'],
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

    // ?deletePreview=1 reports what deleting would remove, for the confirmation dialog. A GET
    // so that no retry or prefetch of the preview can ever delete anything.
    if (request.nextUrl.searchParams.get('deletePreview') === '1') {
      return NextResponse.json({ ...(await previewSessionCascade(id)), canForceDelete: isAdmin(actor) });
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

      session.status = nextStatus;
      session.statusHistory.push({
        status: nextStatus,
        at: new Date(),
        byUserId: actor.userId as any,
        ...(typeof body?.reason === 'string' && body.reason.trim() ? { reason: body.reason.trim() } : {}),
      });
      if (nextStatus === 'closed') session.closedAt = new Date();
      else if (session.closedAt) session.closedAt = null;
    }

    const weekCountChanged = session.isModified('journalWeekCount');
    await session.save();
    // More or fewer weeks changes which groups' journals are finished.
    if (weekCountChanged) {
      const groups = await CapstoneGroup.find({ sessionId: session._id }).select('_id').lean();
      await Promise.all(groups.map((g) => syncJournalCompletion(g._id, { schedule: after, session })));
    }
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

    // A closed session holds final results, so deleting it needs an explicit ?force=1 - the
    // UI only sends that after the user has seen the "results will be lost" warning.
    // Deleting a finished session (final results) is admin-only.
    const force = request.nextUrl.searchParams.get('force') === '1' && isAdmin(actor);
    const result = await deleteSessionCascade(id, { force });
    if (!result.deleted) {
      const reason = 'reason' in result ? result.reason : 'unknown';
      const message =
        reason === 'closed'
          ? isAdmin(actor)
            ? 'This session is closed and holds final results. Confirm again to delete it anyway.'
            : 'This session is closed and holds final results. Only an admin can delete it.'
          : `Cannot delete: ${reason}`;
      return NextResponse.json({ error: message, reason }, { status: 409 });
    }

    return NextResponse.json({ message: 'Session deleted', groupsDeleted: result.groupsDeleted });
  } catch (error) {
    console.error('DELETE /api/capstone/sessions/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
