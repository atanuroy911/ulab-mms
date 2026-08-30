import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';

const round2 = (n: number) => Math.round(n * 100) / 100;

// POST - Rescale every existing mark for this exam from an old maximum to a new one
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { scaleFrom, scaleTo } = await request.json();

    if (scaleFrom === undefined || scaleTo === undefined || scaleFrom <= 0 || scaleTo <= 0) {
      return NextResponse.json(
        { error: 'Please provide a valid scaling-from and scaling-to value, both greater than 0' },
        { status: 400 }
      );
    }

    await dbConnect();

    const exam = await Exam.findOne({ _id: id, userId: session.user.id });
    if (!exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
    }

    const marks = await Mark.find({ examId: id, userId: session.user.id });

    const ratio = scaleTo / scaleFrom;
    let updated = 0;

    for (const mark of marks) {
      const newRawMark = Math.min(scaleTo, Math.max(0, round2(mark.rawMark * ratio)));
      mark.rawMark = newRawMark;
      mark.weightedMark = exam.totalMarks > 0 ? round2((newRawMark / exam.totalMarks) * exam.weightage) : 0;
      // Scaling redefines the mark itself, so any prior Grace "before" value is no longer meaningful.
      mark.preGraceMark = null;

      if (mark.coMarks && mark.coMarks.length > 0) {
        mark.coMarks = mark.coMarks.map((m: number) => round2(m * ratio));
      }
      if (mark.nonCoMark !== undefined && mark.nonCoMark !== null) {
        mark.nonCoMark = round2(mark.nonCoMark * ratio);
      }
      if (mark.questionMarks && mark.questionMarks.length > 0) {
        mark.questionMarks = mark.questionMarks.map((m: number) => Math.round(m * ratio));
      }

      await mark.save();
      updated++;
    }

    return NextResponse.json({ message: 'Marks scaled successfully', updated }, { status: 200 });
  } catch (error: any) {
    console.error('Scale marks error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
