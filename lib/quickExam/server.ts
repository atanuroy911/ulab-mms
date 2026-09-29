// Quick exams on the server: who may do what, the exam window, starting a paper, saving
// answers against the deadline, marking, and writing the mark into the course.
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions, isStudentOnlySessionUser } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import { escapeRegExp } from '@/lib/utils';
import Course from '@/models/Course';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import Student from '@/models/Student';
import QuickExam, { type IQuickExam } from '@/models/QuickExam';
import QuickExamAttempt, { type IQuickExamAttempt } from '@/models/QuickExamAttempt';
import { parseExamText } from '@/lib/quickExam/format';
import { makePaper, markPaper, pickSet, scaledMark } from '@/lib/quickExam/paper';

/** Allowance for the network on the last save or submit. */
export const GRACE_MS = 30_000;

export class QuickExamError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// ── Who is asking ─────────────────────────────────────────────────────────────────────────

/** The signed-in teacher's own course. Student sessions never pass. */
export async function teacherCourse(courseId: string) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | undefined;
  if (!user?.id || isStudentOnlySessionUser(user)) throw new QuickExamError('Unauthorized', 401);
  if (!mongoose.Types.ObjectId.isValid(courseId)) throw new QuickExamError('Course not found', 404);
  await dbConnect();
  const course = await Course.findOne({ _id: courseId, userId: user.id });
  if (!course) throw new QuickExamError('Course not found', 404);
  return { course, userId: user.id };
}

/** The signed-in student (student Google login), by the ID in their ULAB display name. */
export async function sessionStudent() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { studentSession?: boolean; studentIdText?: string | null; name?: string | null } | undefined;
  if (!user?.studentSession || !user.studentIdText) {
    throw new QuickExamError('Sign in with your ULAB student Google account to take exams', 401);
  }
  await dbConnect();
  return { studentIdText: user.studentIdText, name: user.name || user.studentIdText };
}

/** The student's enrolment in a course (not withdrawn), or null. */
export async function enrolment(courseId: unknown, studentIdText: string) {
  return Student.findOne({
    courseId,
    studentId: { $regex: new RegExp(`^${escapeRegExp(studentIdText)}$`, 'i') },
    withdrawn: { $ne: true },
  });
}

// ── The exam window ─────────────────────────────────────────────────────────────────────────

export type Availability = 'draft' | 'upcoming' | 'open' | 'closed';

export function availability(qe: Pick<IQuickExam, 'status' | 'opensAt' | 'closesAt'>, now = new Date()): Availability {
  if (qe.status === 'draft') return 'draft';
  if (qe.status === 'closed') return 'closed';
  if (qe.opensAt && now < qe.opensAt) return 'upcoming';
  if (qe.closesAt && now >= qe.closesAt) return 'closed';
  return 'open';
}

/** The questions a paste turns into, or the problems that stop it being published. */
export function setsFromText(text: string) {
  const parsed = parseExamText(text);
  if (!parsed.ok) {
    const problems = [
      ...parsed.issues,
      ...parsed.sets.flatMap((s) => [
        ...s.issues.map((i) => `Set ${s.name}: ${i}`),
        ...s.questions.flatMap((q) => q.issues.map((i) => `Set ${s.name}, question ${q.number}: ${i}`)),
      ]),
    ];
    return { sets: null, problems };
  }
  return {
    sets: parsed.sets.map((s) => ({ name: s.name, questions: s.questions.map((q) => ({ stem: q.stem, options: q.options, answer: q.answer as number })) })),
    problems: [] as string[],
  };
}

export const questionCount = (qe: Pick<IQuickExam, 'sets'>) => qe.sets[0]?.questions.length ?? 0;

// ── Taking the exam ─────────────────────────────────────────────────────────────────────────

/** The student's paper: continues an existing one, or deals a new one (set + shuffle). */
export async function startAttempt(qe: IQuickExam, student: { _id: unknown; studentId: string; name: string }, now = new Date()) {
  const existing = await QuickExamAttempt.findOne({ quickExamId: qe._id, studentRecordId: student._id });
  if (existing) return existing;
  if (availability(qe, now) !== 'open') throw new QuickExamError('This exam is not open', 409);

  const taken = await QuickExamAttempt.aggregate<{ _id: number; n: number }>([
    { $match: { quickExamId: qe._id } },
    { $group: { _id: '$setIndex', n: { $sum: 1 } } },
  ]);
  const perSet = qe.sets.map((_, i) => taken.find((t) => t._id === i)?.n ?? 0);
  const setIndex = pickSet(qe.sets.length, perSet);
  const set = qe.sets[setIndex];
  const paper = makePaper(set, { shuffleQuestions: qe.shuffleQuestions, shuffleOptions: qe.shuffleOptions });
  const byDuration = now.getTime() + qe.durationMinutes * 60_000;
  const deadline = new Date(qe.closesAt ? Math.min(byDuration, qe.closesAt.getTime()) : byDuration);

  try {
    return await QuickExamAttempt.create({
      quickExamId: qe._id,
      courseId: qe.courseId,
      studentRecordId: student._id,
      studentIdText: student.studentId,
      studentName: student.name,
      setIndex,
      paper,
      answers: paper.map(() => null),
      startedAt: now,
      deadline,
    });
  } catch (err) {
    // Two tabs pressed Start at once: the unique index let one through - use that one.
    if ((err as { code?: number }).code === 11000) {
      const winner = await QuickExamAttempt.findOne({ quickExamId: qe._id, studentRecordId: student._id });
      if (winner) return winner;
    }
    throw err;
  }
}

