import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import QuickExam from '@/models/QuickExam';
import QuickExamAttempt from '@/models/QuickExamAttempt';
import { QuickExamError, availability, teacherCourse } from '@/lib/quickExam/server';
import { applyFields, publish, publishProblems } from '@/lib/quickExam/teacher';

const fail = (err: unknown) => {
  if (err instanceof QuickExamError) return NextResponse.json({ error: err.message, problems: (err as { problems?: string[] }).problems }, { status: err.status });
  console.error('quick-exam route error:', err);
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
};

async function load(courseId: string, qid: string) {
  const ctx = await teacherCourse(courseId);
  if (!mongoose.Types.ObjectId.isValid(qid)) throw new QuickExamError('Quick exam not found', 404);
  const qe = await QuickExam.findOne({ _id: qid, courseId: ctx.course._id });
  if (!qe) throw new QuickExamError('Quick exam not found', 404);
  return { ...ctx, qe };
}

// GET: everything the builder needs, answers included (teacher only).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }) {
  try {
    const { id, qid } = await params;
    const { qe } = await load(id, qid);
    const started = await QuickExamAttempt.countDocuments({ quickExamId: qe._id });
    return NextResponse.json({
      _id: String(qe._id),
      title: qe.title,
      instructions: qe.instructions || '',
      sourceText: qe.sourceText,
      durationMinutes: qe.durationMinutes,
      opensAt: qe.opensAt ?? null,
      closesAt: qe.closesAt ?? null,
      shuffleQuestions: qe.shuffleQuestions,
      shuffleOptions: qe.shuffleOptions,
      showReview: qe.showReview,
      requireFullscreen: qe.requireFullscreen,
      examId: qe.examId ? String(qe.examId) : null,
      newExamName: qe.newExamName ?? null,
      newExamTotal: qe.newExamTotal ?? null,
      status: qe.status,
      availability: availability(qe),
      started,
      locked: started > 0,
      publishProblems: qe.status === 'draft' ? await publishProblems(qe) : [],
    });
  } catch (err) {
    return fail(err);
  }
}

// PATCH: save the builder's fields; { action: 'publish' | 'close' | 'reopen' } too.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }) {
  try {
    const { id, qid } = await params;
    const { qe, course, userId } = await load(id, qid);
    const body = await request.json().catch(() => ({}));
    const locked = (await QuickExamAttempt.countDocuments({ quickExamId: qe._id })) > 0;
    applyFields(qe, body, locked);
    if (body.action === 'publish') await publish(qe, course, userId);
    else if (body.action === 'close') qe.status = 'closed';
    else if (body.action === 'reopen') {
      if (qe.status !== 'closed') throw new QuickExamError('Only a closed exam can be reopened', 409);
      qe.status = 'published';
      // Reopening a past closing time would close it again at once - clear it.
      if (qe.closesAt && qe.closesAt <= new Date()) qe.closesAt = null;
    } else if (body.action === 'unpublish') {
      if (locked) throw new QuickExamError('Students have started this exam, so it can only be closed', 409);
      qe.status = 'draft';
    }
    await qe.save();
    return NextResponse.json({ _id: String(qe._id), status: qe.status, availability: availability(qe) });
  } catch (err) {
    return fail(err);
  }
}

// DELETE: the exam and its attempts. Marks already written to the course stay.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }) {
  try {
    const { id, qid } = await params;
    const { qe } = await load(id, qid);
    const { deletedCount } = await QuickExamAttempt.deleteMany({ quickExamId: qe._id });
    await QuickExam.deleteOne({ _id: qe._id });
    return NextResponse.json({ deleted: true, attemptsDeleted: deletedCount });
  } catch (err) {
    return fail(err);
  }
}
