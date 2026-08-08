import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Exam from '@/models/Exam';
import Course from '@/models/Course';
import Mark from '@/models/Mark';
import RubricTemplate from '@/models/RubricTemplate';
import mongoose from 'mongoose';

// PUT - Update exam settings
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { displayName, weightage, numberOfCOs, numberOfQuestions, totalMarks, examCategory, rubricTemplateId } =
      await request.json();

    await dbConnect();

    const existingExam = await Exam.findOne({ _id: id, userId: session.user.id });
    if (!existingExam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
    }
    const previousNumberOfCOs = existingExam.numberOfCOs || 0;

    const updateData: any = {};

    // Update displayName if provided
    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }

    // Update examCategory if provided
    if (examCategory !== undefined) {
      const validCategories = ['Quiz', 'Assignment', 'Project', 'Attendance', 'MainExam', 'ClassPerformance', 'Others'];
      if (!validCategories.includes(examCategory) && examCategory !== '') {
        return NextResponse.json(
          { error: 'Invalid exam category' },
          { status: 400 }
        );
      }
      updateData.examCategory = examCategory;
    }

    // Update numberOfCOs if provided
    if (numberOfCOs !== undefined) {
      if (numberOfCOs < 0 || numberOfCOs > 10) {
        return NextResponse.json(
          { error: 'Number of COs must be between 0 and 10' },
          { status: 400 }
        );
      }
      updateData.numberOfCOs = numberOfCOs;
    }

    // Update numberOfQuestions if provided
    if (numberOfQuestions !== undefined) {
      if (numberOfQuestions < 0 || numberOfQuestions > 50) {
        return NextResponse.json(
          { error: 'Number of Questions must be between 0 and 50' },
          { status: 400 }
        );
      }
      updateData.numberOfQuestions = numberOfQuestions;
    }

    // Update totalMarks if provided
    if (totalMarks !== undefined) {
      if (totalMarks <= 0) {
        return NextResponse.json(
          { error: 'Total marks must be greater than 0' },
          { status: 400 }
        );
      }
      updateData.totalMarks = totalMarks;
    }

    // rubricTemplateId only applies to Project exams; empty/null clears it back to direct marking
    if (rubricTemplateId !== undefined) {
      if (!rubricTemplateId) {
        updateData.rubricTemplateId = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(rubricTemplateId)) {
          return NextResponse.json({ error: 'Invalid rubric template' }, { status: 400 });
        }
        const rubric = await RubricTemplate.findById(rubricTemplateId);
        if (!rubric) {
          return NextResponse.json({ error: 'Rubric template not found' }, { status: 400 });
        }
        updateData.rubricTemplateId = rubricTemplateId;
      }
    }

    const exam = await Exam.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
    }

    // If the number of COs was reduced, any existing coMarks for this exam are now
    // misaligned with the new CO count and could leak stale/wrong values into Course
    // File export — clear them so teachers must re-enter CO breakdowns.
    if (numberOfCOs !== undefined && numberOfCOs < previousNumberOfCOs) {
      await Mark.updateMany(
        { examId: id, coMarks: { $exists: true, $ne: null } },
        { $set: { coMarks: null } }
      );
    }

    if (exam.examCategory === 'Quiz' || exam.examCategory === 'Assignment') {
      const course = await Course.findOne({ _id: exam.courseId, userId: session.user.id }).lean();

      const inheritedWeightage =
        exam.examCategory === 'Quiz'
          ? course?.quizWeightage ?? 0
          : course?.assignmentWeightage ?? 0;

      if (exam.weightage !== inheritedWeightage) {
        exam.weightage = inheritedWeightage;
        await exam.save();
      }
    } else if (weightage !== undefined) {
      if (weightage < 0 || weightage > 100) {
        return NextResponse.json(
          { error: 'Weightage must be between 0 and 100' },
          { status: 400 }
        );
      }
      exam.weightage = weightage;
      await exam.save();
    }

    return NextResponse.json({ exam }, { status: 200 });
  } catch (error: any) {
    console.error('Update exam error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete an exam (only custom exams can be deleted)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    await dbConnect();

    const exam = await Exam.findOne({ _id: id, userId: session.user.id });

    if (!exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
    }

    await Exam.findByIdAndDelete(id);

    return NextResponse.json(
      { message: 'Exam deleted successfully' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Delete exam error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
