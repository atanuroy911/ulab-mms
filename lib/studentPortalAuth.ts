import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import { viewAsStudent } from '@/lib/studentViewAs';
import StudentAccount from '@/models/StudentAccount';

export interface CurrentStudent {
  studentIdText: string;
  name: string;
  /** The person's own sign-in, if it carries the account id. */
  studentAccountId: string | null;
  /** An admin viewing as this student - read only. */
  viewAs: boolean;
  viewedBy?: string;
  /** May change things: the student themself, or an admin acting (not just viewing) as them. */
  canWrite: boolean;
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
    return { studentIdText: user.studentIdText, name: user.name || user.studentIdText, studentAccountId: user.studentAccountId || null, viewAs: false, canWrite: true };
  }
  const v = await viewAsStudent();
  if (!v) return null;
  await dbConnect();
  return { studentIdText: v.studentId, name: v.name, studentAccountId: null, viewAs: true, viewedBy: v.by, canWrite: v.write };
}

/**
 * For a change: the student who may make it, with their account id - or null and why. An admin
 * acting as the student is allowed (and logged); one only viewing is not.
 */
export async function writingStudent(action: string): Promise<{ student: CurrentStudent & { studentAccountId: string } } | { error: string; status: number }> {
  const me = await currentStudent();
  if (!me) return { error: 'Please sign in with your student Google account', status: 401 };
  if (!me.canWrite) return { error: 'Viewing as a student is read-only', status: 403 };
  const accountId =
    me.studentAccountId || String((await StudentAccount.findOne({ studentId: me.studentIdText }).select('_id').lean())?._id || '');
  if (!accountId) return { error: 'Could not resolve your student account', status: 404 };
  if (me.viewAs) console.warn(`[act-as] ${me.viewedBy} as student ${me.studentIdText}: ${action}`);
  return { student: { ...me, studentAccountId: accountId } };
}

/** For reading: the signed-in student, or an admin viewing as one. */
export async function portalStudent(): Promise<CurrentStudent | null> {
  return currentStudent();
}
