import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Student from '@/models/Student';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import { verifyAdminToken } from '@/lib/adminAuth';
import { calculateLetterGrade } from '@/app/utils/grading';

// Read-only rollup of a teacher's course: students, exams, and each student's marks +
// computed final grade, for the admin dashboard's course drill-down. Mirrors the
// aggregation logic in app/api/courses/[id]/export/route.ts's CSV branch (kept separate
// since that route is scoped to the course-owning teacher's own session, not admin).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; courseId: string }> }
) {
  try {
    const ok = await verifyAdminToken(request);
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { id: userId, courseId } = await params;

    await dbConnect();

    const course = await Course.findOne({ _id: courseId, userId }).lean();
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const [students, exams, marks] = await Promise.all([
      Student.find({ courseId })
        .sort({ studentId: 1, _id: 1 })
        .collation({ locale: 'en', numericOrdering: true })
        .lean(),
      Exam.find({ courseId }).lean(),
      Mark.find({ courseId }).lean(),
    ]);

    const getExamPercentage = (rawMark: number, totalMarks: number) => {
      if (!totalMarks || totalMarks <= 0) return 0;
      return (rawMark / totalMarks) * 100;
    };

    const getAggregatedMark = (
      studentId: string,
      category: 'Quiz' | 'Assignment' | 'Project',
      aggregationMode?: 'average' | 'best' | 'sum'
    ): { rawMark: number; totalMarks: number } | null => {
      const categoryExams = exams.filter((e: any) => e.examCategory === category);
      if (categoryExams.length === 0) return null;

      const categoryMarks = marks.filter((m: any) =>
        m.studentId.toString() === studentId &&
        categoryExams.some((e: any) => e._id.toString() === m.examId.toString())
      );
      if (categoryMarks.length === 0) return null;

      const categoryWeightage = category === 'Quiz'
        ? Number((course as any).quizWeightage || 0)
        : category === 'Assignment'
          ? Number((course as any).assignmentWeightage || 0)
          : Number((course as any).projectWeightage || 0);

      if (category === 'Project') {
        const sumRaw = categoryMarks.reduce((s: number, m: any) => s + m.rawMark, 0);
        const sumTotal = categoryExams.reduce((s: number, e: any) => s + e.totalMarks, 0);
        const weighted = sumTotal > 0 ? (sumRaw / sumTotal) * categoryWeightage : 0;
        return { rawMark: Math.round(weighted * 100) / 100, totalMarks: categoryWeightage };
      }

      if (aggregationMode === 'best') {
        let bestMark = categoryMarks[0];
        let bestValue = -1;
        categoryMarks.forEach((mark: any) => {
          const exam = categoryExams.find((e: any) => e._id.toString() === mark.examId.toString());
          if (exam) {
            const percentage = getExamPercentage(mark.rawMark, exam.totalMarks);
            if (percentage > bestValue) {
              bestValue = percentage;
              bestMark = mark;
            }
          }
        });
        const bestExam = categoryExams.find((e: any) => e._id.toString() === bestMark.examId.toString());
        const weightedMark = bestExam
          ? (getExamPercentage(bestMark.rawMark, bestExam.totalMarks) * categoryWeightage) / 100
          : 0;
        return { rawMark: weightedMark, totalMarks: categoryWeightage };
      }

      if (aggregationMode === 'sum') {
        const sumRaw = categoryMarks.reduce((sum: number, mark: any) => sum + mark.rawMark, 0);
        const sumTotal = categoryMarks.reduce((sum: number, mark: any) => {
          const exam = categoryExams.find((e: any) => e._id.toString() === mark.examId.toString());
          return exam ? sum + exam.totalMarks : sum;
        }, 0);
        const weightedSum = sumTotal > 0 ? (getExamPercentage(sumRaw, sumTotal) * categoryWeightage) / 100 : 0;
        return { rawMark: weightedSum, totalMarks: categoryWeightage };
      }

      const averagePercentage = categoryMarks.reduce((sum: number, mark: any) => {
        const exam = categoryExams.find((e: any) => e._id.toString() === mark.examId.toString());
        if (!exam) return sum;
        return sum + getExamPercentage(mark.rawMark, exam.totalMarks);
      }, 0) / categoryMarks.length;
      const weightedAverage = (averagePercentage * categoryWeightage) / 100;
      return { rawMark: weightedAverage, totalMarks: categoryWeightage };
    };

    const calculateFinalGrade = (studentId: string): number => {
      let total = 0;

      exams.forEach((exam: any) => {
        if (['Quiz', 'Assignment', 'Project'].includes(exam.examCategory)) return;
        const mark = marks.find((m: any) =>
          m.studentId.toString() === studentId && m.examId.toString() === exam._id.toString()
        );
        if (mark) {
          total += mark.weightedMark !== undefined && mark.weightedMark !== null
            ? mark.weightedMark
            : (mark.rawMark / exam.totalMarks) * exam.weightage;
        }
      });

      if (exams.some((e: any) => e.examCategory === 'Quiz') && (course as any).quizWeightage) {
        const agg = getAggregatedMark(studentId, 'Quiz', (course as any).quizAggregation);
        if (agg) total += agg.rawMark;
      }
      if (exams.some((e: any) => e.examCategory === 'Assignment') && (course as any).assignmentWeightage) {
        const agg = getAggregatedMark(studentId, 'Assignment', (course as any).assignmentAggregation);
        if (agg) total += agg.rawMark;
      }
      if (exams.some((e: any) => e.examCategory === 'Project') && (course as any).projectWeightage) {
        const agg = getAggregatedMark(studentId, 'Project');
        if (agg) total += agg.rawMark;
      }

      return total;
    };

    const individualExams = exams.filter((e: any) => !['Quiz', 'Assignment', 'Project'].includes(e.examCategory));
    const hasQuizzes = exams.some((e: any) => e.examCategory === 'Quiz');
    const hasAssignments = exams.some((e: any) => e.examCategory === 'Assignment');
    const hasProjects = exams.some((e: any) => e.examCategory === 'Project');

    const studentRows = students.map((student: any) => {
      const studentId = student._id.toString();

      const examMarks = individualExams.map((exam: any) => {
        const mark = marks.find((m: any) =>
          m.studentId.toString() === studentId && m.examId.toString() === exam._id.toString()
        );
        return {
          examId: exam._id.toString(),
          rawMark: mark ? mark.rawMark : null,
        };
      });

      const quizAgg = hasQuizzes && (course as any).quizWeightage ? getAggregatedMark(studentId, 'Quiz', (course as any).quizAggregation) : null;
      const assignmentAgg = hasAssignments && (course as any).assignmentWeightage ? getAggregatedMark(studentId, 'Assignment', (course as any).assignmentAggregation) : null;
      const projectAgg = hasProjects && (course as any).projectWeightage ? getAggregatedMark(studentId, 'Project') : null;

      const isWithdrawn = !!student.withdrawn;
      const finalMarks = isWithdrawn ? null : calculateFinalGrade(studentId);
      const letterGrade = isWithdrawn
        ? { letter: 'W', modifier: '0', display: 'Withdrawn' }
        : calculateLetterGrade(finalMarks as number, (course as any).gradingScale);

      return {
        _id: studentId,
        studentId: student.studentId,
        name: student.name,
        withdrawn: isWithdrawn,
        probation: !!student.probation,
        examMarks,
        quizAggregated: quizAgg ? Math.round(quizAgg.rawMark * 100) / 100 : null,
        assignmentAggregated: assignmentAgg ? Math.round(assignmentAgg.rawMark * 100) / 100 : null,
        projectAggregated: projectAgg ? Math.round(projectAgg.rawMark * 100) / 100 : null,
        finalMarks: finalMarks !== null ? Math.round(finalMarks * 100) / 100 : null,
        letterGrade: letterGrade.display,
        letter: letterGrade.letter,
        modifier: letterGrade.modifier,
      };
    });

    return NextResponse.json({
      course: {
        name: (course as any).name,
        code: (course as any).code,
        semester: (course as any).semester,
        year: (course as any).year,
        section: (course as any).section,
        courseType: (course as any).courseType,
        showFinalGrade: (course as any).showFinalGrade,
        quizWeightage: (course as any).quizWeightage,
        assignmentWeightage: (course as any).assignmentWeightage,
        projectWeightage: (course as any).projectWeightage,
      },
      exams: individualExams.map((e: any) => ({
        _id: e._id.toString(),
        displayName: e.displayName,
        examType: e.examType,
        totalMarks: e.totalMarks,
        weightage: e.weightage,
      })),
      hasQuizzes,
      hasAssignments,
      hasProjects,
      students: studentRows,
    });
  } catch (error) {
    console.error('Get admin course details error:', error);
    return NextResponse.json({ error: 'Failed to load course details' }, { status: 500 });
  }
}
