import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Student from '@/models/Student';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import { sendMail, mailShell, isMailConfigured, esc } from '@/lib/mail';

export const runtime = 'nodejs';

// Teacher-triggered "major event" email: sends every student in the course (who has an
// email on file) their current exam-by-exam marks. There's no "publish"/finalize concept
// elsewhere in the app, so this is a deliberate, teacher-clicked action rather than
// something that fires automatically on every mark save - saving a single mark happens far
// too often to double as an email trigger.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isMailConfigured()) {
      return NextResponse.json({ error: 'Email is not configured on this server' }, { status: 503 });
    }

    const { id } = await params;
    await dbConnect();

    const course = await Course.findOne({ _id: id, userId: session.user.id });
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const [students, exams] = await Promise.all([
      Student.find({ courseId: id, withdrawn: { $ne: true } }).sort({ name: 1 }),
      Exam.find({ courseId: id }).sort({ createdAt: 1 }),
    ]);

    const studentsWithEmail = students.filter((s) => !!s.email);
    if (studentsWithEmail.length === 0) {
      return NextResponse.json({ sent: 0, skipped: students.length, message: 'No students with an email on file yet' });
    }

    const marks = await Mark.find({ courseId: id });
    const marksByStudent = new Map<string, typeof marks>();
    for (const mark of marks) {
      const key = String(mark.studentId);
      if (!marksByStudent.has(key)) marksByStudent.set(key, []);
      marksByStudent.get(key)!.push(mark);
    }

    let sent = 0;
    let noMarks = 0;
    let mailFailed = 0;
    const noEmail = students.length - studentsWithEmail.length;

    for (const student of studentsWithEmail) {
      const studentMarks = marksByStudent.get(String(student._id)) || [];
      if (studentMarks.length === 0) {
        noMarks += 1;
        continue;
      }

      const rows = exams
        .map((exam) => {
          const mark = studentMarks.find((m) => String(m.examId) === String(exam._id));
          if (!mark) return null;
          return `<tr>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;">${esc(exam.displayName)}</td>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${mark.rawMark} / ${exam.totalMarks}</td>
            <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">${(mark.weightedMark || 0).toFixed(2)} / ${exam.weightage}</td>
          </tr>`;
        })
        .filter(Boolean)
        .join('');

      if (!rows) {
        noMarks += 1;
        continue;
      }

      const total = studentMarks.reduce((sum, m) => sum + (m.weightedMark || 0), 0);

      const result = await sendMail({
        to: student.email!,
        subject: `Marks updated - ${course.code}${course.name ? `: ${course.name}` : ''}`,
        html: mailShell(`
          <h2 style="margin-top:0;">Marks Updated: ${esc(course.code)}</h2>
          <p>Hi ${esc(student.name)},</p>
          <p>Your marks for <strong>${esc(course.code)}${course.name ? ` - ${esc(course.name)}` : ''}</strong> have been updated:</p>
          <table style="border-collapse:collapse;width:100%;font-size:14px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;">Item</th>
                <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">Raw</th>
                <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;">Weighted</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin-top:16px;"><strong>Total so far: ${total.toFixed(2)}</strong></p>
        `),
      });
      if (result.ok) sent += 1;
      else mailFailed += 1;
    }

    return NextResponse.json({ sent, noEmail, noMarks, mailFailed, skipped: noEmail + noMarks + mailFailed });
  } catch (error: any) {
    console.error('POST /api/courses/[id]/notify-grades error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
