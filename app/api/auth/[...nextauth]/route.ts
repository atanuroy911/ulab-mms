import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { isUlabEmail, looksLikeStudentName } from '@/lib/googleAccount';
import { isCredentialsLoginEnabled } from '@/lib/authSettings';

// The student attendance QR check-in page also signs people in with Google, but that is a
// separate, purpose-built entry point (see app/attendance/checkin/[sessionCode]/page.tsx,
// which calls signIn('google-checkin', ...)) - not the teacher dashboard sign-in. Students'
// Google accounts are set up with their ID in the display name, e.g. "John Doe
// (2021-1-60-123)", which the teacher-account guard below rejects, so the guard is scoped to
// the 'google' provider (dashboard) only and does not run for 'google-checkin'.
const CHECKIN_GOOGLE_PROVIDER_ID = 'google-checkin';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Please provide email and password');
        }

        await dbConnect();

        if (!(await isCredentialsLoginEnabled())) {
          throw new Error('Email/password sign-in is currently disabled. Please use "Continue with Google" instead.');
        }

        const user = await User.findOne({ email: credentials.email });

        if (!user) {
          throw new Error('No user found with this email');
        }

        if (!user.password) {
          throw new Error('This account signs in with Google. Use "Continue with Google" instead.');
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error('Invalid password');
        }

        return {
          id: (user._id as any).toString(),
          email: user.email,
          name: user.name,
          role: (user as any).role || 'user',
        };
      },
    }),
    // Add Google provider(s) when configured in environment. This keeps Google auth modular and
    // only enabled when the admin sets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
              params: {
                prompt: 'select_account consent',
                // Hints Google's account chooser toward the ULAB workspace; the real
                // enforcement happens in the signIn callback below.
                hd: 'ulab.edu.bd',
              },
            },
          }),
          // Same Google app, registered a second time under a distinct provider id so the
          // attendance check-in page can sign in without tripping the teacher-account guard.
          GoogleProvider({
            id: CHECKIN_GOOGLE_PROVIDER_ID,
            name: 'Google (Attendance Check-in)',
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
              params: {
                prompt: 'select_account consent',
                hd: 'ulab.edu.bd',
              },
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      const isGoogle = account?.provider === 'google' || account?.provider === CHECKIN_GOOGLE_PROVIDER_ID;
      if (!isGoogle) {
        return true;
      }

      const email = (user.email || '').toLowerCase();

      if (!isUlabEmail(email)) {
        return '/auth/error?reason=domain';
      }

      // Google accounts used for student attendance check-in are set up with the
      // student ID in the display name, e.g. "John Doe (2021-1-60-123)". Anyone
      // signing in/up as a teacher must NOT match that pattern, otherwise a
      // student could accidentally register a teacher account. This guard only
      // applies to the teacher dashboard's Google provider, not the check-in one.
      if (account?.provider === 'google' && looksLikeStudentName(user.name)) {
        return '/auth/error?reason=student';
      }

      await dbConnect();
      const existing = await User.findOne({ email });

      if (!existing) {
        // First time this Google account has been seen with checks passing -> sign up.
        await User.create({
          name: user.name || email,
          email,
          googleId: account.providerAccountId,
          role: 'user',
        });
      } else if (!existing.googleId) {
        // A teacher with an existing (e.g. email/password) account is linking Google.
        existing.googleId = account.providerAccountId;
        await existing.save();
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const email = user.email?.toLowerCase();

        if (email) {
          await dbConnect();
          const appUser = await User.findOne({ email });

          if (appUser) {
            token.id = (appUser._id as any).toString();
            token.role = (appUser as any).role || (user as any).role || 'user';
            token.googleLinked = !!appUser.googleId;
            token.hasPassword = !!appUser.password;
            return token;
          }
        }

        token.id = user.id;
        token.role = (user as any).role || 'user';
        token.googleLinked = false;
        token.hasPassword = false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role as string;
        (session.user as any).googleLinked = !!token.googleLinked;
        (session.user as any).hasPassword = !!token.hasPassword;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 60, // 30 minutes
    updateAge: 5 * 60, // 5 minutes
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
