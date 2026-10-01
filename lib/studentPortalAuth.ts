import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import { viewAsStudent } from '@/lib/studentViewAs';

export interface CurrentStudent {
  studentIdText: string;
  name: string;
  /** The person's own sign-in, if it carries the account id. */
  studentAccountId: string | null;
  /** An admin viewing as this student - read only. */
  viewAs: boolean;
  viewedBy?: string;
}

/**
 * Who the student is for this request: the student's own portal sign-in, or an admin viewing
 * as them (lib/studentViewAs.ts). Teacher sign-ins and the one-purpose check-in / marks /
 * project sign-ins don't count. Callers that change anything must refuse when `viewAs`.
 */
export async function currentStudent(): Promise<CurrentStudent | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as
    | { studentSession?: boolean; studentIdText?: string | null; studentAccountId?: string | null; name?: string | null }
    | undefined;
  if (user?.studentSession && user.studentIdText) {
    await dbConnect();
    return { studentIdText: user.studentIdText, name: user.name || user.studentIdText, studentAccountId: user.studentAccountId || null, viewAs: false };
  }
  const v = await viewAsStudent();
  if (!v) return null;
  await dbConnect();
  return { studentIdText: v.studentId, name: v.name, studentAccountId: null, viewAs: true, viewedBy: v.by };
}

/** For reading: the signed-in student, or an admin viewing as one. */
export async function portalStudent(): Promise<CurrentStudent | null> {
  return currentStudent();
}
