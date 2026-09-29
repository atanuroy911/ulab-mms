import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Exam from '@/models/Exam';
import Student from '@/models/Student';
import QuickExam from '@/models/QuickExam';
import QuickExamAttempt from '@/models/QuickExamAttempt';
import { QuickExamError, questionCount, submitAttempt, submitExpired, teacherCourse, writeMark } from '@/lib/quickExam/server';
import { markPaper } from '@/lib/quickExam/paper';

const fail = (err: unknown) => {
  if (err instanceof QuickExamError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error('quick-exam results error:', err);
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
};

async function load(courseId: string, qid: string) {
  const ctx = await teacherCourse(courseId);
  if (!mongoose.Types.ObjectId.isValid(qid)) throw new QuickExamError('Quick exam not found', 404);
  const qe = await QuickExam.findOne({ _id: qid, courseId: ctx.course._id });
  if (!qe) throw new QuickExamError('Quick exam not found', 404);
  return { ...ctx, qe };
}

// GET: every enrolled student's status and score, plus how each question went.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }) {
  try {
    const { id, qid } = await params;
    const { qe, course } = await load(id, qid);
    // Papers whose time ran out without a submit are marked now.
    await submitExpired(qe._id);
    const [students, attempts, exam] = await Promise.all([
      Student.find({ courseId: course._id }).select('studentId name withdrawn').sort({ studentId: 1 }).lean(),
      QuickExamAttempt.find({ quickExamId: qe._id }).lean(),
      qe.examId ? Exam.findById(qe.examId).select('displayName totalMarks').lean() : null,
    ]);
    const byStudent = new Map(attempts.map((a) => [String(a.studentRecordId), a]));
    const now = Date.now();

    // Item analysis: per set and question, how many who answered got it right.
    const items = qe.sets.map((set) => set.questions.map(() => ({ seen: 0, answered: 0, right: 0 })));
    for (const a of attempts) {
      if (!a.submittedAt) continue;
      const set = qe.sets[a.setIndex];
      if (!set) continue;
      const { perQuestion } = markPaper(set, a.paper, a.answers);
      a.paper.forEach((slot, p) => {
        const item = items[a.setIndex][slot.q];
        item.seen += 1;
        if (perQuestion[p] !== null) item.answered += 1;
        if (perQuestion[p] === true) item.right += 1;
      });
    }

    return NextResponse.json({
      questions: questionCount(qe),
      marksColumn: exam ? { name: exam.displayName, total: exam.totalMarks } : null,
      rows: students.map((s) => {
        const a = byStudent.get(String(s._id));
        const state = !a ? 'not started' : a.submittedAt ? 'submitted' : a.deadline.getTime() < now ? 'time up' : 'in progress';
        return {
          studentRecordId: String(s._id),
          studentId: s.studentId,
          name: s.name,
          withdrawn: !!s.withdrawn,
          state,
          set: a ? qe.sets[a.setIndex]?.name ?? null : null,
          answered: a ? a.answers.filter((x) => x !== null && x !== undefined).length : 0,
          correct: a?.correct ?? null,
          mark: a?.mark ?? null,
          startedAt: a?.startedAt ?? null,
          submittedAt: a?.submittedAt ?? null,
          autoSubmitted: !!a?.autoSubmitted,
          violations: a?.violations ?? 0,
        };
      }),
      items: qe.sets.map((set, si) => ({
        set: set.name,
        questions: set.questions.map((q, qi) => ({ number: qi + 1, stem: q.stem, ...items[si][qi] })),
      })),
    });
  } catch (err) {
    return fail(err);
  }
}

// POST { action: 'reset', studentRecordId } - let one student take it again (their paper is
// discarded; the mark stays until they submit again).
// POST { action: 'submit', studentRecordId } - mark an unfinished paper now.
// POST { action: 'resync' } - rewrite every submitted score into the marks column.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }) {
  try {
    const { id, qid } = await params;
    const { qe } = await load(id, qid);
    const body = await request.json().catch(() => ({}));
    if (body.action === 'reset' || body.action === 'submit') {
      if (!mongoose.Types.ObjectId.isValid(String(body.studentRecordId))) throw new QuickExamError('Choose a student', 400);
      const attempt = await QuickExamAttempt.findOne({ quickExamId: qe._id, studentRecordId: body.studentRecordId });
      if (!attempt) throw new QuickExamError('This student has not started', 404);
      if (body.action === 'reset') {
        await QuickExamAttempt.deleteOne({ _id: attempt._id });
        return NextResponse.json({ reset: true });
      }
      const done = await submitAttempt(attempt._id, { auto: true });
      return NextResponse.json({ correct: done?.correct ?? null, mark: done?.mark ?? null });
    }
    if (body.action === 'resync') {
      const submitted = await QuickExamAttempt.find({ quickExamId: qe._id, submittedAt: { $ne: null }, correct: { $ne: null } });
      let written = 0;
      for (const a of submitted) {
        const mark = await writeMark(qe, a, a.correct as number);
        if (mark !== null) {
          written += 1;
          if (mark !== a.mark) await QuickExamAttempt.updateOne({ _id: a._id }, { $set: { mark } });
        }
      }
      return NextResponse.json({ written });
    }
    throw new QuickExamError('Unknown action', 400);
  } catch (err) {
    return fail(err);
  }
}
