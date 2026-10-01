import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Course from '@/models/Course';
import QuickExam from '@/models/QuickExam';
import QuickExamAttempt from '@/models/QuickExamAttempt';
import {
  GRACE_MS,
  QuickExamError,
  availability,
  enrolment,
  paperForStudent,
  questionCount,
  recordViolation,
  saveAnswer,
  sessionStudent,
  startAttempt,
  submitAttempt,
} from '@/lib/quickExam/server';

const fail = (err: unknown) => {
  if (err instanceof QuickExamError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error('student quick-exam error:', err);
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
};

/** The exam and the signed-in student's enrolment in its course - or a 404 for anyone else. */
async function load(qid: string, write = false) {
  const { studentIdText } = await sessionStudent({ write });
  if (!mongoose.Types.ObjectId.isValid(qid)) throw new QuickExamError('Exam not found', 404);
  const qe = await QuickExam.findById(qid);
  if (!qe || qe.status === 'draft') throw new QuickExamError('Exam not found', 404);
  const student = await enrolment(qe.courseId, studentIdText);
  if (!student) throw new QuickExamError('Exam not found', 404);
  return { qe, student };
}

// GET: the exam's details, and the student's paper once they have started.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ qid: string }> }) {
  try {
    const { qid } = await params;
    const { qe, student } = await load(qid);
    const now = new Date();
    let attempt = await QuickExamAttempt.findOne({ quickExamId: qe._id, studentRecordId: student._id });
    if (attempt && !attempt.submittedAt && attempt.deadline.getTime() + GRACE_MS < now.getTime()) {
      attempt = await submitAttempt(attempt._id, { auto: true }, now);
    }
    const course = await Course.findById(qe.courseId).select('code name section').lean();
    return NextResponse.json({
      exam: {
        title: qe.title,
        instructions: qe.instructions || '',
        course: course ? `${course.code}${course.section ? ` (${course.section})` : ''} - ${course.name}` : '',
        questions: questionCount(qe),
        durationMinutes: qe.durationMinutes,
        requireFullscreen: qe.requireFullscreen,
        opensAt: qe.opensAt ?? null,
        closesAt: qe.closesAt ?? null,
        availability: availability(qe, now),
      },
      student: { name: student.name, studentId: student.studentId },
      paper: attempt ? paperForStudent(qe, attempt, now) : null,
      serverNow: now,
    });
  } catch (err) {
    return fail(err);
  }
}

// POST { action: 'start' } | { action: 'answer', position, choice } | { action: 'submit' }
//    | { action: 'violation' } (left full screen: answers are cleared)
export async function POST(request: NextRequest, { params }: { params: Promise<{ qid: string }> }) {
  try {
    const { qid } = await params;
    const { qe, student } = await load(qid, true);
    const body = await request.json().catch(() => ({}));
    const now = new Date();

    if (body.action === 'start') {
      const attempt = await startAttempt(qe, student, now);
      return NextResponse.json({ paper: paperForStudent(qe, attempt, now) });
    }

    const attempt = await QuickExamAttempt.findOne({ quickExamId: qe._id, studentRecordId: student._id });
    if (!attempt) throw new QuickExamError('Start the exam first', 409);

    if (body.action === 'answer') {
      const choice = body.choice === null ? null : Number(body.choice);
      await saveAnswer(attempt, Number(body.position), choice, now);
      return NextResponse.json({ saved: true, serverNow: now });
    }

    if (body.action === 'violation') {
      if (!qe.requireFullscreen) return NextResponse.json({ cleared: false });
      // Left full screen: answers cleared on the server, so a reload can't bring them back.
      const cleared = await recordViolation(attempt, now);
      return NextResponse.json({ cleared });
    }

    if (body.action === 'submit') {
      const done = await submitAttempt(attempt._id, { auto: false }, now);
      return NextResponse.json({ paper: done ? paperForStudent(qe, done, now) : null });
    }

    throw new QuickExamError('Unknown action', 400);
  } catch (err) {
    return fail(err);
  }
}
