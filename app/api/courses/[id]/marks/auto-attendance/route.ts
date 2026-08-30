import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AttendanceSession from '@/models/AttendanceSession';
import Course from '@/models/Course';
import Student from '@/models/Student';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import mongoose from 'mongoose';

async function resolveParams(params: any) {
  const resolved = await params;
  return resolved.id as string;
}

const calculateWeightedMark = (rawMark: number, totalMarks: number, weightage: number) => {
  if (totalMarks <= 0) return 0;
  const weighted = (rawMark / totalMarks) * weightage;
  return Math.round(weighted * 100) / 100;
};

export async function POST(req: NextRequest, { params }: { params: any }) {
  await dbConnect();

  const session = (await getServerSession(authOptions as any)) as any;
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const courseId = await resolveParams(params);

  try {
    const course = await Course.findById(courseId);
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    if ((course.userId as any).toString() !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { examId } = await req.json().catch(() => ({}));
    if (!examId) {
      return NextResponse.json({ error: 'Exam ID is required' }, { status: 400 });
    }

    const exam = await Exam.findOne({ _id: examId, courseId: new mongoose.Types.ObjectId(courseId) });
    if (!exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
    }

    const students = await Student.find({ courseId: new mongoose.Types.ObjectId(courseId) });
    const attendanceSessions = await AttendanceSession.find({ courseId: new mongoose.Types.ObjectId(courseId) }).lean();
    
    const totalSessions = attendanceSessions.length;
    if (totalSessions === 0) {
      return NextResponse.json({ error: 'No attendance sessions found for this course.' }, { status: 400 });
    }

    const updatedMarks = [];

    for (const student of students) {
      let presentCount = 0;

      for (const attSession of attendanceSessions) {
        const record = attSession.records?.find((r: any) => String(r.studentId) === String(student._id));
        if (record && record.status === 'present') {
          presentCount++;
        }
      }

      const attendancePercentage = presentCount / totalSessions;
      const rawMark = Math.round((attendancePercentage * exam.totalMarks) * 100) / 100; // 2 decimal places max
      const weightedMark = calculateWeightedMark(rawMark, exam.totalMarks, exam.weightage);

      const markData = {
        studentId: student._id,
        examId: exam._id,
        courseId: exam.courseId,
        userId: session.user.id,
        rawMark,
        weightedMark,
        // Recomputed from attendance, so any prior Grace bump on this exam is no longer meaningful.
        preGraceMark: null,
      };

      const mark = await Mark.findOneAndUpdate(
        { studentId: student._id, examId: exam._id },
        markData,
        { upsert: true, new: true, runValidators: true }
      );

      updatedMarks.push(mark);
    }

    return NextResponse.json({ 
      message: 'Attendance marks auto-calculated successfully',
      marks: updatedMarks 
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error calculating attendance marks' }, { status: 500 });
  }
}
