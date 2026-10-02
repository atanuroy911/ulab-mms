import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import GradeChange from '@/models/GradeChange';
import Student from '@/models/Student';
import { getCapstoneActor, canManageDepartment } from '@/lib/capstoneAuth';
import { cleanDetails, cleanRows, courseDepartment, currentGrades, formDefaults, ownCourse, pendingChanges } from '@/lib/gradeChange';

// The course's status (running / finished) and its grade changes - lib/gradeChange.ts.
//
// GET  -> { status, finishedAt, grades, changes (automatic, waiting for a form), history, form, department, canSetHead }
// POST { action: 'finish' }                                   - grades are final: record them
//      { action: 'reopen' }                                   - back to running
//      { action: 'reason', studentRecordId, reason }          - the reason for one automatic change
//      { action: 'sent', studentRecordIds, details? }         - automatic forms sent: recorded, new grade official
//      { action: 'record', rows, details }                    - manual form: recorded, new grade official

type CourseDoc = NonNullable<Awaited<ReturnType<typeof ownCourse>>>;

async function teacher() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? String(session.user.id) : null;
}

async function payload(course: CourseDoc) {
  const department = await courseDepartment(course);
  const [now, drafts, history, actor, form] = await Promise.all([
    currentGrades(course),
    GradeChange.find({ courseId: course._id, sentAt: null }).select('studentRecordId reason').lean(),
    GradeChange.find({ courseId: course._id, sentAt: { $ne: null } }).sort({ sentAt: -1 }).lean(),
    getCapstoneActor(),
    formDefaults(course, department),
  ]);
  const finished = course.status === 'finished';
  const reasonOf = new Map(drafts.map((d) => [String(d.studentRecordId), d.reason]));
  const changedBefore = new Set(history.map((h) => String(h.studentRecordId)));
  const official = new Map((course.finalGrades || []).map((g) => [String(g.studentRecordId), g]));
  return {
    status: course.status || 'running',
    finishedAt: course.finishedAt || null,
    // Every student: the grade at finishing, the official grade now, and what the marks give now.
    grades: now.map((s) => {
      const o = official.get(s.studentRecordId);
      return {
        studentRecordId: s.studentRecordId,
        studentId: s.studentId,
        name: s.name,
        withdrawn: s.withdrawn,
        current: s.grade,
        currentTotal: s.total,
        official: finished ? o?.grade ?? null : null,
        original: finished ? o?.originalGrade ?? o?.grade ?? null : null,
        changes: history.filter((h) => String(h.studentRecordId) === s.studentRecordId).length,
      };
    }),
    changes: finished ? pendingChanges(course, now, changedBefore).map((c) => ({ ...c, reason: reasonOf.get(c.studentRecordId) || '' })) : [],
    history: history.map((h) => ({
      _id: String(h._id),
      studentRecordId: String(h.studentRecordId),
      studentId: h.studentId,
      name: h.studentName,
      oldGrade: h.oldGrade,
      newGrade: h.newGrade,
      reason: h.reason,
      kind: h.kind || 'auto',
      sentAt: h.sentAt,
    })),
    form,
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
      course.finalGrades = now.map((s) => ({
        studentRecordId: new mongoose.Types.ObjectId(s.studentRecordId),
        studentId: s.studentId,
        grade: s.grade,
        total: s.total,
        originalGrade: s.grade,
        originalTotal: s.total,
      }));
      // Only these fields: a whole-document save would re-validate older courses' other fields.
      await Course.updateOne({ _id: course._id }, { $set: { status: course.status, finishedAt: course.finishedAt, finalGrades: course.finalGrades } });
      // Reasons typed for an earlier round no longer apply; sent changes stay on record.
      await GradeChange.deleteMany({ courseId: course._id, sentAt: null });
      return NextResponse.json(await payload(course));
    }

    if (action === 'reopen') {
      if (!finished) return NextResponse.json({ error: 'The course is already running' }, { status: 409 });
      course.status = 'running';
      await Course.updateOne({ _id: course._id }, { $set: { status: 'running' } });
      return NextResponse.json(await payload(course));
    }

    if (action === 'record') {
      // The manual form: any students, every field as the teacher wrote it. Allowed whether
      // or not the course is finished - the form is the teacher's to fill.
      const cleaned = cleanRows(body?.rows);
      if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
      const details = cleanDetails(body?.details, await formDefaults(course));
      const recordIds = cleaned.rows.map((r) => r.studentRecordId).filter((x): x is string => !!x);
      const known = new Set(
        (await Student.find({ _id: { $in: recordIds }, courseId: course._id }).select('_id').lean()).map((s) => String(s._id))
      );
      const rows = cleaned.rows.filter((r) => r.studentRecordId && known.has(r.studentRecordId));
      if (rows.length === 0) return NextResponse.json({ error: 'Only students of this course can be recorded' }, { status: 400 });
      const now = new Map((await currentGrades(course)).map((g) => [g.studentRecordId, g]));
      const sentAt = new Date();
      const created = await GradeChange.insertMany(
        rows.map((r) => ({
          courseId: course._id,
          userId,
          studentRecordId: r.studentRecordId,
          studentId: r.studentId,
          studentName: r.studentName,
          oldGrade: r.oldGrade,
          newGrade: r.newGrade,
          oldTotal: null,
          newTotal: now.get(r.studentRecordId!)?.grade === r.newGrade ? now.get(r.studentRecordId!)!.total : null,
          reason: r.reason,
          kind: 'manual',
          details,
          sentAt,
        }))
      );
      // The written new grade becomes the official one.
      let moved = false;
      for (const r of rows) {
        const official = course.finalGrades?.find((g) => String(g.studentRecordId) === r.studentRecordId);
        if (!official) continue;
        official.grade = r.newGrade;
        const cur = now.get(r.studentRecordId!);
        if (cur && cur.grade === r.newGrade) official.total = cur.total;
        moved = true;
      }
      if (moved) await Course.updateOne({ _id: course._id }, { $set: { finalGrades: course.finalGrades } });
      await GradeChange.deleteMany({ courseId: course._id, studentRecordId: { $in: rows.map((r) => r.studentRecordId) }, sentAt: null });
      return NextResponse.json({ ...(await payload(course)), recorded: created.map((c) => String(c._id)), skipped: cleaned.rows.length - rows.length });
    }

    if (!finished) return NextResponse.json({ error: 'Automatic grade changes start once the course is finished' }, { status: 409 });

    if (action === 'reason') {
      const sid = typeof body?.studentRecordId === 'string' ? body.studentRecordId : '';
      const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
      if (!mongoose.Types.ObjectId.isValid(sid)) return NextResponse.json({ error: 'studentRecordId is required' }, { status: 400 });
      if (reason.length > 1000) return NextResponse.json({ error: 'Please keep the reason under 1,000 characters' }, { status: 400 });
      const official = course.finalGrades?.find((g) => String(g.studentRecordId) === sid);
      if (!official) return NextResponse.json({ error: 'That student has no final grade in this course' }, { status: 404 });
      await GradeChange.findOneAndUpdate(
        { courseId: course._id, studentRecordId: sid, sentAt: null },
        { $set: { reason }, $setOnInsert: { userId, studentId: official.studentId, kind: 'auto' } },
        { upsert: true }
      );
      return NextResponse.json({ ok: true });
    }

    if (action === 'sent') {
      const ids: string[] = Array.isArray(body?.studentRecordIds) ? body.studentRecordIds.filter((x: unknown) => typeof x === 'string') : [];
      if (ids.length === 0) return NextResponse.json({ error: 'Choose at least one student' }, { status: 400 });
      const changedBefore = new Set((await GradeChange.distinct('studentRecordId', { courseId: course._id, sentAt: { $ne: null } })).map(String));
      const all = pendingChanges(course, await currentGrades(course), changedBefore).filter((c) => ids.includes(c.studentRecordId));
      const changes = all.filter((c) => !c.repeat);
      if (changes.length === 0) {
        return NextResponse.json(
          { error: all.length ? 'These students already had a grade change - use the manual grade change form.' : 'None of these students has a grade change any more. Refresh to see.' },
          { status: 409 }
        );
      }
      const details = cleanDetails(body?.details, await formDefaults(course));
      const sentAt = new Date();
      for (const c of changes) {
        await GradeChange.findOneAndUpdate(
          { courseId: course._id, studentRecordId: c.studentRecordId, sentAt: null },
          {
            $set: { userId, studentId: c.studentId, studentName: c.name, oldGrade: c.oldGrade, newGrade: c.newGrade, oldTotal: c.oldTotal, newTotal: c.newTotal, kind: 'auto', details, sentAt },
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

    return NextResponse.json({ error: 'action must be finish, reopen, reason, sent or record' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/courses/[id]/grade-status error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update the course' }, { status: 500 });
  }
}