/** Saves one answer. Refused once submitted or past the deadline (plus a little grace). */
export async function saveAnswer(attempt: IQuickExamAttempt, position: number, choice: number | null, now = new Date()) {
  if (!Number.isInteger(position) || position < 0 || position >= attempt.paper.length) throw new QuickExamError('No such question', 400);
  if (choice !== null && (!Number.isInteger(choice) || choice < 0 || choice >= attempt.paper[position].o.length)) {
    throw new QuickExamError('No such option', 400);
  }
  if (attempt.submittedAt) throw new QuickExamError('This exam has already been submitted', 409);
  if (now.getTime() > attempt.deadline.getTime() + GRACE_MS) throw new QuickExamError("Time is up - answers can't be changed now", 409);
  const res = await QuickExamAttempt.updateOne(
    { _id: attempt._id, submittedAt: null, deadline: { $gte: new Date(now.getTime() - GRACE_MS) } },
    { $set: { [`answers.${position}`]: choice } }
  );
  if (res.matchedCount === 0) throw new QuickExamError("Time is up - answers can't be changed now", 409);
}

/**
 * The student left full screen: every saved answer is cleared (the paper and the timer stay),
 * and the violation is recorded for the teacher. The client then signs the student out.
 */
export async function recordViolation(attempt: IQuickExamAttempt, now = new Date()) {
  if (attempt.submittedAt) return false;
  const res = await QuickExamAttempt.updateOne(
    { _id: attempt._id, submittedAt: null },
    { $set: { answers: attempt.paper.map(() => null), lastViolationAt: now }, $inc: { violations: 1 } }
  );
  return res.modifiedCount === 1;
}

/**
 * Marks the attempt and writes the mark. Safe to call twice at once: only the call that
 * flips `submittedAt` marks it.
 */
export async function submitAttempt(attemptId: unknown, opts: { auto: boolean }, now = new Date()) {
  const attempt = await QuickExamAttempt.findOneAndUpdate(
    { _id: attemptId, submittedAt: null },
    { $set: { submittedAt: now, autoSubmitted: opts.auto } },
    { new: true }
  );
  if (!attempt) return QuickExamAttempt.findById(attemptId);
  const qe = await QuickExam.findById(attempt.quickExamId);
  if (!qe) return attempt;
  const set = qe.sets[attempt.setIndex];
  const { correct } = markPaper(set, attempt.paper, attempt.answers);
  const mark = await writeMark(qe, attempt, correct);
  attempt.correct = correct;
  attempt.mark = mark;
  await QuickExamAttempt.updateOne({ _id: attempt._id }, { $set: { correct, mark } });
  return attempt;
}

/** Scales the score to the exam column's total and writes it for the student. */
export async function writeMark(qe: IQuickExam, attempt: Pick<IQuickExamAttempt, 'studentRecordId'>, correct: number): Promise<number | null> {
  const [exam, student] = await Promise.all([Exam.findById(qe.examId), Student.findById(attempt.studentRecordId)]);
  if (!exam || !student) return null;
  // Withdrawn students never carry a nonzero mark (as the marks API enforces).
  const raw = student.withdrawn ? 0 : scaledMark(correct, questionCount(qe), exam.totalMarks);
  const weighted = exam.totalMarks > 0 ? Math.round((raw / exam.totalMarks) * exam.weightage * 100) / 100 : 0;
  await Mark.updateOne(
    { studentId: student._id, examId: exam._id },
    {
      $set: { rawMark: raw, weightedMark: weighted, preGraceMark: null },
      $setOnInsert: { courseId: exam.courseId, userId: exam.userId },
    },
    { upsert: true }
  );
  return raw;
}

/** Marks every paper whose time ran out without a submit (the student closed the tab, ...). */
export async function submitExpired(quickExamId: unknown, now = new Date()) {
  const expired = await QuickExamAttempt.find({ quickExamId, submittedAt: null, deadline: { $lt: new Date(now.getTime() - GRACE_MS) } }).select('_id');
  for (const a of expired) await submitAttempt(a._id, { auto: true }, now);
  return expired.length;
}

/** What a student sees of their paper - never the answers, never the original order. */
export function paperForStudent(qe: IQuickExam, attempt: IQuickExamAttempt, now = new Date()) {
  const set = qe.sets[attempt.setIndex];
  const questions = attempt.paper.map((slot) => ({
    stem: set.questions[slot.q].stem,
    options: slot.o.map((i) => set.questions[slot.q].options[i]),
  }));
  const submitted = !!attempt.submittedAt;
  const review =
    submitted && qe.showReview
      ? markPaper(set, attempt.paper, attempt.answers).perQuestion.map((right, p) => ({
          right,
          correctOption: attempt.paper[p].o.indexOf(set.questions[attempt.paper[p].q].answer),
        }))
      : null;
  return {
    title: qe.title,
    instructions: qe.instructions || '',
    questions,
    answers: attempt.answers.map((a) => (a === undefined ? null : a)),
    startedAt: attempt.startedAt,
    deadline: attempt.deadline,
    serverNow: now,
    submitted,
    autoSubmitted: attempt.autoSubmitted,
    violations: attempt.violations ?? 0,
    result: submitted ? { correct: attempt.correct ?? null, total: attempt.paper.length } : null,
    review,
  };
}
