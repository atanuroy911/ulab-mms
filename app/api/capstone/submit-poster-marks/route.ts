import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneMarks from '@/models/CapstoneMarks';
import mongoose from 'mongoose';

// A user may submit marks for a capstone group only if they supervise it or have been
// assigned to it as an evaluator by the admin.
function isGroupGrader(group: any, userId: string): boolean {
  const supervisorId = group.supervisorId?._id ?? group.supervisorId;
  if (supervisorId && String(supervisorId) === String(userId)) return true;
  return (group.evaluatorAssignments || []).some(
    (assignment: any) => String(assignment?.evaluatorId?._id ?? assignment?.evaluatorId) === String(userId)
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await dbConnect();

    const { groupId, marks } = await request.json();
    if (!groupId || !Array.isArray(marks)) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    if (!mongoose.Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: 'Invalid group id' }, { status: 400 });

    const group = await CapstoneGroup.findById(groupId).populate('studentIds').populate('courseId').populate('supervisorId');
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    // Only the group's supervisor or an assigned evaluator may record marks for it.
    // Without this, any signed-in teacher could overwrite any group's marks by guessing
    // a groupId, since the group is looked up by id alone.
    if (!isGroupGrader(group, session.user.id)) {
      return NextResponse.json({ error: 'You are not assigned to this group' }, { status: 403 });
    }

    // Marks may only be recorded for students who are actually in this group - otherwise a
    // caller could attach a mark to any student in the system via a group they do grade.
    const memberIds = new Set(
      (group.studentIds || []).map((s: any) => String(s?._id ?? s))
    );

    const saved: any[] = [];
    for (const m of marks) {
      const studentId = m._id;
      const value = Number(m.marks ?? 0);
      if (!mongoose.Types.ObjectId.isValid(studentId)) continue;
      if (!memberIds.has(String(studentId))) continue;

      let doc = await CapstoneMarks.findOne({ studentId, groupId, supervisorId: group.supervisorId, courseId: group.courseId, submissionType: 'poster' });
      if (!doc) {
        doc = new CapstoneMarks({ studentId, groupId, supervisorId: group.supervisorId, courseId: group.courseId, submittedBy: session.user.id });
      }
      doc.posterMarks = value;
      doc.submissionType = 'poster';
      doc.submittedBy = new mongoose.Types.ObjectId(session.user.id);
      await doc.save();
      saved.push({ studentId, value });
    }



    return NextResponse.json({ ok: true, savedCount: saved.length });
  } catch (error: any) {
    console.error('POST /api/capstone/submit-poster-marks error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

