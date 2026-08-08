import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Exam from '@/models/Exam';
import Course from '@/models/Course';
import RubricTemplate from '@/models/RubricTemplate';
import mongoose from 'mongoose';

// POST create a custom exam
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { courseId, displayName, totalMarks, weightage, numberOfCOs, numberOfQuestions, examCategory, rubricTemplateId } =
      await request.json();

    // Validation
    if (!courseId || !displayName || !totalMarks) {
      return NextResponse.json(
        { error: 'Please provide all required fields' },
        { status: 400 }
      );
    }

    if (totalMarks <= 0) {
      return NextResponse.json(
        { error: 'Total marks must be greater than 0' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Verify course exists and belongs to user
    const course = await Course.findOne({
      _id: courseId,
      userId: session.user.id,
    });

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const examData: any = {
      courseId,
      displayName,
      examType: 'custom',
      totalMarks,
      isRequired: false,
      userId: session.user.id,
    };

    // Add examCategory if provided
    if (examCategory) {
      const validCategories = ['Quiz', 'Assignment', 'Project', 'Attendance', 'MainExam', 'ClassPerformance', 'Others'];
      if (!validCategories.includes(examCategory)) {
        return NextResponse.json(
          { error: 'Invalid exam category' },
          { status: 400 }
        );
      }

      if (examCategory === 'Attendance') {
        const existingAttendanceExam = await Exam.findOne({ courseId, examCategory: 'Attendance' });
        if (existingAttendanceExam) {
          return NextResponse.json(
            { error: 'Only one Attendance exam is allowed per course' },
            { status: 400 }
          );
        }
      }

      examData.examCategory = examCategory;
    }

    const inheritedWeightage =
      examCategory === 'Quiz'
        ? course.quizWeightage ?? 0
        : examCategory === 'Assignment'
          ? course.assignmentWeightage ?? 0
          : weightage;

    if (examCategory === 'Quiz' || examCategory === 'Assignment') {
      if (inheritedWeightage < 0 || inheritedWeightage > 100) {
        return NextResponse.json(
          { error: 'Course group weightage must be between 0 and 100' },
          { status: 400 }
        );
      }
      examData.weightage = inheritedWeightage;
    } else {
      if (weightage === undefined) {
        return NextResponse.json(
          { error: 'Weightage is required for non-Quiz/Assignment exams' },
          { status: 400 }
        );
      }

      if (weightage < 0 || weightage > 100) {
        return NextResponse.json(
          { error: 'Weightage must be between 0 and 100' },
          { status: 400 }
        );
      }

      examData.weightage = weightage;
    }

    // Add numberOfCOs if provided (for theory courses)
    if (numberOfCOs !== undefined && numberOfCOs > 0) {
      if (numberOfCOs > 6) {
        return NextResponse.json(
          { error: 'Number of COs must be between 1 and 6' },
          { status: 400 }
        );
      }
      examData.numberOfCOs = numberOfCOs;
    }

    // Add numberOfQuestions if provided
    if (numberOfQuestions !== undefined && numberOfQuestions > 0) {
      if (numberOfQuestions > 50) {
        return NextResponse.json(
          { error: 'Number of Questions must be between 1 and 50' },
          { status: 400 }
        );
      }
      examData.numberOfQuestions = numberOfQuestions;
    }

    // rubricTemplateId only applies to Project exams: null/undefined = direct marking
    if (rubricTemplateId && examCategory === 'Project') {
      if (!mongoose.Types.ObjectId.isValid(rubricTemplateId)) {
        return NextResponse.json({ error: 'Invalid rubric template' }, { status: 400 });
      }
      const rubric = await RubricTemplate.findById(rubricTemplateId);
      if (!rubric) {
        return NextResponse.json({ error: 'Rubric template not found' }, { status: 400 });
      }
      examData.rubricTemplateId = rubricTemplateId;
    }

    const exam = await Exam.create(examData);

    return NextResponse.json({ exam }, { status: 201 });
  } catch (error: any) {
    console.error('Create exam error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
