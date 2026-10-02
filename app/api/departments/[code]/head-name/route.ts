import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Department from '@/models/Department';
import { getCapstoneActor, canManageDepartment } from '@/lib/capstoneAuth';

// PUT { headName } - the department head's name as printed on forms (the grade change form).
// The department's coordinators and admins only. It can be changed, never cleared: a form
// with no head name is no use to anyone.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { code } = await params;
    const dept = code.toUpperCase();
    if (!canManageDepartment(actor, dept)) {
      return NextResponse.json({ error: 'Only the department’s coordinator or an admin can set the department head' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const headName = typeof body?.headName === 'string' ? body.headName.trim().replace(/\s+/g, ' ') : '';
    if (!headName) return NextResponse.json({ error: 'Enter the head’s name. It can be changed but not removed.' }, { status: 400 });
    if (headName.length > 120) return NextResponse.json({ error: 'Please keep the name under 120 characters' }, { status: 400 });
    await dbConnect();
    const updated = await Department.findOneAndUpdate({ code: dept }, { $set: { headName } }, { new: true }).select('code headName').lean();
    if (!updated) return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    console.warn(`[department] head name of ${dept} set to "${headName}" by ${actor.userId}`);
    return NextResponse.json({ code: updated.code, headName: updated.headName });
  } catch (error) {
    console.error('PUT /api/departments/[code]/head-name error:', error);
    return NextResponse.json({ error: 'Failed to save the department head' }, { status: 500 });
  }
}
