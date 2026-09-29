import { NextRequest, NextResponse } from 'next/server';
import Exam from '@/models/Exam';
import QuickExam from '@/models/QuickExam';
import { QuickExamError, teacherCourse } from '@/lib/quickExam/server';
import { applyFields, publish, summary } from '@/lib/quickExam/teacher';

const fail = (err: unknown) => {
  if (err instanceof QuickExamError) return NextResponse.json({ error: err.message, problems: (err as { problems?: string[] }).problems }, { status: err.status });
  console.error('quick-exams route error:', err);
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
};

// GET: the course's quick exams, newest first.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { course } = await teacherCourse(id);
    const [exams, columns] = await Promise.all([
      QuickExam.find({ courseId: course._id }).sort({ createdAt: -1 }),
      Exam.find({ courseId: course._id }).select('displayName totalMarks').lean(),
    ]);
    const names = new Map(columns.map((c) => [String(c._id), { name: c.displayName, total: c.totalMarks }]));
    return NextResponse.json({ exams: await Promise.all(exams.map((qe) => summary(qe, names))) });
  } catch (err) {
    return fail(err);
  }
}

// POST: a new quick exam - saved as a draft, or published at once with { publish: true }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { course, userId } = await teacherCourse(id);
    const body = await request.json().catch(() => ({}));
    const qe = new QuickExam({ courseId: course._id, userId, title: 'Untitled quick exam', durationMinutes: 20, status: 'draft' });
    applyFields(qe, body, false);
    if (body.publish === true) await publish(qe, course, userId);
    await qe.save();
    return NextResponse.json({ _id: String(qe._id), status: qe.status }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
