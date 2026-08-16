import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Student from '@/models/Student';
import Mark from '@/models/Mark';
import ProjectGroup from '@/models/ProjectGroup';

// PUT (update) a student
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const studentId = id;
    const body = await request.json();
    const { studentId: newStudentId, name, probation, withdrawn, useAlias } = body;

    if (
      newStudentId === undefined &&
      name === undefined &&
      probation === undefined &&
      withdrawn === undefined &&
      useAlias === undefined
    ) {
      return NextResponse.json(
        { error: 'No student fields provided' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Verify student belongs to user
    const student = await Student.findOne({
      _id: studentId,
      userId: session.user.id,
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Check if new studentId conflicts with another student in the same course
    if (newStudentId !== undefined && newStudentId !== student.studentId) {
      const existingStudent = await Student.findOne({
        courseId: student.courseId,
        studentId: newStudentId,
        userId: session.user.id,
        _id: { $ne: studentId },
      });

      if (existingStudent) {
        return NextResponse.json(
          { error: 'A student with this ID already exists in this course' },
          { status: 400 }
        );
      }
    }

    // Update the student
    if (newStudentId !== undefined) student.studentId = newStudentId;
    if (name !== undefined) student.name = name;
    if (probation !== undefined) student.probation = Boolean(probation);
    if (withdrawn !== undefined) student.withdrawn = Boolean(withdrawn);
    if (useAlias !== undefined) student.useAlias = Boolean(useAlias);
    await student.save();

    return NextResponse.json(
      { message: 'Student updated successfully', student },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Update student error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE a student
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const studentId = id;

    await dbConnect();

    // Verify student belongs to user
    const student = await Student.findOne({
      _id: studentId,
      userId: session.user.id,
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Delete all marks associated with this student
    await Mark.deleteMany({
      studentId: studentId,
      userId: session.user.id,
    });

    // Delete the student
    await Student.deleteOne({ _id: studentId });

    // Drop the student from any project group they belonged to, then remove
    // the group entirely if it's left with zero members as a result.
    const projectGroup = await ProjectGroup.findOne({ courseId: student.courseId });
    if (projectGroup) {
      let changed = false;
      for (const group of projectGroup.groups) {
        const before = group.studentIds.length;
        group.studentIds = group.studentIds.filter((sid) => sid.toString() !== studentId);
        if (group.studentIds.length !== before) changed = true;
      }
      const beforeGroupCount = projectGroup.groups.length;
      projectGroup.groups = projectGroup.groups.filter((g) => g.studentIds.length > 0) as typeof projectGroup.groups;
      if (changed || projectGroup.groups.length !== beforeGroupCount) {
        await projectGroup.save();
      }
    }

    return NextResponse.json(
      { message: 'Student and associated marks deleted successfully' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Delete student error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
