import dbConnect from '@/lib/mongodb';
import Mark from '@/models/Mark';
import Exam from '@/models/Exam';
import Course from '@/models/Course';
import { requireAuth, type GraphQLContext } from '../auth';
import type { Loaders } from '../dataloaders';

interface MyMarksArgs {
  courseId: string;
}

interface UpdateMarkArgs {
  studentId: string;
  examId: string;
  mark: number;
}

interface BulkUpdateMarksArgs {
  courseId: string;
  marks: Array<{
    studentId: string;
    studentName: string;
    examId: string;
    mark: number;
  }>;
}

interface CourseStudentsArgs {
  courseId: string;
}

export const markResolvers = {
  Query: {
    myMarks: async (_: any, { courseId }: MyMarksArgs, context: GraphQLContext & { loaders: Loaders }) => {
      const user = requireAuth(context);
      await dbConnect();

      const marks = await Mark.find({
        courseId,
        studentId: user.userId,
      }).populate('examId');

      const exams = await context.loaders.examsByCourseLoader.load(courseId);

      return exams.map((exam: any) => {
        const mark = marks.find(m => m.examId.toString() === exam._id.toString());
        const markValue = mark?.rawMark ?? null;
        const percentage = markValue !== null ? (markValue / exam.totalMarks) * 100 : null;

        return {
          examId: exam._id.toString(),
          examName: exam.displayName,
          mark: markValue,
          maxMark: exam.totalMarks,
          percentage: percentage !== null ? Math.round(percentage * 100) / 100 : null,
        };
      });
    },

    courseStudents: async (_: any, { courseId }: CourseStudentsArgs, context: GraphQLContext & { loaders: Loaders }) => {
      const user = requireAuth(context);
      await dbConnect();

      const course = await Course.findOne({
        _id: courseId,
        userId: user.userId,
      });

      if (!course) {
        throw new Error('Course not found or access denied');
      }

      const marks = await Mark.find({ courseId });
      const exams = await context.loaders.examsByCourseLoader.load(courseId);

      const studentMap = new Map<string, any>();

      marks.forEach((mark: any) => {
        const studentIdStr = mark.studentId.toString();
        if (!studentMap.has(studentIdStr)) {
          studentMap.set(studentIdStr, {
            studentId: studentIdStr,
            studentName: studentIdStr,
            marks: [],
            totalMarks: 0,
            totalMaxMarks: 0,
          });
        }

        const student = studentMap.get(studentIdStr);
        const exam = exams.find((e: any) => e._id.toString() === mark.examId.toString());

        if (exam) {
          const markValue = mark.rawMark ?? 0;
          student.marks.push({
            examId: mark.examId.toString(),
            examName: exam.displayName,
            mark: mark.rawMark,
            maxMark: exam.totalMarks,
            percentage: mark.rawMark !== null && mark.rawMark !== undefined
              ? Math.round((mark.rawMark / exam.totalMarks) * 10000) / 100
              : null,
          });
          if (mark.rawMark !== null && mark.rawMark !== undefined) {
            student.totalMarks += markValue;
          }
          student.totalMaxMarks += exam.totalMarks;
        }
      });

      const students = Array.from(studentMap.values());

      students.forEach(student => {
        student.percentage = student.totalMaxMarks > 0
          ? Math.round((student.totalMarks / student.totalMaxMarks) * 10000) / 100
          : 0;
      });

      return students;
    },
  },

  Mutation: {
    updateMark: async (_: any, { studentId, examId, mark }: UpdateMarkArgs, context: GraphQLContext) => {
      const user = requireAuth(context);
      await dbConnect();

      const exam = await Exam.findById(examId);
      if (!exam) {
        throw new Error('Exam not found');
      }

      const course = await Course.findOne({
        _id: exam.courseId,
        userId: user.userId,
      });

      if (!course) {
        throw new Error('Course not found or access denied');
      }

      if (mark < 0 || mark > exam.totalMarks) {
        throw new Error(`Mark must be between 0 and ${exam.totalMarks}`);
      }

      const existingMark = await Mark.findOne({
        studentId,
        examId,
        courseId: exam.courseId,
      });

      let updatedMark;

      if (existingMark) {
        existingMark.rawMark = mark;
        updatedMark = await existingMark.save();
      } else {
        updatedMark = await Mark.create({
          studentId,
          examId,
          courseId: exam.courseId,
          userId: user.userId,
          rawMark: mark,
        });
      }

      return {
        id: updatedMark._id.toString(),
        studentId: updatedMark.studentId.toString(),
        studentName: studentId,
        courseId: updatedMark.courseId.toString(),
        examId: updatedMark.examId.toString(),
        mark: updatedMark.rawMark,
        status: 'saved',
      };
    },

    bulkUpdateMarks: async (_: any, { courseId, marks }: BulkUpdateMarksArgs, context: GraphQLContext) => {
      const user = requireAuth(context);
      await dbConnect();

      const course = await Course.findOne({
        _id: courseId,
        userId: user.userId,
      });

      if (!course) {
        throw new Error('Course not found or access denied');
      }

      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const markData of marks) {
        try {
          const exam = await Exam.findById(markData.examId);
          if (!exam) {
            errors.push(`Exam not found: ${markData.examId}`);
            failed++;
            continue;
          }

          if (markData.mark < 0 || markData.mark > exam.totalMarks) {
            errors.push(`Invalid mark for ${markData.studentName}: must be between 0 and ${exam.totalMarks}`);
            failed++;
            continue;
          }

          const existingMark = await Mark.findOne({
            studentId: markData.studentId,
            examId: markData.examId,
            courseId,
          });

          if (existingMark) {
            existingMark.rawMark = markData.mark;
            await existingMark.save();
          } else {
            await Mark.create({
              studentId: markData.studentId,
              examId: markData.examId,
              courseId,
              userId: user.userId,
              rawMark: markData.mark,
            });
          }

          updated++;
        } catch (error: any) {
          errors.push(`Failed to update mark for ${markData.studentName}: ${error.message}`);
          failed++;
        }
      }

      return {
        success: failed === 0,
        updated,
        failed,
        errors,
      };
    },
  },
};
