import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';

/**
 * The signed-in student, from the student portal's own Google sign-in - or null. Teacher,
 * admin and the one-purpose check-in/marks/project sign-ins don't count.
 */
export async function portalStudent(): Promise<{ studentIdText: string; name: string } | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as { studentSession?: boolean; studentIdText?: string | null; name?: string | null } | undefined;
  if (!user?.studentSession || !user.studentIdText) return null;
  await dbConnect();
  return { studentIdText: user.studentIdText, name: user.name || user.studentIdText };
}
