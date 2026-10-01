import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Student from '@/models/Student';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import { esc, isMailConfigured } from '@/lib/mail';
import { notifyStudents, type StudentMessage } from '@/lib/studentNotify';

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

    // Without email configured, students still get the portal copy.
    const mailOn = isMailConfigured();

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


    const marks = await Mark.find({ courseId: id });
    const marksByStudent = new Map<string, typeof marks>();
    for (const mark of marks) {
      const key = String(mark.studentId);
      if (!marksByStudent.has(key)) marksByStudent.set(key, []);
      marksByStudent.get(key)!.push(mark);
    }

    let noMarks = 0;
    const messages: StudentMessage[] = [];
    for (const student of students) {
      const studentMarks = marksByStudent.get(String(student._id)) || [];
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
      const link = `${process.env.NEXTAUTH_URL || ''}/student/dashboard/courses/${id}`;
      messages.push({
        studentId: student.studentId,
        title: `Marks updated - ${course.code}`,
        subject: `Marks updated - ${course.code}${course.name ? `: ${course.name}` : ''}`,
        body: `Your marks for ${course.code}${course.name ? ` - ${course.name}` : ''} have been updated. Total so far: ${total.toFixed(2)}.`,
        href: `/student/dashboard/courses/${id}`,
        emailHtml: `
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
          <p style="margin:24px 0;"><a href="${esc(link)}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 22px;border-radius:6px;font-weight:600;">See all my marks</a></p>
        `,
      });
    }
    const r = await notifyStudents('marks', messages, { email: mailOn });
    const sent = r.emailed;
    const noEmail = r.noEmail;
    const mailFailed = r.failed;

    return NextResponse.json({ sent, notified: r.notified, noEmail, noMarks, mailFailed, skipped: noEmail + noMarks + mailFailed });
  } catch (error: any) {
    console.error('POST /api/courses/[id]/notify-grades error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
