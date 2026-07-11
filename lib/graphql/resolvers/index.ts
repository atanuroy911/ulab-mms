import { userResolvers } from './user';
import { courseResolvers } from './course';
import { markResolvers } from './mark';
import { attendanceResolvers } from './attendance';
import { capstoneResolvers } from './capstone';

export const resolvers = {
  Query: {
    ...userResolvers.Query,
    ...courseResolvers.Query,
    ...markResolvers.Query,
    ...attendanceResolvers.Query,
    ...capstoneResolvers.Query,
  },
  Mutation: {
    ...userResolvers.Mutation,
    ...courseResolvers.Mutation,
    ...markResolvers.Mutation,
    ...attendanceResolvers.Mutation,
  },
  Course: courseResolvers.Course,
  AttendanceSession: attendanceResolvers.AttendanceSession,
  CapstoneGroup: capstoneResolvers.CapstoneGroup,
};
