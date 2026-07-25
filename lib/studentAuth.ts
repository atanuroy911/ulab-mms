import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';
import Student from '@/models/Student';

// Shared gate for student-facing "check my X" endpoints (marks, attendance): the caller
// must either hold a verified @ulab.edu.bd NextAuth session (any provider - dashboard,
// attendance check-in, or marks check-in all issue an email-scoped session) or supply the
// admin password as a teacher/admin override. Without this, student records can be
// enumerated anonymously by guessing IDs.
export async function isUlabSessionOrAdminAuthorized(adminPassword?: string): Promise<boolean> {
  const session = (await getServerSession(authOptions as any)) as any;
  if (session?.user?.email && session.user.email.toLowerCase().endsWith('@ulab.edu.bd')) {
    return true;
  }

  if (adminPassword) {
    await dbConnect();
    const adminSettings = await AdminSettings.findOne();
    if (adminSettings?.passwordHash) {
      return bcrypt.compare(adminPassword, adminSettings.passwordHash);
    }
  }

  return false;
}

// Resolves the currently signed-in @ulab.edu.bd Google session to a specific Student
// document in the given course - mirrors the identity matching the QR attendance check-in
// flow uses (app/api/attendance/checkin/route.ts): parse the student ID out of a
// "Name (2021-1-60-123)"-style display name, falling back to a unique name match. Returns
// null if there's no session, the session isn't @ulab.edu.bd, or identity can't be resolved
// to exactly one student - callers must treat null as "not authorized to act as any student".
export async function resolveSessionStudent(courseId: string) {
  const session = (await getServerSession(authOptions as any)) as any;
  const email = session?.user?.email?.toLowerCase();
  if (!email || !email.endsWith('@ulab.edu.bd')) {
    return null;
  }

  await dbConnect();

  const displayName = (session.user.name || '').trim();
  const match = displayName.match(/\(([^)]+)\)/);
  const parsedId = match ? match[1].trim() : null;

  if (parsedId) {
    const candidate = await Student.findOne({ studentId: parsedId, courseId });
    if (candidate) return candidate;
  }

  if (!displayName) return null;

  const normalizedName = displayName.toLowerCase();
  const students = await Student.find({ courseId });
  const exactMatches = students.filter((item) => item.name.trim().toLowerCase() === normalizedName);
  const matches = exactMatches.length === 1
    ? exactMatches
    : students.filter((item) => {
        const studentName = item.name.trim().toLowerCase();
        return studentName.includes(normalizedName) || normalizedName.includes(studentName);
      });

  return matches.length === 1 ? matches[0] : null;
}
