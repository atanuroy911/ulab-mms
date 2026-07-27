import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Student from '@/models/Student';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import AttendanceSession from '@/models/AttendanceSession';

// POST import and create a new course
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const importData = await request.json();

    // Validate import data
    if (!importData.version || !importData.course || !importData.students || !importData.exams) {
      return NextResponse.json(
        { error: 'Invalid import file format' },
        { status: 400 }
      );
    }

    await dbConnect();

    // 1. Create the course (coPoMapping.maxMarks is added after exams are created,
    // since it needs to be remapped from exam displayName to the new exam ids)
    const newCourse = await Course.create({
      name: importData.course.name,
      code: importData.course.code,
      semester: importData.course.semester,
      year: importData.course.year,
      // If section is not present in import, keep schema default
      ...(importData.course.section && { section: importData.course.section }),
      courseType: importData.course.courseType,
      showFinalGrade: importData.course.showFinalGrade,
      quizAggregation: importData.course.quizAggregation,
      quizWeightage: importData.course.quizWeightage,
      assignmentAggregation: importData.course.assignmentAggregation,
      assignmentWeightage: importData.course.assignmentWeightage,
      projectWeightage: importData.course.projectWeightage,
      // If gradingScale is not present in import, keep schema default
      ...(importData.course.gradingScale && { gradingScale: importData.course.gradingScale }),
      userId: session.user.id,
    });

    const courseId = newCourse._id;

    // 2. Import students
    const studentMap = new Map(); // Map old studentId to new _id
    for (const studentData of importData.students) {
      const student = await Student.create({
        studentId: studentData.studentId,
        name: studentData.name,
        probation: studentData.probation,
        withdrawn: studentData.withdrawn,
        useAlias: studentData.useAlias,
        courseId,
        userId: session.user.id,
      });
      studentMap.set(studentData.studentId, student._id);
    }

    // 3. Import exams
    const examMap = new Map(); // Map old exam displayName to new _id
    for (const examData of importData.exams) {
      const exam = await Exam.create({
        displayName: examData.displayName,
        examType: examData.examType,
        totalMarks: examData.totalMarks,
        weightage: examData.weightage,
        isRequired: examData.isRequired,
        examCategory: examData.examCategory,
        numberOfCOs: examData.numberOfCOs,
        numberOfQuestions: examData.numberOfQuestions,
        courseId,
        userId: session.user.id,
      });
      examMap.set(examData.displayName, {
        id: exam._id,
        totalMarks: exam.totalMarks,
        weightage: exam.weightage,
      });
    }

    // 3b. Remap coPoMapping.maxMarks from exam displayName -> new exam id
    if (importData.course.coPoMapping) {
      const remappedMaxMarks: Record<string, number[]> = {};
      const sourceMaxMarks = importData.course.coPoMapping.maxMarks || {};
      for (const [displayName, maxMarks] of Object.entries(sourceMaxMarks)) {
        const examInfo = examMap.get(displayName);
        if (examInfo) {
          remappedMaxMarks[examInfo.id.toString()] = maxMarks as number[];
        }
      }

      newCourse.coPoMapping = {
        mapping: importData.course.coPoMapping.mapping,
        maxMarks: remappedMaxMarks,
      };
      await newCourse.save();
    }

    // 4. Import marks
    for (const markData of importData.marks) {
      const studentId = studentMap.get(markData.studentId);
      const examInfo = examMap.get(markData.examDisplayName);

      if (studentId && examInfo) {
        const weightedMark =
          markData.weightedMark !== undefined && markData.weightedMark !== null
            ? markData.weightedMark
            : examInfo.totalMarks > 0
              ? Math.round(((markData.rawMark / examInfo.totalMarks) * examInfo.weightage) * 100) / 100
              : 0;

        await Mark.create({
          studentId,
          examId: examInfo.id,
          courseId,
          userId: session.user.id,
          rawMark: markData.rawMark,
          coMarks: markData.coMarks,
          nonCoMark: markData.nonCoMark,
          questionMarks: markData.questionMarks,
          weightedMark,
        });
      }
    }

    // 5. Import attendance sessions
    if (importData.attendanceSessions) {
      for (const sessionData of importData.attendanceSessions) {
        const attSession = await AttendanceSession.create({
          courseId,
          startedBy: session.user.id,
          date: sessionData.date,
          open: sessionData.open,
          qrEnabled: sessionData.qrEnabled,
        });

        const records = [];
        for (const record of sessionData.records) {
          const studentId = studentMap.get(record.studentId);
          if (studentId) {
            records.push({
              studentId,
              status: record.status,
              recordedAt: record.recordedAt,
              markedBy: record.markedBy,
              studentIdString: record.studentIdString,
            });
          }
        }

        attSession.records = records;
        await attSession.save();
      }
    }

    return NextResponse.json(
      { 
        message: 'Course imported successfully',
        course: newCourse,
        stats: {
          students: importData.students.length,
          exams: importData.exams.length,
          marks: importData.marks.length,
          attendanceSessions: importData.attendanceSessions ? importData.attendanceSessions.length : 0,
        }
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Import course error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
