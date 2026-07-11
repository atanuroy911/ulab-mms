import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Student from '@/models/Student';
import Mark from '@/models/Mark';
import Exam from '@/models/Exam';
import Course from '@/models/Course';

// GET student marks by student ID
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');

    if (!studentId) {
      return NextResponse.json(
        { error: 'Student ID is required' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Find all student records with this student ID across all courses
    const studentRecords = await Student.find({ 
      studentId: { $regex: new RegExp(`^${studentId}$`, 'i') } 
    }).populate('courseId');

    if (!studentRecords || studentRecords.length === 0) {
      return NextResponse.json(
        { error: 'Student ID not found in any course' },
        { status: 404 }
      );
    }

    // Get all courses for this student
    const coursesData = await Promise.all(
      studentRecords.map(async (studentRecord) => {
        const course = await Course.findById(studentRecord.courseId);
        
        if (!course) return null;

        // Get all exams for this course
        const exams = await Exam.find({ 
          courseId: course._id 
        }).sort({ createdAt: 1 });

        // Get all marks for this student in this course
        const marks = await Mark.find({
          studentId: studentRecord._id,
          courseId: course._id,
        });

        // Get class statistics for performance comparison
        const allStudentsInCourse = await Student.find({ courseId: course._id });
        const classStats = await Promise.all(
          exams.map(async (exam) => {
            const examMarks = await Mark.find({ 
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              examId: (exam as any)._id,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              courseId: (course as any)._id 
            });
            
            if (examMarks.length === 0) {
              return {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                examId: (exam as any)._id.toString(),
                average: 0,
                highest: 0,
                lowest: 0,
                count: 0
              };
            }

            const markValues = examMarks.map(m => m.rawMark);

            return {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              examId: (exam as any)._id.toString(),
              average: markValues.reduce((a, b) => a + b, 0) / markValues.length,
              highest: Math.max(...markValues),
              lowest: Math.min(...markValues),
              count: markValues.length
            };
          })
        );

        return {
          student: {
            _id: studentRecord._id,
            studentId: studentRecord.studentId,
            name: studentRecord.name,
          },
          course: {
            _id: course._id,
            name: course.name,
            code: course.code,
            semester: course.semester,
            year: course.year,
            courseType: course.courseType,
            isArchived: course.isArchived,
            showFinalGrade: course.showFinalGrade,
            quizAggregation: course.quizAggregation,
            quizWeightage: course.quizWeightage,
            assignmentAggregation: course.assignmentAggregation,
            assignmentWeightage: course.assignmentWeightage,
            gradingScale: course.gradingScale,
          },
          exams: exams.map(exam => ({
            _id: exam._id,
            displayName: exam.displayName,
            totalMarks: exam.totalMarks,
            weightage: exam.weightage,
            examType: exam.examType,
            examCategory: exam.examCategory,
            numberOfCOs: exam.numberOfCOs,
            numberOfQuestions: exam.numberOfQuestions,
          })),
          marks: marks.map(mark => ({
            _id: mark._id,
            examId: mark.examId,
            rawMark: mark.rawMark,
            coMarks: mark.coMarks,
            questionMarks: mark.questionMarks,
            weightedMark: mark.weightedMark,
          })),
          classStats,
        };
      })
    );

    // Filter out null values
    const validCoursesData = coursesData.filter(data => data !== null);

    if (validCoursesData.length === 0) {
      return NextResponse.json(
        { error: 'No course data found for this student' },
        { status: 404 }
      );
    }

    return NextResponse.json({ 
      studentId,
      studentName: validCoursesData[0]?.student.name,
      courses: validCoursesData 
    }, { status: 200 });

  } catch (error: any) {
    console.error('Get student marks error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
