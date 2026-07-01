import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Student from '@/models/Student';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import { cascadeDeleteCourseData } from '@/lib/courseCascadeDelete';

// GET a specific course
export async function GET(
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

    const course = await Course.findOne({
      _id: id,
      userId: session.user.id,
    });

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    // Get students, exams, and marks for this course
    const [students, exams, marks] = await Promise.all([
      Student.find({ courseId: id }).sort({ studentId: 1, _id: 1 }).collation({ locale: 'en', numericOrdering: true }),
      Exam.find({ courseId: id }),
      Mark.find({ courseId: id }),
    ]);

    return NextResponse.json(
      {
        course,
        students,
        exams,
        marks,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Get course error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT update a course
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
    const body = await request.json();
    const { 
      name, 
      code, 
      semester, 
      year, 
      section, 
      courseType, 
      showFinalGrade,
      quizAggregation,
      assignmentAggregation,
      quizWeightage,
      assignmentWeightage,
      projectWeightage,
      classTime,
      classRoom,
      numberOfStudents,
      classRepresentativeId,
      aliasEnabled,
      alternateCode,
    } = body;

    await dbConnect();

    const updateData: any = {};
    
    // Update basic fields if provided
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (semester !== undefined) updateData.semester = semester;
    if (year !== undefined) updateData.year = year;
    if (section !== undefined) updateData.section = section;
    
    // Only update courseType if provided (prevent accidental changes)
    if (courseType !== undefined) {
      if (!['Theory', 'Lab'].includes(courseType)) {
        return NextResponse.json(
          { error: 'Invalid course type. Must be Theory or Lab' },
          { status: 400 }
        );
      }
      updateData.courseType = courseType;
    }
    
    // Only update showFinalGrade if provided
    if (showFinalGrade !== undefined) {
      updateData.showFinalGrade = showFinalGrade;
    }

    // Update aggregation settings if provided
    if (quizAggregation !== undefined) {
      if (!['average', 'best'].includes(quizAggregation)) {
        return NextResponse.json(
          { error: 'Invalid quiz aggregation method. Must be average or best' },
          { status: 400 }
        );
      }
      updateData.quizAggregation = quizAggregation;
    }

    if (assignmentAggregation !== undefined) {
      if (!['average', 'best'].includes(assignmentAggregation)) {
        return NextResponse.json(
          { error: 'Invalid assignment aggregation method. Must be average or best' },
          { status: 400 }
        );
      }
      updateData.assignmentAggregation = assignmentAggregation;
    }

    if (quizWeightage !== undefined) {
      updateData.quizWeightage = quizWeightage;
    }

    if (assignmentWeightage !== undefined) {
      updateData.assignmentWeightage = assignmentWeightage;
    }

    if (projectWeightage !== undefined) {
      updateData.projectWeightage = projectWeightage;
    }

    if (classTime !== undefined) {
      updateData.classTime = classTime;
    }

    if (classRoom !== undefined) {
      updateData.classRoom = classRoom;
    }

    if (numberOfStudents !== undefined) {
      updateData.numberOfStudents = numberOfStudents;
    }

    if (classRepresentativeId !== undefined) {
      updateData.classRepresentativeId = classRepresentativeId;
    }

    if (aliasEnabled !== undefined) {
      if (aliasEnabled && !String(alternateCode || '').trim()) {
        return NextResponse.json(
          { error: 'Please provide an alternate course code' },
          { status: 400 }
        );
      }
      updateData.aliasEnabled = Boolean(aliasEnabled);
      updateData.alternateCode = aliasEnabled ? String(alternateCode).trim() : '';
    } else if (alternateCode !== undefined) {
      updateData.alternateCode = String(alternateCode).trim();
    }

    const course = await Course.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    return NextResponse.json({ course }, { status: 200 });
  } catch (error: any) {
    console.error('Update course error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE a course
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

    const course = await Course.findOneAndDelete({
      _id: id,
      userId: session.user.id,
    });

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    // Delete all related data (students, exams, marks, attendance, project & capstone data)
    await cascadeDeleteCourseData(id);

    return NextResponse.json(
      { message: 'Course and all related data deleted successfully' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Delete course error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
