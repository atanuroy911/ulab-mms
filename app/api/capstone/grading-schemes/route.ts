import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import GradingScheme from '@/models/GradingScheme';
import { getCapstoneActor, canManageDepartment } from '@/lib/capstoneAuth';
import { defaultOutcomes } from '@/lib/capstoneOutcomes';
import { defaultCseScheme } from '@/lib/gradingEngine';

/**
 * Grading schemes are authored by coordinators/admins and define how component marks
 * combine into a final grade. Read access is broad (any signed-in staff member may inspect
 * the arithmetic they are graded under); write access is restricted to the department's
 * coordinator or an admin.
 */

// GET /api/capstone/grading-schemes?department=CSE
export async function GET(request: NextRequest) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department');
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const query: Record<string, unknown> = {};
    if (department) query.department = department.toUpperCase();
    if (!includeArchived) query.isArchived = false;

    // The graphs themselves can be large and the list view only needs metadata; the editor
    // fetches the full document by id.
    const schemes = await GradingScheme.find(query)
      .select('-nodes -edges -versions')
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json(schemes);
  } catch (error: unknown) {
    console.error('GET /api/capstone/grading-schemes error:', error);
    return NextResponse.json({ error: 'Failed to load grading schemes' }, { status: 500 });
  }
}

// POST /api/capstone/grading-schemes
export async function POST(request: NextRequest) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const department = typeof body?.department === 'string' ? body.department.trim().toUpperCase() : '';
    const track = ['A', 'B', 'C'].includes(body?.track) ? body.track : null;

    if (!name) return NextResponse.json({ error: 'A name is required' }, { status: 400 });
    if (!department) return NextResponse.json({ error: 'A department is required' }, { status: 400 });

    if (!canManageDepartment(actor, department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();

    // `startFromDefault` seeds the department's existing CSE4098 arithmetic so a coordinator
    // starts from something that already matches their spreadsheet rather than a blank canvas.
    const seed =
      body?.startFromDefault === false
        ? { nodes: [], edges: [] }
        : defaultCseScheme(track || 'A');

    const scheme = await GradingScheme.create({
      name,
      description: typeof body?.description === 'string' ? body.description.trim() : '',
      department,
      track,
      nodes: seed.nodes,
      edges: seed.edges,
      // The department's COs for the track, from the 4098A/B workbooks; editable in the editor.
      outcomes: defaultOutcomes(track || 'A'),
      versions: [],
      currentVersion: 0,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });

    return NextResponse.json(scheme, { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    if (err?.code === 11000) {
      return NextResponse.json(
        { error: 'A grading scheme with that name already exists in this department' },
        { status: 409 }
      );
    }
    console.error('POST /api/capstone/grading-schemes error:', error);
    return NextResponse.json({ error: err?.message || 'Failed to create grading scheme' }, { status: 500 });
  }
}
