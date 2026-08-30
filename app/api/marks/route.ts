import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Mark from '@/models/Mark';
import Student from '@/models/Student';
import Exam from '@/models/Exam';

const calculateWeightedMark = (rawMark: number, totalMarks: number, weightage: number) => {
  if (totalMarks <= 0) return 0;
  const weighted = (rawMark / totalMarks) * weightage;
  return Math.round(weighted * 100) / 100;
};

// Helper function to handle bulk mark creation
async function handleBulkCreate(marksArray: any[], userId: string) {
  try {
    await dbConnect();

    const createdMarks = [];
    
    for (const markData of marksArray) {
      const { studentId, examId } = markData;
      let { rawMark, nonCoMark, coMarks, questionMarks } = markData;

      if (!studentId || !examId || rawMark === undefined) {
        continue; // Skip invalid entries
      }

      // Verify student and exam belong to user
      const [student, exam] = await Promise.all([
        Student.findOne({ _id: studentId, userId }),
        Exam.findOne({ _id: examId, userId }),
      ]);

      if (!student || !exam) {
        continue; // Skip if student or exam not found
      }

      // Withdrawn students never carry a nonzero mark, regardless of what the client sent.
      if (student.withdrawn) {
        rawMark = 0;
        nonCoMark = null;
        coMarks = null;
        questionMarks = null;
      }

      // Check if mark already exists
      const existingMark = await Mark.findOne({ studentId, examId });
      if (existingMark) {
        continue; // Skip if mark already exists
      }

      const weightedMark = calculateWeightedMark(rawMark, exam.totalMarks, exam.weightage);

      // Create the mark
      const mark = await Mark.create({
        studentId,
        examId,
        courseId: exam.courseId,
        userId,
        rawMark,
        weightedMark,
        nonCoMark: nonCoMark || null,
        coMarks: coMarks || null,
        questionMarks: questionMarks || null,
      });

      createdMarks.push(mark);
    }

    return NextResponse.json(
      { 
        message: `Successfully created ${createdMarks.length} marks`,
        marks: createdMarks 
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Bulk create marks error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST create or update a mark (or bulk create marks)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Check if this is a bulk create request
    if (body.marks && Array.isArray(body.marks)) {
      return await handleBulkCreate(body.marks, session.user.id);
    }

    const { studentId, examId, courseId, preGraceMark } = body;
    let { rawMark, coMarks, questionMarks, nonCoMark } = body;

    if (!studentId || !examId || !courseId || rawMark === undefined) {
      return NextResponse.json(
        { error: 'Please provide all required fields' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Verify student and exam exist and belong to user
    const [student, exam] = await Promise.all([
      Student.findOne({ _id: studentId, userId: session.user.id }),
      Exam.findOne({ _id: examId, userId: session.user.id }),
    ]);

    if (!student || !exam) {
      return NextResponse.json(
        { error: 'Student or exam not found' },
        { status: 404 }
      );
    }

    // Withdrawn students never carry a nonzero mark, regardless of what the client sent -
    // force it to zero here instead of validating/rejecting, so callers don't need to
    // special-case withdrawn students before submitting.
    if (student.withdrawn) {
      rawMark = 0;
      coMarks = undefined;
      questionMarks = undefined;
      nonCoMark = undefined;
    }

    // Validate raw mark
    if (rawMark < 0 || rawMark > exam.totalMarks) {
      return NextResponse.json(
        { error: `Raw mark must be between 0 and ${exam.totalMarks}` },
        { status: 400 }
      );
    }

    // Validate CO marks if provided
    if (coMarks && Array.isArray(coMarks)) {
      // Check if exam requires CO marks
      if (exam.numberOfCOs && exam.numberOfCOs > 0) {
        if (coMarks.length !== exam.numberOfCOs) {
          return NextResponse.json(
            { error: `Expected ${exam.numberOfCOs} CO marks` },
            { status: 400 }
          );
        }

        // Validate CO marks sum + nonCoMark equals rawMark
        const coMarksSum = coMarks.reduce((sum: number, cm: number) => sum + cm, 0);
        const totalCoSum = coMarksSum + (nonCoMark || 0);
        if (Math.abs(totalCoSum - rawMark) > 0.01) {
          return NextResponse.json(
            { error: `CO marks and Non-CO mark must sum to ${rawMark}. Current sum: ${totalCoSum.toFixed(2)}` },
            { status: 400 }
          );
        }

        // Validate each CO mark is non-negative
        if (coMarks.some((cm: number) => cm < 0)) {
          return NextResponse.json(
            { error: 'CO marks cannot be negative' },
            { status: 400 }
          );
        }

        if (nonCoMark !== undefined && nonCoMark !== null && nonCoMark < 0) {
          return NextResponse.json(
            { error: 'Non-CO mark cannot be negative' },
            { status: 400 }
          );
        }
      }
    }

    // Validate Question marks if provided
    if (questionMarks && Array.isArray(questionMarks)) {
      // Check if exam requires Question marks
      if (exam.numberOfQuestions && exam.numberOfQuestions > 0) {
        if (questionMarks.length !== exam.numberOfQuestions) {
          return NextResponse.json(
            { error: `Expected ${exam.numberOfQuestions} Question marks` },
            { status: 400 }
          );
        }

        // Validate Question marks sum equals raw mark
        const questionMarksSum = questionMarks.reduce((sum: number, qm: number) => sum + qm, 0);
        if (questionMarksSum !== rawMark) {
          return NextResponse.json(
            { error: `Question marks must sum to ${rawMark}. Current sum: ${questionMarksSum}` },
            { status: 400 }
          );
        }

        // Validate each Question mark is non-negative and integer
        if (questionMarks.some((qm: number) => qm < 0 || !Number.isInteger(qm))) {
          return NextResponse.json(
            { error: 'Question marks must be non-negative integers' },
            { status: 400 }
          );
        }
      }
    }

    // Create or update mark
    const weightedMark = calculateWeightedMark(rawMark, exam.totalMarks, exam.weightage);

    // courseId is derived from the (ownership-verified) exam rather than trusted from the
    // request body - a client-supplied courseId could otherwise file a mark against a
    // different course than the exam it belongs to, corrupting per-course reports.
    const markData: any = {
      studentId,
      examId,
      courseId: exam.courseId,
      userId: session.user.id,
      rawMark,
      weightedMark,
    };

    if (coMarks && Array.isArray(coMarks) && coMarks.length > 0) {
      markData.coMarks = coMarks;
    } else if (student.withdrawn) {
      markData.coMarks = null;
    }

    if (questionMarks && Array.isArray(questionMarks) && questionMarks.length > 0) {
      markData.questionMarks = questionMarks;
    } else if (student.withdrawn) {
      markData.questionMarks = null;
    }

    if (nonCoMark !== undefined) {
      markData.nonCoMark = nonCoMark;
    } else if (student.withdrawn) {
      markData.nonCoMark = null;
    }

    // preGraceMark only ever comes from the Grace flow (the score before the bump). Any other save
    // path - manual edit, bulk paste, scaling, etc. - clears it, since that "before" value is no
    // longer meaningful once the mark has been touched again.
    markData.preGraceMark = typeof preGraceMark === 'number' ? preGraceMark : null;

    const mark = await Mark.findOneAndUpdate(
      { studentId, examId },
      markData,
      { upsert: true, new: true, runValidators: true }
    );

    return NextResponse.json({ mark }, { status: 201 });
  } catch (error: any) {
    console.error('Create/update mark error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE bulk delete marks
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { markIds } = await request.json();

    if (!markIds || !Array.isArray(markIds) || markIds.length === 0) {
      return NextResponse.json(
        { error: 'Please provide mark IDs to delete' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Delete marks that belong to the user
    const result = await Mark.deleteMany({
      _id: { $in: markIds },
      userId: session.user.id,
    });

    return NextResponse.json(
      { 
        message: `Successfully deleted ${result.deletedCount} marks`,
        deletedCount: result.deletedCount 
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Delete marks error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
