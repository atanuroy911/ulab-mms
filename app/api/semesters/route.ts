import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Semester from '@/models/Semester';
import { getCapstoneActor, isAdmin } from '@/lib/capstoneAuth';

/**
 * Semesters, for the teacher-side capstone flow.
 *
 * Distinct from /api/admin/semesters, which is gated on the admin *password token* - a
 * coordinator working in their own portal never has that token, so the capstone session
 * wizard could not create a semester through it. These handlers authorise on the actor's
 * ROLE instead, which is the same rule the rest of the capstone API uses.
 */

export async function GET() {
  try {
    // Previously unauthenticated. Semester names are not especially sensitive, but this is
    // a database listing on a public URL with no reason to be reachable while signed out.
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await dbConnect();

    const semesters = await Semester.find({ isActive: true }).sort({ createdAt: -1 });

    return NextResponse.json(semesters);
  } catch (error) {
    console.error('Error fetching semesters:', error);
    return NextResponse.json({ error: 'Failed to fetch semesters' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // A semester is institution-wide rather than department-scoped, so any coordinator may
    // create one - a coordinator opening a capstone session for a new term shouldn't need
    // to find an admin first. Plain teachers may not.
    const canCreate = isAdmin(actor) || actor.roles.includes('coordinator');
    if (!canCreate) {
      return NextResponse.json(
        { error: 'Only a coordinator or admin can create a semester' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'A semester name is required' }, { status: 400 });
    }

    await dbConnect();

    // `name` is uniquely indexed; check first so the common "it already exists" case comes
    // back as a clear message rather than a duplicate-key error.
    const existing = await Semester.findOne({ name });
    if (existing) {
      return NextResponse.json(
        { error: `A semester named "${name}" already exists` },
        { status: 409 }
      );
    }

    const semester = await Semester.create({
      name,
      description: typeof body?.description === 'string' ? body.description.trim() : '',
      // Both are optional in the schema, and the wizard's quick-create only asks for a
      // name. Left unset rather than defaulted to today - an endDate of "now" would be a
      // wrong answer presented as a real one.
      ...(body?.startDate ? { startDate: new Date(body.startDate) } : {}),
      ...(body?.endDate ? { endDate: new Date(body.endDate) } : {}),
      isActive: true,
    });

    return NextResponse.json(semester, { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    if (err?.code === 11000) {
      return NextResponse.json({ error: 'That semester already exists' }, { status: 409 });
    }
    console.error('Error creating semester:', error);
    return NextResponse.json({ error: err?.message || 'Failed to create semester' }, { status: 500 });
  }
}
