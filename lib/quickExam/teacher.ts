// Shared by the teacher's quick exam routes: reading the builder's fields, publishing, and
// the summary the course view lists.
import Exam from '@/models/Exam';
import QuickExamAttempt from '@/models/QuickExamAttempt';
import type { IQuickExam } from '@/models/QuickExam';
import { QuickExamError, availability, questionCount, setsFromText } from '@/lib/quickExam/server';

type Body = Record<string, unknown>;

const dateOrNull = (v: unknown, label: string) => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new QuickExamError(`${label} is not a valid date`, 400);
  return d;
};

/**
 * Copies the builder's fields onto the exam. `locked` (a student has started) allows only the
 * details that can't change anyone's paper: title, instructions, times, and the review setting.
 */
export function applyFields(qe: IQuickExam, body: Body, locked: boolean) {
  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t) throw new QuickExamError('Give the exam a title', 400);
    qe.title = t.slice(0, 200);
  }
  if (typeof body.instructions === 'string') qe.instructions = body.instructions.slice(0, 5000);
  if (body.durationMinutes !== undefined) {
    const n = Number(body.durationMinutes);
    if (!Number.isInteger(n) || n < 1 || n > 600) throw new QuickExamError('Time limit must be 1 to 600 minutes', 400);
    qe.durationMinutes = n;
  }
  if ('opensAt' in body) qe.opensAt = dateOrNull(body.opensAt, 'Opening time');
  if ('closesAt' in body) qe.closesAt = dateOrNull(body.closesAt, 'Closing time');
  if (qe.opensAt && qe.closesAt && qe.closesAt <= qe.opensAt) throw new QuickExamError('The closing time must be after the opening time', 400);
  if (typeof body.showReview === 'boolean') qe.showReview = body.showReview;
  if (typeof body.requireFullscreen === 'boolean') qe.requireFullscreen = body.requireFullscreen;

  const paperFields = ['sourceText', 'shuffleQuestions', 'shuffleOptions', 'examId', 'newExamName', 'newExamTotal'];
  const touchesPaper = paperFields.some((f) => f in body);
  if (locked && touchesPaper) {
    const changed = paperFields.filter((f) => f in body && JSON.stringify(body[f] ?? null) !== JSON.stringify(f === 'examId' ? (qe.examId ? String(qe.examId) : null) : ((qe as unknown as Body)[f] ?? null)));
    if (changed.length) throw new QuickExamError('Students have started this exam, so its questions, answers and marks column can no longer change', 409);
    return;
  }
  if (typeof body.sourceText === 'string') {
    qe.sourceText = body.sourceText.slice(0, 500_000);
    const { sets } = setsFromText(qe.sourceText);
    qe.sets = sets ?? [];
  }
  if (typeof body.shuffleQuestions === 'boolean') qe.shuffleQuestions = body.shuffleQuestions;
  if (typeof body.shuffleOptions === 'boolean') qe.shuffleOptions = body.shuffleOptions;
  if ('examId' in body || 'newExamName' in body) {
    const examId = typeof body.examId === 'string' && body.examId ? body.examId : null;
    qe.examId = examId as unknown as IQuickExam['examId'];
    qe.newExamName = examId ? null : typeof body.newExamName === 'string' ? body.newExamName.trim().slice(0, 100) || null : null;
  }
  if ('newExamTotal' in body) {
    const n = body.newExamTotal === null || body.newExamTotal === '' ? null : Number(body.newExamTotal);
    if (n !== null && (!Number.isFinite(n) || n <= 0 || n > 1000)) throw new QuickExamError('The new column total must be above 0', 400);
    qe.newExamTotal = n;
  }
}

/** Everything that must be true to publish, as one list. */
export async function publishProblems(qe: IQuickExam) {
  const problems = [...setsFromText(qe.sourceText).problems];
  if (!qe.examId && !qe.newExamName) problems.push('Choose the marks column the scores go into');
  if (qe.examId) {
    const exam = await Exam.findOne({ _id: qe.examId, courseId: qe.courseId });
    if (!exam) problems.push('The chosen marks column no longer exists');
  }
  return problems;
}

/** Publishes: creates the new Quiz column if asked for, and opens the exam. */
export async function publish(qe: IQuickExam, course: { _id: unknown; quizWeightage?: number | null }, userId: string) {
  const problems = await publishProblems(qe);
  if (problems.length) throw Object.assign(new QuickExamError('This exam is not ready to publish', 400), { problems });
  if (!qe.examId) {
    const exam = await Exam.create({
      courseId: course._id,
      userId,
      displayName: qe.newExamName,
      examType: 'custom',
      examCategory: 'Quiz',
      isRequired: false,
      totalMarks: qe.newExamTotal || questionCount(qe),
      // Quizzes share the course's Quiz weightage, as the exams API does.
      weightage: course.quizWeightage ?? 0,
    });
    qe.examId = exam._id as IQuickExam['examId'];
    qe.newExamName = null;
    qe.newExamTotal = null;
  }
  qe.status = 'published';
  qe.publishedAt = qe.publishedAt ?? new Date();
}

/** A row in the course's quick exam list. */
export async function summary(qe: IQuickExam, examNames: Map<string, { name: string; total: number }>) {
  const [started, submitted] = await Promise.all([
    QuickExamAttempt.countDocuments({ quickExamId: qe._id }),
    QuickExamAttempt.countDocuments({ quickExamId: qe._id, submittedAt: { $ne: null } }),
  ]);
  const column = qe.examId ? examNames.get(String(qe.examId)) : null;
  return {
    _id: String(qe._id),
    title: qe.title,
    status: qe.status,
    availability: availability(qe),
    sets: qe.sets.length,
    questions: questionCount(qe),
    durationMinutes: qe.durationMinutes,
    opensAt: qe.opensAt ?? null,
    closesAt: qe.closesAt ?? null,
    marksColumn: column ? `${column.name} (/${column.total})` : qe.newExamName ? `${qe.newExamName} (new)` : null,
    started,
    submitted,
    updatedAt: qe.updatedAt,
  };
}
