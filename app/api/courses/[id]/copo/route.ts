import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: courseId } = await params;
    const { maxMarks, mapping, projectNumberOfCOs, projectCoAutoDistribute } = await request.json();

    if (maxMarks === undefined && mapping === undefined && projectNumberOfCOs === undefined && projectCoAutoDistribute === undefined) {
      return NextResponse.json(
        { error: 'Missing required mapping data' },
        { status: 400 }
      );
    }

    await dbConnect();

    const existing = await Course.findOne({ _id: courseId, userId: session.user.id });
    if (!existing) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    // Merge onto the existing coPoMapping so a partial save (e.g. just the combined Project CO
    // settings from the exam gear button) never wipes out unrelated fields like the mapping matrix.
    const nextCoPoMapping = {
      ...(existing.coPoMapping || {}),
      ...(maxMarks !== undefined ? { maxMarks } : {}),
      ...(mapping !== undefined ? { mapping } : {}),
      ...(projectNumberOfCOs !== undefined ? { projectNumberOfCOs } : {}),
      ...(projectCoAutoDistribute !== undefined ? { projectCoAutoDistribute } : {}),
    };

    const course = await Course.findOneAndUpdate(
      { _id: courseId, userId: session.user.id },
      { $set: { coPoMapping: nextCoPoMapping } },
      { new: true }
    );

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, course }, { status: 200 });
  } catch (error: any) {
    console.error('Update CO PO Mapping error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
