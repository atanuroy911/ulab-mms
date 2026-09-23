import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Department from '@/models/Department';
import { verifyAdminToken } from '@/lib/adminAuth';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const body = await request.json();
    const { name, shortCode, icon, headUserId, isActive } = body;

    const department = await Department.findById(id);
    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    if (name !== undefined) department.name = name.trim();
    if (shortCode !== undefined) department.shortCode = shortCode.trim();
    if (icon !== undefined) department.icon = icon;
    if (headUserId !== undefined) department.headUserId = headUserId || null;
    if (isActive !== undefined) department.isActive = !!isActive;

    await department.save();

    return NextResponse.json(department);
  } catch (error: any) {
    console.error('Error updating department:', error);
    return NextResponse.json({ error: error.message || 'Failed to update department' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const department = await Department.findById(id);
    if (!department) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    // Departments seeded from the catalogue registry represent real academic programs and
    // should be deactivated, not deleted - deleting one would orphan any User whose
    // departmentId points at it.
    department.isActive = false;
    await department.save();

    return NextResponse.json({ message: 'Department deactivated' });
  } catch (error) {
    console.error('Error deleting department:', error);
    return NextResponse.json({ error: 'Failed to deactivate department' }, { status: 500 });
  }
}
