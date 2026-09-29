import { NextResponse } from 'next/server';
import { escapeRegExp } from '@/lib/utils';
import Course from '@/models/Course';
import Student from '@/models/Student';
import QuickExam from '@/models/QuickExam';
import QuickExamAttempt from '@/models/QuickExamAttempt';
import { QuickExamError, availability, questionCount, sessionStudent, submitAttempt, GRACE_MS } from '@/lib/quickExam/server';

// GET: the signed-in student's quick exams across the courses they're enrolled in - open and
// upcoming ones, and any they have taken.
export async function GET() {
  try {
    const { studentIdText } = await sessionStudent();
    const enrolments = await Student.find({
      studentId: { $regex: new RegExp(`^${escapeRegExp(studentIdText)}$`, 'i') },
      withdrawn: { $ne: true },
    })
      .select('courseId')
      .lean();
    const courseIds = enrolments.map((e) => e.courseId);
    const [exams, courses, attempts] = await Promise.all([
      QuickExam.find({ courseId: { $in: courseIds }, status: { $ne: 'draft' } }).sort({ opensAt: -1, createdAt: -1 }),
      Course.find({ _id: { $in: courseIds } }).select('name code section semester year').lean(),
      QuickExamAttempt.find({ studentRecordId: { $in: enrolments.map((e) => e._id) } }),
    ]);
    const now = new Date();
    // A paper whose time ran out without a submit is marked on the way.
    for (const a of attempts) {
      if (!a.submittedAt && a.deadline.getTime() + GRACE_MS < now.getTime()) {
        const done = await submitAttempt(a._id, { auto: true }, now);
        if (done) Object.assign(a, { submittedAt: done.submittedAt, correct: done.correct });
      }
    }
    const courseById = new Map(courses.map((c) => [String(c._id), c]));
    const attemptByExam = new Map(attempts.map((a) => [String(a.quickExamId), a]));

    const list = exams
      .map((qe) => {
        const a = attemptByExam.get(String(qe._id));
        const when = availability(qe, now);
        if (!a && when === 'closed') return null; // missed and closed - nothing to do
        const c = courseById.get(String(qe.courseId));
        return {
          _id: String(qe._id),
          title: qe.title,
          course: c ? `${c.code}${c.section ? ` (${c.section})` : ''} - ${c.name}` : '',
          questions: questionCount(qe),
          durationMinutes: qe.durationMinutes,
          opensAt: qe.opensAt ?? null,
          closesAt: qe.closesAt ?? null,
          availability: when,
          state: !a ? 'not started' : a.submittedAt ? 'submitted' : 'in progress',
          deadline: a && !a.submittedAt ? a.deadline : null,
          result: a?.submittedAt ? { correct: a.correct ?? null, total: a.paper.length } : null,
        };
      })
      .filter(Boolean);
    return NextResponse.json({ exams: list, serverNow: now });
  } catch (err) {
    if (err instanceof QuickExamError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('student quick-exams error:', err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
