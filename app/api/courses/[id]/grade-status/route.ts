import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import GradeChange from '@/models/GradeChange';
import { getCapstoneActor, canManageDepartment } from '@/lib/capstoneAuth';
import { courseDepartment, currentGrades, ownCourse, pendingChanges } from '@/lib/gradeChange';

// The course's status (running / finished) and its grade changes - lib/gradeChange.ts.
//
// GET  -> { status, finishedAt, changes (pending), history (sent), department, canSetHead }
// POST { action: 'finish' }                              - grades are final: record them
//      { action: 'reopen' }                              - back to running
//      { action: 'reason', studentRecordId, reason }     - the reason for one change
//      { action: 'sent', studentRecordIds }              - forms sent: keep on record, new grade becomes official

async function teacher() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? String(session.user.id) : null;
}

async function payload(course: InstanceType<typeof Course>) {
  const [now, department, drafts, history, actor] = await Promise.all([
    course.status === 'finished' ? currentGrades(course) : Promise.resolve([]),
    courseDepartment(course),
    GradeChange.find({ courseId: course._id, sentAt: null }).select('studentRecordId reason').lean(),
    GradeChange.find({ courseId: course._id, sentAt: { $ne: null } }).sort({ sentAt: -1 }).lean(),
    getCapstoneActor(),
  ]);
  const reasonOf = new Map(drafts.map((d) => [String(d.studentRecordId), d.reason]));
  return {
    status: course.status || 'running',
    finishedAt: course.finishedAt || null,
    finalCount: course.finalGrades?.length || 0,
    changes: pendingChanges(course, now).map((c) => ({ ...c, reason: reasonOf.get(c.studentRecordId) || '' })),
    history: history.map((h) => ({
      _id: String(h._id),
      studentRecordId: String(h.studentRecordId),
      studentId: h.studentId,
      name: h.studentName,
      oldGrade: h.oldGrade,
      newGrade: h.newGrade,
      reason: h.reason,
      sentAt: h.sentAt,
    })),
    department,
    // Coordinators and admins set the department's head name for every form.
    canSetHead: !!department && !!actor && !actor.systemAccount && canManageDepartment(actor, department.code),
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await teacher();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await dbConnect();
    const course = await ownCourse(id, userId);
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    return NextResponse.json(await payload(course));
  } catch (error) {
    console.error('GET /api/courses/[id]/grade-status error:', error);
    return NextResponse.json({ error: 'Failed to load the course status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await teacher();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    await dbConnect();
    const course = await ownCourse(id, userId);
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    const finished = course.status === 'finished';

    if (action === 'finish') {
      if (finished) return NextResponse.json({ error: 'The course is already finished' }, { status: 409 });
      const now = await currentGrades(course);
      course.status = 'finished';
      course.finishedAt = new Date();
      course.finalGrades = now.map((s) => ({ studentRecordId: new mongoose.Types.ObjectId(s.studentRecordId), studentId: s.studentId, grade: s.grade, total: s.total }));
      // Only these fields: a whole-document save would re-validate older courses' other fields.
      await Course.updateOne({ _id: course._id }, { $set: { status: course.status, finishedAt: course.finishedAt, finalGrades: course.finalGrades } });
      // Reasons typed for an earlier round no longer apply.
      await GradeChange.deleteMany({ courseId: course._id, sentAt: null });
      return NextResponse.json(await payload(course));
    }

    if (action === 'reopen') {
      if (!finished) return NextResponse.json({ error: 'The course is already running' }, { status: 409 });
      course.status = 'running';
      await Course.updateOne({ _id: course._id }, { $set: { status: 'running' } });
      return NextResponse.json(await payload(course));
    }

    if (!finished) return NextResponse.json({ error: 'Grade changes start once the course is finished' }, { status: 409 });

    if (action === 'reason') {
      const sid = typeof body?.studentRecordId === 'string' ? body.studentRecordId : '';
      const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
      if (!mongoose.Types.ObjectId.isValid(sid)) return NextResponse.json({ error: 'studentRecordId is required' }, { status: 400 });
      if (reason.length > 1000) return NextResponse.json({ error: 'Please keep the reason under 1,000 characters' }, { status: 400 });
      const official = course.finalGrades?.find((g) => String(g.studentRecordId) === sid);
      if (!official) return NextResponse.json({ error: 'That student has no final grade in this course' }, { status: 404 });
      await GradeChange.findOneAndUpdate(
        { courseId: course._id, studentRecordId: sid, sentAt: null },
        { $set: { reason }, $setOnInsert: { userId, studentId: official.studentId } },
        { upsert: true }
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'sent') {
      const ids: string[] = Array.isArray(body?.studentRecordIds) ? body.studentRecordIds.filter((x: unknown) => typeof x === 'string') : [];
      if (ids.length === 0) return NextResponse.json({ error: 'Choose at least one student' }, { status: 400 });
      const changes = pendingChanges(course, await currentGrades(course)).filter((c) => ids.includes(c.studentRecordId));
      if (changes.length === 0) return NextResponse.json({ error: 'None of these students has a grade change any more. Refresh to see.' }, { status: 409 });
      const sentAt = new Date();
      for (const c of changes) {
        await GradeChange.findOneAndUpdate(
          { courseId: course._id, studentRecordId: c.studentRecordId, sentAt: null },
          {
            $set: { userId, studentId: c.studentId, studentName: c.name, oldGrade: c.oldGrade, newGrade: c.newGrade, oldTotal: c.oldTotal, newTotal: c.newTotal, sentAt },
            $setOnInsert: { reason: '' },
          },
          { upsert: true }
        );
        const official = course.finalGrades!.find((g) => String(g.studentRecordId) === c.studentRecordId)!;
        official.grade = c.newGrade;
        official.total = c.newTotal;
      }
      await Course.updateOne({ _id: course._id }, { $set: { finalGrades: course.finalGrades } });
      return NextResponse.json(await payload(course));
    }

    return NextResponse.json({ error: 'action must be finish, reopen, reason or sent' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/courses/[id]/grade-status error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update the course' }, { status: 500 });
  }
}
