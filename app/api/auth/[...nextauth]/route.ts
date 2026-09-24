import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { looksLikeStudentName, extractStudentId } from '@/lib/googleAccount';
import { clearInvite } from '@/lib/userInvites';
import { isCredentialsLoginEnabled, isAllowedTeacherEmail, isAllowedStudentEmail } from '@/lib/authSettings';
import { sendMail, mailShell } from '@/lib/mail';
import Student from '@/models/Student';
import StudentAccount from '@/models/StudentAccount';

// The student attendance QR check-in page and the "check marks" page also sign people in
// with Google, but those are separate, purpose-built entry points (see
// app/attendance/checkin/[sessionCode]/page.tsx, which calls signIn('google-checkin', ...),
// and app/student/check-marks/page.tsx, which calls signIn('google-marks', ...)) - not the
// teacher dashboard sign-in. Students' Google accounts are set up with their ID in the
// display name, e.g. "John Doe (2021-1-60-123)", which the teacher-account guard below
// rejects, so the guard is scoped to the 'google' provider (dashboard) only. These two
// student-facing providers also deliberately skip User.create entirely (see the signIn
// callback below) - they only need to prove "this is a real @ulab.edu.bd Google account",
// not persist an account, so a student checking their attendance or marks never ends up
// with a login-capable User document they never asked for.
const CHECKIN_GOOGLE_PROVIDER_ID = 'google-checkin';
const MARKS_GOOGLE_PROVIDER_ID = 'google-marks';
const PROJECT_GOOGLE_PROVIDER_ID = 'google-project';
// The real student login (app/student/dashboard) - unlike the three scoped providers above,
// this one DOES persist a StudentAccount (see signIn callback below), since it's meant to be
// a durable "the student is logged in" session rather than a one-off identity proof.
export const STUDENT_GOOGLE_PROVIDER_ID = 'google-student';
export const STUDENT_ONLY_GOOGLE_PROVIDER_IDS = [
  CHECKIN_GOOGLE_PROVIDER_ID,
  MARKS_GOOGLE_PROVIDER_ID,
  PROJECT_GOOGLE_PROVIDER_ID,
  STUDENT_GOOGLE_PROVIDER_ID,
];

/**
 * True for any session minted by a student-scoped provider (checkin/marks/project/student).
 * This is the single source of truth for "is this session a student, never a teacher" - every
 * place that authorizes teacher/coordinator/admin actions must reject when this is true. It
 * previously diverged (lib/capstoneAuth.ts checked only 3 of these 4 flags), which let a
 * student's `google-student` session pass as a teacher in capstone routes.
 */
