import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Mark from '@/models/Mark';
import Student from '@/models/Student';
import ProjectGroup from '@/models/ProjectGroup';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: courseId } = await params;

    await dbConnect();

    const course = await Course.findOne({
      _id: courseId,
      userId: session.user.id,
    });

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const body = await _request.json().catch(() => null);
    const specificStudentIds = body?.studentIds as string[] | undefined;

    const courseObjectId = new mongoose.Types.ObjectId(courseId);
    let studentIdsToDelete: mongoose.Types.ObjectId[] = [];

    if (specificStudentIds && specificStudentIds.length > 0) {
      const students = await Student.find({
        _id: { $in: specificStudentIds },
        courseId: courseObjectId,
        userId: session.user.id
      }).select('_id');
      studentIdsToDelete = students.map((student) => student._id);
    } else {
      const students = await Student.find({ courseId: courseObjectId, userId: session.user.id }).select('_id');
      studentIdsToDelete = students.map((student) => student._id);
    }

    if (studentIdsToDelete.length === 0) {
      return NextResponse.json({ message: 'No students found to delete', deletedStudents: 0, deletedMarks: 0 }, { status: 200 });
    }

    const [marksResult, studentsResult] = await Promise.all([
      Mark.deleteMany({
        studentId: { $in: studentIdsToDelete },
        userId: session.user.id,
      }),
      Student.deleteMany({
        _id: { $in: studentIdsToDelete },
        courseId: courseObjectId,
        userId: session.user.id,
      }),
    ]);

    // Drop the deleted students from any project group they belonged to, then
    // remove groups that are left with zero members as a result.
    const projectGroup = await ProjectGroup.findOne({ courseId: courseObjectId });
    if (projectGroup) {
      const deletedIdSet = new Set(studentIdsToDelete.map((sid) => sid.toString()));
      let changed = false;
      for (const group of projectGroup.groups) {
        const before = group.studentIds.length;
        group.studentIds = group.studentIds.filter((sid) => !deletedIdSet.has(sid.toString()));
        if (group.studentIds.length !== before) changed = true;
      }
      const beforeGroupCount = projectGroup.groups.length;
      projectGroup.groups = projectGroup.groups.filter((g) => g.studentIds.length > 0) as typeof projectGroup.groups;
      if (changed || projectGroup.groups.length !== beforeGroupCount) {
        await projectGroup.save();
      }
    }

    return NextResponse.json(
      {
        message: 'All students deleted successfully',
        deletedStudents: studentsResult.deletedCount || 0,
        deletedMarks: marksResult.deletedCount || 0,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Bulk delete students error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}