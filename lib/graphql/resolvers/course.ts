import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Exam from '@/models/Exam';
import Student from '@/models/Student';
import { requireAuth, type GraphQLContext } from '../auth';
import type { Loaders } from '../dataloaders';
import { escapeRegExp } from '@/lib/utils';

interface CourseArgs {
  id: string;
}

interface StudentCoursesArgs {
  studentId: string;
}

interface CreateCourseArgs {
  input: {
    name: string;
    code: string;
    semester: string;
    year: number;
    section: string;
    courseType: 'Theory' | 'Lab';
    classTime?: string;
    classRoom?: string;
  };
}

export const courseResolvers = {
  Query: {
    myCourses: async (_: any, __: any, context: GraphQLContext & { loaders: Loaders }) => {
      const user = requireAuth(context);
      await dbConnect();

      const courses = await Course.find({
        userId: user.userId,
        isArchived: false
      }).sort({ createdAt: -1 });

      return courses.map(course => ({
        id: course._id.toString(),
        name: course.name,
        code: course.code,
        semester: course.semester,
        year: course.year,
        section: course.section,
        courseType: course.courseType,
        classTime: course.classTime,
        classRoom: course.classRoom,
        numberOfStudents: course.numberOfStudents,
        isArchived: course.isArchived || false,
      }));
    },

    instructorCourses: async (_: any, __: any, context: GraphQLContext & { loaders: Loaders }) => {
      const user = requireAuth(context);
      await dbConnect();

      const courses = await Course.find({
        userId: user.userId,
        isArchived: false
      }).sort({ createdAt: -1 });

      return courses.map(course => ({
        id: course._id.toString(),
        name: course.name,
        code: course.code,
        semester: course.semester,
        year: course.year,
        section: course.section,
        courseType: course.courseType,
        classTime: course.classTime,
        classRoom: course.classRoom,
        numberOfStudents: course.numberOfStudents,
        isArchived: course.isArchived || false,
      }));
    },

    course: async (_: any, { id }: CourseArgs, context: GraphQLContext & { loaders: Loaders }) => {
      requireAuth(context);

      const course = await context.loaders.courseLoader.load(id);

      if (!course) {
        throw new Error('Course not found');
      }

      return {
        id: course._id.toString(),
        name: course.name,
        code: course.code,
        semester: course.semester,
        year: course.year,
        section: course.section,
        courseType: course.courseType,
        classTime: course.classTime,
        classRoom: course.classRoom,
        numberOfStudents: course.numberOfStudents,
        isArchived: course.isArchived || false,
      };
    },

    studentCourses: async (_: any, { studentId }: StudentCoursesArgs, context: GraphQLContext) => {
      requireAuth(context);
      await dbConnect();

      const studentRecords = await Student.find({
        studentId: { $regex: new RegExp(`^${escapeRegExp(studentId)}$`, 'i') },
      });

      if (studentRecords.length === 0) {
        return [];
      }

      const courseIds = studentRecords.map(record => record.courseId);
      const courses = await Course.find({ _id: { $in: courseIds } }).sort({ createdAt: -1 });

      return courses.map(course => ({
        id: course._id.toString(),
        name: course.name,
        code: course.code,
        semester: course.semester,
        year: course.year,
        section: course.section,
        courseType: course.courseType,
        classTime: course.classTime,
        classRoom: course.classRoom,
        numberOfStudents: course.numberOfStudents,
        isArchived: course.isArchived || false,
      }));
    },

    courseDetails: async (_: any, { courseId }: { courseId: string }, context: GraphQLContext & { loaders: Loaders }) => {
      requireAuth(context);

      const course = await context.loaders.courseLoader.load(courseId);

      if (!course) {
        return null;
      }

      return {
        id: course._id.toString(),
        name: course.name,
        code: course.code,
        semester: course.semester,
        year: course.year,
        section: course.section,
        courseType: course.courseType,
        classTime: course.classTime,
        classRoom: course.classRoom,
        numberOfStudents: course.numberOfStudents,
        isArchived: course.isArchived || false,
      };
    },
  },

  Mutation: {
    createCourse: async (_: any, { input }: CreateCourseArgs, context: GraphQLContext) => {
      const user = requireAuth(context);
      await dbConnect();

      const course = await Course.create({
        ...input,
        userId: user.userId,
        isArchived: false,
      });

      const courseType = input.courseType || 'Theory';

      if (courseType === 'Theory') {
        await Exam.insertMany([
          { courseId: course._id, userId: user.userId, displayName: 'Quiz 1', totalMarks: 5, weightage: 5, examType: 'custom', examCategory: 'Quiz', isRequired: false },
          { courseId: course._id, userId: user.userId, displayName: 'Quiz 2', totalMarks: 5, weightage: 5, examType: 'custom', examCategory: 'Quiz', isRequired: false },
          { courseId: course._id, userId: user.userId, displayName: 'Quiz 3', totalMarks: 5, weightage: 5, examType: 'custom', examCategory: 'Quiz', isRequired: false },
          { courseId: course._id, userId: user.userId, displayName: 'Quiz 4', totalMarks: 5, weightage: 5, examType: 'custom', examCategory: 'Quiz', isRequired: false },
          { courseId: course._id, userId: user.userId, displayName: 'Assignment 1', totalMarks: 10, weightage: 10, examType: 'custom', examCategory: 'Assignment', isRequired: false },
          { courseId: course._id, userId: user.userId, displayName: 'Assignment 2', totalMarks: 10, weightage: 10, examType: 'custom', examCategory: 'Assignment', isRequired: false },
          { courseId: course._id, userId: user.userId, displayName: 'Midterm', totalMarks: 30, weightage: 30, examType: 'midterm', examCategory: 'MainExam', isRequired: true },
          { courseId: course._id, userId: user.userId, displayName: 'Final', totalMarks: 30, weightage: 30, examType: 'final', examCategory: 'MainExam', isRequired: true },
        ]);
      } else {
        await Exam.insertMany([
          { courseId: course._id, userId: user.userId, displayName: 'Lab 1', totalMarks: 10, weightage: 10, examType: 'custom', examCategory: 'Assignment', isRequired: false },
          { courseId: course._id, userId: user.userId, displayName: 'Lab 2', totalMarks: 10, weightage: 10, examType: 'custom', examCategory: 'Assignment', isRequired: false },
          { courseId: course._id, userId: user.userId, displayName: 'Lab 3', totalMarks: 10, weightage: 10, examType: 'custom', examCategory: 'Assignment', isRequired: false },
          { courseId: course._id, userId: user.userId, displayName: 'Lab 4', totalMarks: 10, weightage: 10, examType: 'custom', examCategory: 'Assignment', isRequired: false },
          { courseId: course._id, userId: user.userId, displayName: 'Lab 5', totalMarks: 10, weightage: 10, examType: 'custom', examCategory: 'Assignment', isRequired: false },
          { courseId: course._id, userId: user.userId, displayName: 'Midterm', totalMarks: 25, weightage: 25, examType: 'midterm', examCategory: 'MainExam', isRequired: true },
          { courseId: course._id, userId: user.userId, displayName: 'Final', totalMarks: 25, weightage: 25, examType: 'final', examCategory: 'MainExam', isRequired: true },
        ]);
      }

      return {
        id: course._id.toString(),
        name: course.name,
        code: course.code,
        semester: course.semester,
        year: course.year,
        section: course.section,
        courseType: course.courseType,
        classTime: course.classTime,
        classRoom: course.classRoom,
        numberOfStudents: course.numberOfStudents,
        isArchived: course.isArchived || false,
      };
    },
  },

  Course: {
    instructor: async (parent: any, _: any, context: GraphQLContext & { loaders: Loaders }) => {
      const course = await context.loaders.courseLoader.load(parent.id);
      if (!course || !course.userId) return null;

      const user = await context.loaders.userLoader.load(course.userId.toString());
      if (!user) return null;

      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role || 'user',
      };
    },

    exams: async (parent: any, _: any, context: GraphQLContext & { loaders: Loaders }) => {
      const exams = await context.loaders.examsByCourseLoader.load(parent.id);

      return exams.map((exam: any) => ({
        id: exam._id.toString(),
        courseId: exam.courseId.toString(),
        name: exam.displayName,
        maxMarks: exam.totalMarks,
        weight: exam.weightage,
      }));
    },
  },
};
