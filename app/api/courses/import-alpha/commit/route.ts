import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Student from '@/models/Student';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import { cascadeDeleteCourseData } from '@/lib/courseCascadeDelete';

const calculateWeightedMark = (rawMark: number, totalMarks: number, weightage: number) => {
  if (totalMarks <= 0) return 0;
  return Math.round(((rawMark / totalMarks) * weightage) * 100) / 100;
};

interface CommitAssessment {
  label: string;
  include: boolean;
  category: 'Quiz' | 'Assignment' | 'Project' | 'Attendance' | 'MainExam' | 'ClassPerformance' | 'Others';
  examType: 'midterm' | 'final' | 'labFinal' | 'oel' | 'custom';
  totalMarks: number;
  weightage: number;
  rawMarksByStudentId: Record<string, number>;
  coGroupLabel: string | null;
}

interface CommitCoGroup {
  label: string;
  maxMarks: (number | null)[];
  marksByStudentId: Record<string, (number | null)[]>;
}

interface CommitPayload {
  courseCode: string;
  courseTitle: string;
  courseType: 'Theory' | 'Lab';
  semester: 'Spring' | 'Summer' | 'Fall';
  year: number;
  section: string;
  students: { studentId: string; name: string }[];
  assessments: CommitAssessment[];
  coGroups: CommitCoGroup[];
}

// POST - creates a new course (students, exams, marks, CO-PO max marks) from a teacher-reviewed
// "Import Course File (Alpha)" wizard payload. Step 2 (the only DB-writing step) of that flow -
// app/api/courses/import-alpha/parse/route.ts only ever previews, never writes.
export async function POST(request: NextRequest) {
  let createdCourseId: string | null = null;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = (await request.json()) as Partial<CommitPayload>;
    const { courseCode, courseTitle, courseType, semester, year, section, students, assessments, coGroups } = body;

    if (!courseCode?.trim() || !courseTitle?.trim()) {
      return NextResponse.json({ error: 'Course code and title are required' }, { status: 400 });
    }
    if (!['Theory', 'Lab'].includes(courseType || '')) {
      return NextResponse.json({ error: 'Course type must be Theory or Lab' }, { status: 400 });
    }
    if (!['Spring', 'Summer', 'Fall'].includes(semester || '')) {
      return NextResponse.json({ error: 'Semester must be Spring, Summer, or Fall' }, { status: 400 });
    }
    if (!year || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Please provide a valid year' }, { status: 400 });
    }
    if (!section?.trim()) {
      return NextResponse.json({ error: 'Section is required' }, { status: 400 });
    }
    if (!students || students.length === 0) {
      return NextResponse.json({ error: 'No students to import' }, { status: 400 });
    }

    const includedAssessments = (assessments || []).filter((a) => a.include);
    if (includedAssessments.length === 0) {
      return NextResponse.json({ error: 'No assessments selected to import' }, { status: 400 });
    }
    for (const a of includedAssessments) {
      if (!a.label?.trim() || !a.totalMarks || a.totalMarks <= 0 || a.weightage === undefined || a.weightage < 0) {
        return NextResponse.json({ error: `Assessment "${a.label || '(unnamed)'}" needs a valid total marks and weightage` }, { status: 400 });
      }
    }

    await dbConnect();

    const existing = await Course.findOne({ code: courseCode.trim(), semester, year, section: section.trim(), userId });
    if (existing) {
      return NextResponse.json(
        { error: `You already have a course with code "${courseCode.trim()}", ${semester} ${year}, section ${section.trim()}.` },
        { status: 409 }
      );
    }

    const course = await Course.create({
      name: courseTitle.trim(),
      code: courseCode.trim(),
      semester,
      year,
      section: section.trim(),
      courseType,
      projectWeightage: courseType === 'Lab' ? 40 : 25,
      userId,
    });
    createdCourseId = course._id.toString();

    // 1. Students
    const studentIdMap = new Map<string, string>(); // parsed studentId -> new Mongo _id
    const studentDocs = await Student.insertMany(
      students.map((s) => ({
        studentId: s.studentId,
        name: s.name,
        courseId: course._id,
        userId,
      }))
    );
    studentDocs.forEach((doc, i) => studentIdMap.set(students[i].studentId, doc._id.toString()));

    // 2. Exams + Marks + CO-PO max marks
    const coPoMaxMarks: Record<string, number[]> = {};
    let marksToCreate: any[] = [];

    for (const assessment of includedAssessments) {
      const coGroup = assessment.coGroupLabel ? coGroups?.find((g) => g.label === assessment.coGroupLabel) : null;
      // numberOfCOs = how many leading CO slots actually have a configured max mark.
      let numberOfCOs = 0;
      if (coGroup) {
        for (let i = 0; i < coGroup.maxMarks.length; i++) {
          if (coGroup.maxMarks[i] !== null && coGroup.maxMarks[i]! > 0) numberOfCOs = i + 1;
        }
      }

      const exam = await Exam.create({
        displayName: assessment.label.trim(),
        totalMarks: assessment.totalMarks,
        weightage: assessment.weightage,
        examType: assessment.examType,
        examCategory: assessment.category,
        numberOfCOs: numberOfCOs > 0 ? numberOfCOs : undefined,
        isRequired: false,
        courseId: course._id,
        userId,
      });

      if (coGroup && numberOfCOs > 0) {
        coPoMaxMarks[exam._id.toString()] = coGroup.maxMarks.slice(0, numberOfCOs).map((m) => m ?? 0);
      }

      for (const [parsedStudentId, rawMark] of Object.entries(assessment.rawMarksByStudentId)) {
        const studentMongoId = studentIdMap.get(parsedStudentId);
        if (!studentMongoId || rawMark === null || rawMark === undefined) continue;

        const weightedMark = calculateWeightedMark(rawMark, assessment.totalMarks, assessment.weightage);
        let coMarks: number[] | undefined;
        if (coGroup && numberOfCOs > 0) {
          const studentCo = coGroup.marksByStudentId[parsedStudentId];
          if (studentCo) {
            coMarks = studentCo.slice(0, numberOfCOs).map((m) => m ?? 0);
          }
        }

        marksToCreate.push({
          studentId: studentMongoId,
          examId: exam._id,
          courseId: course._id,
          userId,
          rawMark,
          weightedMark,
          coMarks,
        });
      }
    }

    if (marksToCreate.length > 0) {
      await Mark.insertMany(marksToCreate);
    }

    if (Object.keys(coPoMaxMarks).length > 0) {
      await Course.findByIdAndUpdate(course._id, {
        coPoMapping: {
          maxMarks: coPoMaxMarks,
          mapping: Array.from({ length: 6 }, () => Array(12).fill(false)),
        },
      });
    }

    return NextResponse.json(
      {
        courseId: course._id.toString(),
        stats: {
          students: studentDocs.length,
          exams: includedAssessments.length,
          marks: marksToCreate.length,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Import-alpha commit error:', error);
    if (createdCourseId) {
      try {
        await cascadeDeleteCourseData(createdCourseId);
        await Course.findByIdAndDelete(createdCourseId);
      } catch (cleanupError) {
        console.error('Import-alpha cleanup after failed commit also failed:', cleanupError);
      }
    }
    if (error?.code === 11000) {
      return NextResponse.json({ error: 'A course with this code/semester/year/section already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message || 'Import failed' }, { status: 500 });
  }
}