export function isStudentOnlySessionUser(user: any): boolean {
  return !!(user?.checkinOnly || user?.marksOnly || user?.projectOnly || user?.studentSession);
}

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

        if (!(await isAllowedTeacherEmail(credentials.email))) {
          throw new Error('Please sign in with your @ulab.edu.bd email address');
        }

        const user = await User.findOne({ email: credentials.email });

        if (!user || user.systemAccount) {
          throw new Error('No user found with this email');
        }

        if (!user.password && user.invitePending) {
          throw new Error(
            'Your account has not been set up yet. Use the link in your invitation email, or "Continue with Google".'
          );
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
                // No fixed `hd` here: the teacher sign-in buttons send hd=ulab.edu.bd per
                // request, except while the admin "allow any email domain" developer setting
                // is on (lib/teacherGoogleSignIn.ts). The real enforcement is the signIn
                // callback below, which applies that same setting.
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
                // hd=ulab.edu.bd is sent per sign-in (lib/studentGoogleSignIn.ts) so the
                // developer student test-address allowlist can reach Google's picker.
              },
            },
          }),
          // Same Google app again, for the "check marks" page - proves the visitor owns a
          // real @ulab.edu.bd Google account without creating a User document.
          GoogleProvider({
            id: MARKS_GOOGLE_PROVIDER_ID,
            name: 'Google (Check Marks)',
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
              params: {
                prompt: 'select_account consent',
                // hd=ulab.edu.bd is sent per sign-in (lib/studentGoogleSignIn.ts) so the
                // developer student test-address allowlist can reach Google's picker.
              },
            },
          }),
          // Same Google app again, for the project-grouping check-in page - proves the
          // visitor owns a real @ulab.edu.bd Google account so group actions can be bound to
          // the actual signed-in student instead of a client-supplied studentId.
          GoogleProvider({
            id: PROJECT_GOOGLE_PROVIDER_ID,
            name: 'Google (Project Check-in)',
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
              params: {
                prompt: 'select_account consent',
                // hd=ulab.edu.bd is sent per sign-in (lib/studentGoogleSignIn.ts) so the
                // developer student test-address allowlist can reach Google's picker.
              },
            },
          }),
          // The student dashboard's real login - persists a StudentAccount (see signIn
          // callback), unlike the three scoped providers above which deliberately don't.
          GoogleProvider({
            id: STUDENT_GOOGLE_PROVIDER_ID,
            name: 'Google (Student)',
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
              params: {
                prompt: 'select_account consent',
                // hd=ulab.edu.bd is sent per sign-in (lib/studentGoogleSignIn.ts) so the
                // developer student test-address allowlist can reach Google's picker.
              },
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      const isStudentOnlyProvider = STUDENT_ONLY_GOOGLE_PROVIDER_IDS.includes(account?.provider || '');
      const isGoogle = account?.provider === 'google' || isStudentOnlyProvider;
      if (!isGoogle || !account) {
        return true;
      }

      const email = (user.email || '').toLowerCase();

      // Student-only providers accept @ulab.edu.bd plus the developer's specific student test
      // addresses; the teacher "any email domain" setting never applies to them.
      const domainOk = isStudentOnlyProvider ? await isAllowedStudentEmail(email) : await isAllowedTeacherEmail(email);
      if (!domainOk) {
        return '/auth/error?reason=domain';
      }

      // The attendance check-in and check-marks providers only need to prove the visitor
      // owns a real @ulab.edu.bd Google account - they must never create or link a User
      // document, so a student checking their attendance/marks doesn't end up with a
      // login-capable account they never asked for.
      if (isStudentOnlyProvider) {
        // Opportunistically capture the student's real email for every course they're
        // enrolled in, keyed off the student ID embedded in their Google display name (the
        // same pattern the attendance check-in route matches on). Best-effort only - never
        // blocks sign-in if it fails.
        const studentId = extractStudentId(user.name);
        if (studentId) {
          try {
            await dbConnect();
            await Student.updateMany({ studentId }, { email });

            if (account.provider === STUDENT_GOOGLE_PROVIDER_ID) {
              // Unlike the other three scoped providers, this one is a durable login - upsert
              // the person-level StudentAccount (models/StudentAccount.ts didn't exist before
              // the capstone rebuild; per-course Student rows have no cross-course identity).
              const now = new Date();
              const existingAccount = await StudentAccount.findOne({ studentId });
              try {
                await StudentAccount.findOneAndUpdate(
                  { studentId },
                  {
                    $set: {
                      name: user.name || existingAccount?.name || studentId,
                      email,
                      googleId: account.providerAccountId,
                      lastSignInAt: now,
                    },
                    $setOnInsert: { firstSignInAt: now, status: 'active' },
                  },
                  { upsert: true }
                );
              } catch (conflictErr: any) {
                // email/googleId are each unique - a stale/duplicate StudentAccount holding
                // this email or googleId (e.g. a coordinator typo'd a placeholder account, or
                // a reused Google alias) would previously make this whole upsert throw,
                // silently caught by the outer try/catch below, leaving NO StudentAccount
                // document for this studentId and the student unable to see their capstone
                // group at all. Fall back to writing only the non-conflicting fields so the
                // record for THIS studentId still exists and is resolvable, even if the
                // email/googleId can't be claimed until the conflicting record is fixed.
                if (conflictErr?.code === 11000) {
                  console.error(`StudentAccount upsert conflict for studentId=${studentId}: ${conflictErr.message}`);
                  await StudentAccount.findOneAndUpdate(
                    { studentId },
                    {
                      $set: { name: user.name || existingAccount?.name || studentId, lastSignInAt: now },
                      $setOnInsert: { firstSignInAt: now, status: 'active' },
                    },
                    { upsert: true }
                  );
                } else {
                  throw conflictErr;
                }
              }
            }
          } catch (err) {
            console.error('Failed to capture student email on sign-in:', err);
          }
        } else if (account.provider === STUDENT_GOOGLE_PROVIDER_ID) {
          // The student dashboard needs a resolvable ID to be usable at all - unlike the
          // scoped check-in/marks/project flows, which can fall back to fuzzy name matching
          // within a single course, this login has no course context to fall back within.
          return '/auth/error?reason=student-id-missing';
        }
        return true;
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
        sendMail({
          to: email,
          subject: 'Welcome to ULAB MMS',
          html: mailShell(`
            <h2 style="margin-top:0;">Welcome, ${user.name || email}!</h2>
            <p>Your Marks Management System account has been created with the email <strong>${email}</strong>.</p>
            <p>You can sign in any time at <a href="${process.env.NEXTAUTH_URL}/auth/signin">${process.env.NEXTAUTH_URL}/auth/signin</a>.</p>
          `),
        }).catch(() => {});
      } else if (!existing.googleId) {
        // A teacher with an existing (e.g. email/password) account is linking Google - or an
        // invited supervisor/evaluator activating their pending account (lib/userInvites.ts):
        // signing in with the Google account for that address proves they own it.
        existing.googleId = account.providerAccountId;
        if (existing.invitePending) clearInvite(existing);
        await existing.save();
      }

      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (account) {
        // Tokens minted via the attendance check-in / check-marks providers are scoped to
        // those flows only - they must never grant access to the teacher dashboard/course
        // routes (see middleware.ts).
        token.checkinOnly = account.provider === CHECKIN_GOOGLE_PROVIDER_ID;
        token.marksOnly = account.provider === MARKS_GOOGLE_PROVIDER_ID;
        token.projectOnly = account.provider === PROJECT_GOOGLE_PROVIDER_ID;
        token.studentSession = account.provider === STUDENT_GOOGLE_PROVIDER_ID;
      }

      // Only trustworthy at sign-in (`account` is undefined on every later refresh call).
      const isStudentOnlyProvider = STUDENT_ONLY_GOOGLE_PROVIDER_IDS.includes(account?.provider || '');
      // Persists across refreshes via the token flags set above (this call, or a previous
      // one) - this is what the refresh-throttle guard below must use instead, since
      // `account` (and therefore `isStudentOnlyProvider`) is only ever present at sign-in.
      const isStudentOnlySession = !!(token.checkinOnly || token.marksOnly || token.projectOnly || token.studentSession);

      if (user) {
        // No User document is ever created for these providers (see signIn above) - just
        // carry the OAuth id through, same as before, and skip the DB-backed role/department
        // resolution below entirely.
        if (isStudentOnlyProvider) {
          token.id = user.id;
          token.role = 'user';
          // Never 'teacher' here - a student token must fail every roles.includes(...) check
          // in lib/capstoneAuth.ts and elsewhere, not fall through as a teacher by default.
          token.roles = [];

          if (account?.provider === STUDENT_GOOGLE_PROVIDER_ID) {
            const studentId = extractStudentId(user.name);
            if (studentId) {
              await dbConnect();
              const studentAccount = await StudentAccount.findOne({ studentId }).select('_id');
              token.studentAccountId = studentAccount ? String(studentAccount._id) : null;
              token.studentIdText = studentId;
            }
          }
        } else {
          // First-ever call for this session (sign-in). Resolve the User id once here; the
          // refresh branch below re-reads role/department from that id on every subsequent
          // token refresh, so this only needs to run once per session lifetime.
          const email = user.email?.toLowerCase();
          if (email) {
            await dbConnect();
            const appUser = await User.findOne({ email });
            token.id = appUser ? (appUser._id as any).toString() : user.id;
          } else {
            token.id = user.id;
          }
          token.googleLinked = false; // refined below once we read the User doc
          token.hasPassword = false;
        }
      }

      // Re-read role/department from the DB periodically (not just at sign-in), so an admin
      // granting/revoking a role takes effect on this session soon instead of waiting up to
      // the full 30-minute session maxAge. NextAuth's jwt() callback runs on EVERY request
      // with the JWT strategy (not only at token refresh), so this is throttled with our own
      // timestamp rather than querying Mongo on every single page load. `trigger==='update'`
      // (a client useSession().update() call) always forces an immediate re-read.
      const ROLE_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // matches session.updateAge below
      const needsRefresh =
        trigger === 'update' ||
        !token.roleRefreshedAt ||
        Date.now() - token.roleRefreshedAt > ROLE_REFRESH_INTERVAL_MS;

      if (!isStudentOnlySession && token.id && needsRefresh) {
        await dbConnect();
        const appUser = await User.findById(token.id);
        if (appUser) {
          token.role = appUser.role || 'user';
          token.roles = appUser.roles?.length ? appUser.roles : ['teacher'];
          token.departmentId = appUser.departmentId ? String(appUser.departmentId) : null;
          token.coordinatorDepartments = appUser.coordinatorDepartments || [];
          token.googleLinked = !!appUser.googleId;
          token.hasPassword = !!appUser.password;
        }
        token.roleRefreshedAt = Date.now();
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role as string;
        (session.user as any).roles = token.roles ?? [];
        (session.user as any).departmentId = token.departmentId ?? null;
        (session.user as any).coordinatorDepartments = token.coordinatorDepartments || [];
        (session.user as any).googleLinked = !!token.googleLinked;
        (session.user as any).hasPassword = !!token.hasPassword;
        (session.user as any).checkinOnly = !!token.checkinOnly;
        (session.user as any).marksOnly = !!token.marksOnly;
        (session.user as any).projectOnly = !!token.projectOnly;
        (session.user as any).studentSession = !!token.studentSession;
        (session.user as any).studentAccountId = token.studentAccountId ?? null;
        (session.user as any).studentIdText = token.studentIdText ?? null;
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
