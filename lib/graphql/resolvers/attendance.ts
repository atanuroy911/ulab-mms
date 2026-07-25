import dbConnect from '@/lib/mongodb';
import AttendanceSession from '@/models/AttendanceSession';
import Course from '@/models/Course';
import Student from '@/models/Student';
import User from '@/models/User';
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

interface MyAttendanceStatsArgs {
  courseId: string;
}

interface StudentAttendanceStatsArgs {
  courseId: string;
  studentId: string;
}

function generateSessionCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// A Student document's userId is the course-owning *teacher's* User id, not the
// student's own account (see app/api/courses/[id]/students/route.ts), so there is
// no direct link from a logged-in student's User doc to their Student roster row.
// Mirror the same resolution the QR check-in flow uses (app/api/attendance/checkin/route.ts):
// parse the student ID out of a "Name (2021-1-60-123)"-style display name, falling
// back to a unique name match.
async function resolveStudentForUser(userId: string, courseId: string) {
  const user = await User.findById(userId);
  if (!user) return null;

  const displayName = (user.name || '').trim();
  const match = displayName.match(/\(([^)]+)\)/);
  const parsedId = match ? match[1].trim() : null;

  if (parsedId) {
    const candidate = await Student.findOne({ studentId: parsedId, courseId });
    if (candidate) return candidate;
  }

  if (!displayName) return null;

  const normalizedName = displayName.toLowerCase();
  const students = await Student.find({ courseId }).lean();
  const exactMatches = students.filter((item) => item.name.trim().toLowerCase() === normalizedName);
  const matches = exactMatches.length === 1
    ? exactMatches
    : students.filter((item) => {
        const studentName = item.name.trim().toLowerCase();
        return studentName.includes(normalizedName) || normalizedName.includes(studentName);
      });

  return matches.length === 1 ? matches[0] : null;
}

async function getAttendanceStats(courseId: string, studentObjectId: string, loaders: any) {
  const course = await loaders.courseLoader.load(courseId);

  if (!course) {
    throw new Error('Course not found');
  }

  const sessions = await AttendanceSession.find({ courseId }).sort({ date: 1 });

  // A session counts as "present" only if this student has a record marked
  // present -- an explicit 'absent' record must not count as attended just
  // because a record exists. Match by the Student document's ObjectId (same
  // as the teacher's attendance view and the student-facing REST endpoints),
  // not the denormalized studentIdString snapshot.
  const isPresent = (session: any) =>
    session.records.some((record: any) => String(record.studentId) === String(studentObjectId) && record.status === 'present');

  const totalSessions = sessions.length;
  const presentCount = sessions.filter(isPresent).length;
  const absentCount = totalSessions - presentCount;
  const percentage = totalSessions > 0 ? (presentCount / totalSessions) * 100 : 0;

  const sessionDetails = sessions.map(session => ({
    id: session._id.toString(),
    date: session.date.toISOString(),
    attended: isPresent(session),
  }));

  return {
    courseId: course._id.toString(),
    courseName: course.name,
    courseCode: course.code,
    totalSessions,
    attendedSessions: presentCount,
    absentSessions: absentCount,
    percentage: Math.round(percentage * 100) / 100,
    sessions: sessionDetails,
  };
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

    myAttendanceStats: async (_: any, { courseId }: MyAttendanceStatsArgs, context: GraphQLContext & { loaders: Loaders }) => {
      const user = requireAuth(context);
      await dbConnect();

      const student = await resolveStudentForUser(user.userId, courseId);
      if (!student) {
        throw new Error('Student not registered for this course');
      }

      return getAttendanceStats(courseId, student._id.toString(), context.loaders);
    },

    studentAttendanceStats: async (_: any, { courseId, studentId }: StudentAttendanceStatsArgs, context: GraphQLContext & { loaders: Loaders }) => {
      requireAuth(context);
      await dbConnect();

      const student = await Student.findOne({ studentId, courseId });
      if (!student) {
        throw new Error('Student not registered for this course');
      }

      return getAttendanceStats(courseId, student._id.toString(), context.loaders);
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

    checkIn: async (_: any, { sessionCode }: CheckInArgs, context: GraphQLContext & { loaders: Loaders }) => {
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

      const student = await resolveStudentForUser(user.userId, session.courseId.toString());
      if (!student) {
        return {
          success: false,
          message: 'Student not registered for this course',
          session: null,
        };
      }

      const alreadyCheckedIn = session.records.some(
        (record: any) => String(record.studentId) === String(student._id)
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
        studentId: student._id,
        studentIdString: student.studentId,
        status: 'present',
        recordedAt: new Date(),
        markedBy: 'manual',
      } as any);

      await session.save();

      const stats = await getAttendanceStats(
        session.courseId.toString(),
        student._id.toString(),
        context.loaders
      );

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
        stats,
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
