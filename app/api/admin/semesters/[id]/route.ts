import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Semester from '@/models/Semester';
import mongoose from 'mongoose';
import { verifyAdminToken } from '@/lib/adminAuth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid semester ID' },
        { status: 400 }
      );
    }

    await dbConnect();

    const body = await request.json();
    const { name, description, startDate, endDate, isActive } = body;

    const semester = await Semester.findById(id);
    if (!semester) {
      return NextResponse.json(
        { error: 'Semester not found' },
        { status: 404 }
      );
    }

    // Check if name is being changed and already exists
    if (name && name !== semester.name) {
      const existing = await Semester.findOne({ name });
      if (existing) {
        return NextResponse.json(
          { error: 'Semester with this name already exists' },
          { status: 400 }
        );
      }
      semester.name = name.trim();
    }

    if (description !== undefined) semester.description = description;
    if (startDate !== undefined) semester.startDate = startDate ? new Date(startDate) : undefined;
    if (endDate !== undefined) semester.endDate = endDate ? new Date(endDate) : undefined;
    if (isActive !== undefined) semester.isActive = isActive;

    await semester.save();

    return NextResponse.json(semester);
  } catch (error) {
    console.error('Error updating semester:', error);
    return NextResponse.json(
      { error: 'Failed to update semester' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await verifyAdminToken(request))) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: 'Invalid semester ID' },
        { status: 400 }
      );
    }

    await dbConnect();

    const semester = await Semester.findByIdAndDelete(id);
    if (!semester) {
      return NextResponse.json(
        { error: 'Semester not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Semester deleted successfully' });
  } catch (error) {
    console.error('Error deleting semester:', error);
    return NextResponse.json(
      { error: 'Failed to delete semester' },
      { status: 500 }
    );
  }
}
