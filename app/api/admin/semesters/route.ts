import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Semester from '@/models/Semester';
import { verifyAdminToken } from '@/lib/adminAuth';

export async function GET(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();

    const semesters = await Semester.find()
      .sort({ createdAt: -1 });

    return NextResponse.json(semesters);
  } catch (error) {
    console.error('Error fetching semesters:', error);
    return NextResponse.json(
      { error: 'Failed to fetch semesters' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    await dbConnect();

    const body = await request.json();
    const { name, description, startDate, endDate, isActive } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Semester name is required' },
        { status: 400 }
      );
    }

    // Check if semester already exists
    const existing = await Semester.findOne({ name });
    if (existing) {
      return NextResponse.json(
        { error: 'Semester with this name already exists' },
        { status: 400 }
      );
    }

    const semester = new Semester({
      name: name.trim(),
      description: description || '',
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      isActive: isActive !== undefined ? isActive : true,
    });

    await semester.save();

    return NextResponse.json(semester, { status: 201 });
  } catch (error) {
    console.error('Error creating semester:', error);
    return NextResponse.json(
      { error: 'Failed to create semester' },
      { status: 500 }
    );
  }
}
