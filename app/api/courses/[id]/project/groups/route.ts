import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import ProjectGroup from '@/models/ProjectGroup';
import Course from '@/models/Course';
import Student from '@/models/Student';

export async function POST(
  req: NextRequest,
  { params }: { params: any }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const course = await Course.findOne({ _id: id, userId: session.user.id });
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };

    let projectGroup = await ProjectGroup.findOne({ courseId: id });
    if (!projectGroup) {
      return NextResponse.json({ error: 'Project session not started' }, { status: 404 });
    }

    // Auto-assign every unassigned, non-withdrawn student to their own solo group
    if (action === 'autoAssignSolo') {
      const allStudents = await Student.find({ courseId: id, withdrawn: { $ne: true } }).select('_id');
      const assignedIds = new Set(
        projectGroup.groups.flatMap((g: any) => g.studentIds.map((sid: any) => sid.toString()))
      );
      const unassigned = allStudents.filter((s: any) => !assignedIds.has(s._id.toString()));

      if (unassigned.length === 0) {
        return NextResponse.json({ error: 'No unassigned students to place' }, { status: 400 });
      }

      let maxNum = projectGroup.groups.reduce(
        (max: number, g: any) => Math.max(max, g.groupNumber),
        0
      );

      for (const student of unassigned) {
        maxNum += 1;
        projectGroup.groups.push({
          groupNumber: maxNum,
          projectTitle: '',
          studentIds: [student._id],
          rubricScores: { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 },
          markedAt: null,
        } as any);
      }

      await projectGroup.save();
      await projectGroup.populate('groups.studentIds', 'name studentId');

      return NextResponse.json(projectGroup);
    }

    const maxNum = projectGroup.groups.reduce(
      (max: number, g: any) => Math.max(max, g.groupNumber),
      0
    );

    projectGroup.groups.push({
      groupNumber: maxNum + 1,
      projectTitle: '',
      studentIds: [],
      rubricScores: { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 },
      markedAt: null,
    } as any);

    await projectGroup.save();
    await projectGroup.populate('groups.studentIds', 'name studentId');

    return NextResponse.json(projectGroup);
  } catch (error: any) {
    console.error('POST /project/groups error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: any }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const course = await Course.findOne({ _id: id, userId: session.user.id });
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const { groupId } = await req.json();

    const projectGroup = await ProjectGroup.findOne({ courseId: id });
    if (!projectGroup) {
      return NextResponse.json({ error: 'Project session not found' }, { status: 404 });
    }

    const idx = projectGroup.groups.findIndex((g: any) => g._id.toString() === groupId);
    if (idx === -1) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    projectGroup.groups.splice(idx, 1);
    await projectGroup.save();
    await projectGroup.populate('groups.studentIds', 'name studentId');

    return NextResponse.json(projectGroup);
  } catch (error: any) {
    console.error('DELETE /project/groups error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
