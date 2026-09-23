import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import GradingScheme from '@/models/GradingScheme';
import CapstoneSession from '@/models/CapstoneSession';
import { getCapstoneActor, canManageDepartment } from '@/lib/capstoneAuth';
import { validateScheme } from '@/lib/gradingEngine';

function isValidId(id: string) {
  return mongoose.Types.ObjectId.isValid(id);
}

// GET /api/capstone/grading-schemes/[id]
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!isValidId(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    await dbConnect();
    const scheme = await GradingScheme.findById(id).lean();
    if (!scheme) return NextResponse.json({ error: 'Grading scheme not found' }, { status: 404 });

    // Surfaced alongside the graph so the editor can warn before an edit that would
    // contradict a published version.
    const validation = validateScheme({ nodes: scheme.nodes || [], edges: scheme.edges || [] });

    return NextResponse.json({
      ...scheme,
      validation,
      canEdit: canManageDepartment(actor, scheme.department),
    });
  } catch (error: unknown) {
    console.error('GET /api/capstone/grading-schemes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to load grading scheme' }, { status: 500 });
  }
}

// PATCH /api/capstone/grading-schemes/[id]
//
// Two distinct operations share this handler:
//   - saving the working draft (nodes/edges/name/description), which is always allowed
//     even while invalid, so a coordinator can leave a half-built graph and come back;
//   - `publish: true`, which snapshots the draft into an immutable version and is refused
//     unless the graph validates. Sessions pin versions, never the draft.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!isValidId(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    await dbConnect();
    const scheme = await GradingScheme.findById(id);
    if (!scheme) return NextResponse.json({ error: 'Grading scheme not found' }, { status: 404 });

    if (!canManageDepartment(actor, scheme.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    if (typeof body?.name === 'string' && body.name.trim()) {
      scheme.name = body.name.trim();
    }
    if (typeof body?.description === 'string') {
      scheme.description = body.description.trim();
    }
    if (['A', 'B', 'C', null].includes(body?.track)) {
      scheme.track = body.track;
    }
    if (typeof body?.isArchived === 'boolean') {
      scheme.isArchived = body.isArchived;
    }

    const graphChanged = Array.isArray(body?.nodes) || Array.isArray(body?.edges);
    if (Array.isArray(body?.nodes)) scheme.nodes = body.nodes;
    if (Array.isArray(body?.edges)) scheme.edges = body.edges;

    if (body?.publish === true) {
      const issues = validateScheme({ nodes: scheme.nodes, edges: scheme.edges });
      if (issues.length > 0) {
        return NextResponse.json(
          { error: 'This scheme has problems that must be fixed before publishing', issues },
          { status: 400 }
        );
      }

      const nextVersion = scheme.currentVersion + 1;
      scheme.versions.push({
        version: nextVersion,
        // Deep-cloned on the way in so later draft edits can never mutate a published
        // snapshot through a shared subdocument reference.
        nodes: JSON.parse(JSON.stringify(scheme.nodes)),
        edges: JSON.parse(JSON.stringify(scheme.edges)),
        createdAt: new Date(),
        createdBy: actor.userId as unknown as mongoose.Types.ObjectId,
        note: typeof body?.note === 'string' ? body.note.trim() : '',
      });
      scheme.currentVersion = nextVersion;
    }

    scheme.updatedBy = actor.userId as unknown as mongoose.Types.ObjectId;
    if (graphChanged) scheme.markModified('nodes');
    await scheme.save();

    const validation = validateScheme({ nodes: scheme.nodes, edges: scheme.edges });
    return NextResponse.json({ ...scheme.toObject(), validation });
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    if (err?.code === 11000) {
      return NextResponse.json(
        { error: 'A grading scheme with that name already exists in this department' },
        { status: 409 }
      );
    }
    console.error('PATCH /api/capstone/grading-schemes/[id] error:', error);
    return NextResponse.json({ error: err?.message || 'Failed to save grading scheme' }, { status: 500 });
  }
}

// DELETE /api/capstone/grading-schemes/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!isValidId(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

    await dbConnect();
    const scheme = await GradingScheme.findById(id);
    if (!scheme) return NextResponse.json({ error: 'Grading scheme not found' }, { status: 404 });

    if (!canManageDepartment(actor, scheme.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // A scheme any session has been graded under is never destroyed - deleting it would
    // leave those grades unexplainable. Archive instead, which hides it from pickers while
    // keeping every published version readable.
    const inUse = await CapstoneSession.countDocuments({ 'tracks.gradingSchemeId': scheme._id });
    if (inUse > 0) {
      scheme.isArchived = true;
      await scheme.save();
      return NextResponse.json({
        archived: true,
        message: `This scheme is in use by ${inUse} session(s), so it was archived rather than deleted.`,
      });
    }

    await scheme.deleteOne();
    return NextResponse.json({ deleted: true });
  } catch (error: unknown) {
    console.error('DELETE /api/capstone/grading-schemes/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete grading scheme' }, { status: 500 });
  }
}
