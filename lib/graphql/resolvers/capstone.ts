import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneMarks from '@/models/CapstoneMarks';
import { requireAuth, type GraphQLContext } from '../auth';
import type { Loaders } from '../dataloaders';

export const capstoneResolvers = {
  Query: {
    myCapstoneGroups: async (_: any, __: any, context: GraphQLContext & { loaders: Loaders }) => {
      const user = requireAuth(context);
      await dbConnect();

      const groups = await CapstoneGroup.find({
        studentIds: user.userId,
      });

      return groups.map(group => ({
        id: group._id.toString(),
        courseId: group.courseId.toString(),
        groupName: group.groupName,
        groupNumber: group.groupNumber,
        description: group.description,
        semester: group.semester,
        studentIds: group.studentIds.map(id => id.toString()),
        supervisorId: group.supervisorId.toString(),
        evaluatorAssignments: group.evaluatorAssignments.map(assignment => ({
          evaluatorId: assignment.evaluatorId.toString(),
          assignedAt: assignment.assignedAt.toISOString(),
          status: assignment.status,
        })),
      }));
    },

    capstoneGroupsBySupervisor: async (_: any, __: any, context: GraphQLContext & { loaders: Loaders }) => {
      const user = requireAuth(context);
      await dbConnect();

      const groups = await CapstoneGroup.find({
        supervisorId: user.userId,
      });

      return groups.map(group => ({
        id: group._id.toString(),
        courseId: group.courseId.toString(),
        groupName: group.groupName,
        groupNumber: group.groupNumber,
        description: group.description,
        semester: group.semester,
        studentIds: group.studentIds.map(id => id.toString()),
        supervisorId: group.supervisorId.toString(),
        evaluatorAssignments: group.evaluatorAssignments.map(assignment => ({
          evaluatorId: assignment.evaluatorId.toString(),
          assignedAt: assignment.assignedAt.toISOString(),
          status: assignment.status,
        })),
      }));
    },

    capstoneGroupsByEvaluator: async (_: any, __: any, context: GraphQLContext & { loaders: Loaders }) => {
      const user = requireAuth(context);
      await dbConnect();

      const groups = await CapstoneGroup.find({
        'evaluatorAssignments.evaluatorId': user.userId,
      });

      return groups.map(group => ({
        id: group._id.toString(),
        courseId: group.courseId.toString(),
        groupName: group.groupName,
        groupNumber: group.groupNumber,
        description: group.description,
        semester: group.semester,
        studentIds: group.studentIds.map(id => id.toString()),
        supervisorId: group.supervisorId.toString(),
        evaluatorAssignments: group.evaluatorAssignments.map(assignment => ({
          evaluatorId: assignment.evaluatorId.toString(),
          assignedAt: assignment.assignedAt.toISOString(),
          status: assignment.status,
        })),
      }));
    },
  },

  CapstoneGroup: {
    supervisor: async (parent: any, _: any, context: GraphQLContext & { loaders: Loaders }) => {
      const user = await context.loaders.userLoader.load(parent.supervisorId);

      if (!user) return null;

      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role || 'user',
      };
    },
  },

  EvaluatorAssignment: {
    evaluator: async (parent: any, _: any, context: GraphQLContext & { loaders: Loaders }) => {
      const user = await context.loaders.userLoader.load(parent.evaluatorId);

      if (!user) return null;

      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role || 'user',
      };
    },
  },
};
