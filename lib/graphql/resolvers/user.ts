import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { generateToken, requireAuth, type GraphQLContext } from '../auth';
import type { Loaders } from '../dataloaders';

interface LoginArgs {
  input: {
    email: string;
    password: string;
  };
}

export const userResolvers = {
  Query: {
    me: async (_: any, __: any, context: GraphQLContext & { loaders: Loaders }) => {
      const user = requireAuth(context);
      await dbConnect();

      const userData = await context.loaders.userLoader.load(user.userId);

      if (!userData) {
        throw new Error('User not found');
      }

      return {
        id: userData._id.toString(),
        name: userData.name,
        email: userData.email,
        role: userData.role || 'user',
      };
    },
  },

  Mutation: {
    login: async (_: any, { input }: LoginArgs) => {
      await dbConnect();

      const { email, password } = input;

      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      const user = await User.findOne({ email });

      if (!user) {
        throw new Error('Invalid credentials');
      }

      if (!user.password) {
        throw new Error('Invalid credentials');
      }

      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        throw new Error('Invalid credentials');
      }

      const token = generateToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role || 'user',
      });

      return {
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role || 'user',
        },
      };
    },
  },
};
