import { userResolvers } from './user';
import { courseResolvers } from './course';
import { markResolvers } from './mark';
import { attendanceResolvers } from './attendance';

// Capstone resolvers were removed along with the old CapstoneGroup/CapstoneMarks models
// during the capstone rebuild - see lib/graphql/schema.ts.

export const resolvers = {
  Query: {
    ...userResolvers.Query,
    ...courseResolvers.Query,
    ...markResolvers.Query,
    ...attendanceResolvers.Query,
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...courseResolvers.Mutation,
    ...markResolvers.Mutation,
    ...attendanceResolvers.Mutation,
  },
  Course: courseResolvers.Course,
  AttendanceSession: attendanceResolvers.AttendanceSession,
};
