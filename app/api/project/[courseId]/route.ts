import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import { resolveSessionStudent } from '@/lib/studentAuth';
import ProjectGroup from '@/models/ProjectGroup';
import Course from '@/models/Course';
import Student from '@/models/Student';

/**
 * Requires a verified @ulab.edu.bd Google session (dashboard, attendance check-in, marks
 * check, or the 'google-project' provider all qualify - see
 * app/api/auth/[...nextauth]/route.ts). The caller is always the student resolved from that
 * session (`me`), never a client-supplied identity claim. `me` can act on themselves freely,
 * and can also add/remove *other* students to/from a group `me` already belongs to - this is
 * the "team lead adds teammates" flow, so only one member per team needs to sign in - but
 * `me` can never touch a group they aren't a member of, and can't add a target student who's
 * already in a different group.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: any }
) {
  try {
    const { courseId } = await params;
    await dbConnect();

    const session = (await getServerSession(authOptions as any)) as any;
    const email = session?.user?.email?.toLowerCase();
    if (!email || !email.endsWith('@ulab.edu.bd')) {
      return NextResponse.json({ error: 'Please sign in with your ULAB Google account' }, { status: 401 });
    }

    const course = await Course.findById(courseId).select('name code semester year');
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const students = await Student.find({ courseId, withdrawn: { $ne: true } })
      .select('name studentId _id')
      .sort({ name: 1 });

    const resolvedStudent = await resolveSessionStudent(courseId);
    const me = resolvedStudent
      ? { _id: resolvedStudent._id.toString(), name: resolvedStudent.name, studentId: resolvedStudent.studentId }
      : null;

    let projectGroup = await ProjectGroup.findOne({ courseId })
      .populate('groups.studentIds', 'name studentId');

    if (!projectGroup) {
      return NextResponse.json({
        course: { _id: course._id, name: course.name, code: course.code, semester: course.semester, year: course.year },
        students,
        me,
        isActive: false,
        maxMembersPerGroup: 4,
        groups: [],
      });
    }

    return NextResponse.json({
      course: { _id: course._id, name: course.name, code: course.code, semester: course.semester, year: course.year },
      students,
      me,
      isActive: projectGroup.isActive,
      maxMembersPerGroup: projectGroup.maxMembersPerGroup,
      groups: projectGroup.groups,
    });
  } catch (error: any) {
    console.error('GET /api/project/[courseId] error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: any }
) {
  try {
    const { courseId } = await params;
    await dbConnect();

    const body = await req.json();
    const { groupId, action, projectTitle } = body;
    // The target student defaults to the caller themselves, but the caller may also name a
    // teammate here (e.g. adding them to a group) - authorization below decides whether
    // that's allowed, it's never trusted outright.
    const targetStudentId = typeof body?.studentId === 'string' && body.studentId ? body.studentId : undefined;

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    // The caller is always resolved from the signed-in Google session, never trusted from
    // the request body - this is who "me" is, and every authorization check below is
    // relative to them.
    const resolvedStudent = await resolveSessionStudent(courseId);
    if (!resolvedStudent) {
      return NextResponse.json(
        { error: 'Could not verify your identity. Please sign in with your ULAB Google account.' },
        { status: 401 }
      );
    }
    const callerId = resolvedStudent._id.toString();
    const studentId = targetStudentId || callerId;

    const projectGroup = await ProjectGroup.findOne({ courseId });
    if (!projectGroup) {
      return NextResponse.json({ error: 'Project session not started' }, { status: 404 });
    }

    if (!projectGroup.isActive) {
      return NextResponse.json({ error: 'Project session is not active' }, { status: 403 });
    }

    const isMemberOf = (group: any, sid: string) =>
      group.studentIds.some((gid: any) => gid.toString() === sid);

    // ── createGroup: caller creates a new group and auto-joins it ───────────
    if (action === 'createGroup') {
      // Check if already in a group
      const alreadyInGroup = projectGroup.groups.some((g: any) => isMemberOf(g, callerId));
      if (alreadyInGroup) {
        return NextResponse.json({ error: 'You are already in a group. Leave it first.' }, { status: 400 });
      }

      // Auto-assign next group number
      const maxNum = projectGroup.groups.reduce(
        (max: number, g: any) => Math.max(max, g.groupNumber), 0
      );

      projectGroup.groups.push({
        groupNumber: maxNum + 1,
        projectTitle: '',
        studentIds: [callerId],
        rubricScores: { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 },
        markedAt: null,
      } as any);

      await projectGroup.save();
      await projectGroup.populate('groups.studentIds', 'name studentId');

      return NextResponse.json({
        isActive: projectGroup.isActive,
        maxMembersPerGroup: projectGroup.maxMembersPerGroup,
        groups: projectGroup.groups,
      });
    }

    // ── join / leave ─────────────────────────────────────────────────────────
    if (action === 'join' || action === 'leave') {
      if (!groupId) {
        return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
      }

      const targetGroup = (projectGroup.groups as any).id(groupId);
      if (!targetGroup) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      }

      // The caller can always act on themselves. Acting on a teammate (adding/removing
      // someone else) is only allowed if the caller is already a member of this group -
      // e.g. the student who created the group inviting others in - never an outsider.
      const actingOnSelf = studentId === callerId;
      if (!actingOnSelf && !isMemberOf(targetGroup, callerId)) {
        return NextResponse.json(
          { error: 'Only members of this group can add or remove teammates' },
          { status: 403 }
        );
      }

      const student = await Student.findOne({ _id: studentId, courseId });
      if (!student) {
        return NextResponse.json({ error: 'Student not found in this course' }, { status: 404 });
      }

      if (action === 'join') {
        const alreadyInGroup = projectGroup.groups.some((g: any) => isMemberOf(g, studentId));
        if (alreadyInGroup) {
          return NextResponse.json(
            { error: actingOnSelf ? 'You are already in a group. Leave it first.' : `${student.name} is already in a group.` },
            { status: 400 }
          );
        }

        if (targetGroup.studentIds.length >= projectGroup.maxMembersPerGroup) {
          return NextResponse.json(
            { error: `This group is full (max ${projectGroup.maxMembersPerGroup} members)` },
            { status: 400 }
          );
        }

        targetGroup.studentIds.push(studentId as any);
      } else {
        // leave
        const idx = targetGroup.studentIds.findIndex(
          (sid: any) => sid.toString() === studentId
        );
        if (idx === -1) {
          return NextResponse.json(
            { error: actingOnSelf ? 'You are not in this group' : `${student.name} is not in this group` },
            { status: 400 }
          );
        }
        targetGroup.studentIds.splice(idx, 1);
      }
    }

    // ── setTitle ─────────────────────────────────────────────────────────────
    if (action === 'setTitle') {
      if (!groupId || projectTitle === undefined) {
        return NextResponse.json({ error: 'groupId and projectTitle are required' }, { status: 400 });
      }
      const targetGroup = (projectGroup.groups as any).id(groupId);
      if (!targetGroup) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      }

      if (!isMemberOf(targetGroup, callerId)) {
        return NextResponse.json({ error: 'Only group members can update the project title' }, { status: 403 });
      }

      targetGroup.projectTitle = projectTitle;
    }

    await projectGroup.save();
    await projectGroup.populate('groups.studentIds', 'name studentId');

    return NextResponse.json({
      isActive: projectGroup.isActive,
      maxMembersPerGroup: projectGroup.maxMembersPerGroup,
      groups: projectGroup.groups,
    });
  } catch (error: any) {
    console.error('PATCH /api/project/[courseId] error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
