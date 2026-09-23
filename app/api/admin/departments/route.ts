import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Department from '@/models/Department';
import User from '@/models/User';
import { verifyAdminToken } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();
    // Departments are seeded once via the migration runner (lib/migrations/), not on every
    // GET - see lib/departmentSeed.ts.

    const departments = await Department.find().sort({ name: 1 }).lean();
    const headIds = departments.map((d) => d.headUserId).filter(Boolean);
    const heads = headIds.length
      ? await User.find({ _id: { $in: headIds } }).select('name email').lean()
      : [];
    const headById = new Map(heads.map((h) => [String(h._id), h]));

    return NextResponse.json(
      departments.map((d) => ({
        _id: String(d._id),
        code: d.code,
        name: d.name,
        shortCode: d.shortCode,
        icon: d.icon,
        isActive: d.isActive,
        headUserId: d.headUserId ? String(d.headUserId) : null,
        head: d.headUserId ? headById.get(String(d.headUserId)) || null : null,
      }))
    );
  } catch (error) {
    console.error('Error fetching departments:', error);
    return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();

    const body = await request.json();
    const { code, name, shortCode, icon } = body;

    if (!code || !name || !shortCode) {
      return NextResponse.json({ error: 'code, name, and shortCode are required' }, { status: 400 });
    }

    const existing = await Department.findOne({ code: code.trim().toUpperCase() });
    if (existing) {
      return NextResponse.json({ error: 'A department with this code already exists' }, { status: 400 });
    }

    const department = await Department.create({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      shortCode: shortCode.trim(),
      icon: icon || '',
    });

    return NextResponse.json(department, { status: 201 });
  } catch (error: any) {
    console.error('Error creating department:', error);
    return NextResponse.json({ error: error.message || 'Failed to create department' }, { status: 500 });
  }
}
