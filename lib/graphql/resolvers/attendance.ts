import dbConnect from '@/lib/mongodb';
import AttendanceSession from '@/models/AttendanceSession';
import Course from '@/models/Course';
import mongoose from 'mongoose';
import { requireAuth, type GraphQLContext } from '../auth';
import type { Loaders } from '../dataloaders';

interface AttendanceSessionsArgs {
  courseId: string;
}

interface AttendanceSessionArgs {
  sessionCode: string;
}

interface CreateAttendanceSessionArgs {
  input: {
    courseId: string;
    date: string;
  };
}

interface CheckInArgs {
  sessionCode: string;
}

interface CloseAttendanceSessionArgs {
  sessionId: string;
}

function generateSessionCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const attendanceResolvers = {
  Query: {
    attendanceSessions: async (_: any, { courseId }: AttendanceSessionsArgs, context: GraphQLContext & { loaders: Loaders }) => {
      const user = requireAuth(context);
      await dbConnect();

      const course = await Course.findOne({
        _id: courseId,
        userId: user.userId,
      });

      if (!course) {
        throw new Error('Course not found or access denied');
      }

      const sessions = await AttendanceSession.find({ courseId }).sort({ date: -1 });

      return sessions.map(session => ({
        id: session._id.toString(),
        courseId: session.courseId.toString(),
        sessionCode: session.sessionCode,
        date: session.date.toISOString(),
        open: session.open,
        records: session.records || [],
      }));
    },

    attendanceSession: async (_: any, { sessionCode }: AttendanceSessionArgs, context: GraphQLContext & { loaders: Loaders }) => {
      requireAuth(context);
      await dbConnect();

      const session = await AttendanceSession.findOne({ sessionCode });

      if (!session) {
        throw new Error('Session not found');
      }

      return {
        id: session._id.toString(),
        courseId: session.courseId.toString(),
        sessionCode: session.sessionCode,
        date: session.date.toISOString(),
        open: session.open,
        records: session.records || [],
      };
    },
  },

  Mutation: {
    createAttendanceSession: async (_: any, { input }: CreateAttendanceSessionArgs, context: GraphQLContext) => {
      const user = requireAuth(context);
      await dbConnect();

      const course = await Course.findOne({
        _id: input.courseId,
        userId: user.userId,
      });

      if (!course) {
        throw new Error('Course not found or access denied');
      }

      const sessionCode = generateSessionCode();

      const session = await AttendanceSession.create({
        courseId: input.courseId,
        sessionCode,
        startedBy: user.userId,
        date: new Date(input.date),
        open: true,
        records: [],
      });

      return {
        id: session._id.toString(),
        courseId: session.courseId.toString(),
        sessionCode: session.sessionCode,
        date: session.date.toISOString(),
        open: session.open,
        records: session.records || [],
      };
    },

    closeAttendanceSession: async (_: any, { sessionId }: CloseAttendanceSessionArgs, context: GraphQLContext) => {
      const user = requireAuth(context);
      await dbConnect();

      const session = await AttendanceSession.findById(sessionId);

      if (!session) {
        throw new Error('Session not found');
      }

      const course = await Course.findOne({
        _id: session.courseId,
        userId: user.userId,
      });

      if (!course) {
        throw new Error('Access denied');
      }

      session.open = false;
      await session.save();

      return {
        id: session._id.toString(),
        courseId: session.courseId.toString(),
        sessionCode: session.sessionCode,
        date: session.date.toISOString(),
        open: session.open,
        records: session.records || [],
      };
    },

    checkIn: async (_: any, { sessionCode }: CheckInArgs, context: GraphQLContext) => {
      const user = requireAuth(context);
      await dbConnect();

      const session = await AttendanceSession.findOne({ sessionCode });

      if (!session) {
        return {
          success: false,
          message: 'Invalid session code',
          session: null,
        };
      }

      if (!session.open) {
        return {
          success: false,
          message: 'This session has been closed',
          session: null,
        };
      }

      const studentId = user.userId;

      const alreadyCheckedIn = session.records.some(
        (record: any) => record.studentIdString === studentId
      );

      if (alreadyCheckedIn) {
        return {
          success: false,
          message: 'You have already checked in to this session',
          session: {
            id: session._id.toString(),
            courseId: session.courseId.toString(),
            sessionCode: session.sessionCode,
            date: session.date.toISOString(),
            open: session.open,
            records: session.records,
          },
        };
      }

      session.records.push({
        studentId: new mongoose.Types.ObjectId(studentId),
        studentIdString: studentId,
        status: 'present',
        recordedAt: new Date(),
        markedBy: 'manual',
      } as any);

      await session.save();

      return {
        success: true,
        message: 'Successfully checked in',
        session: {
          id: session._id.toString(),
          courseId: session.courseId.toString(),
          sessionCode: session.sessionCode,
          date: session.date.toISOString(),
          open: session.open,
          records: session.records,
        },
      };
    },
  },

  AttendanceSession: {
    course: async (parent: any, _: any, context: GraphQLContext & { loaders: Loaders }) => {
      const course = await context.loaders.courseLoader.load(parent.courseId);

      if (!course) return null;

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
};
