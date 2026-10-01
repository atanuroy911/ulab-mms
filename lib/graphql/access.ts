import Course from '@/models/Course';
import Student from '@/models/Student';
import User from '@/models/User';

// Who may see what through GraphQL: a course's own teacher, or a student enrolled in it.

/** The Student record the signed-in account is in this course, by the ID in their name - or null. */
export async function resolveStudentForUser(userId: string, courseId: string) {
  const user = await User.findById(userId);
  if (!user) return null;

  const displayName = (user.name || '').trim();
  const match = displayName.match(/\(([^)]+)\)/);
  const parsedId = match ? match[1].trim() : null;

  if (parsedId) {
    // An ID in the name is authoritative: no falling back to name matching, which could land
    // on a different student whose name happens to be contained in this one.
    return Student.findOne({ studentId: parsedId, courseId });
  }

  if (!displayName) return null;
  const normalizedName = displayName.toLowerCase();
  const exact = (await Student.find({ courseId }).lean()).filter((s) => s.name.trim().toLowerCase() === normalizedName);
  return exact.length === 1 ? Student.findById(exact[0]._id) : null;
}

export async function ownsCourse(userId: string, courseId: string): Promise<boolean> {
  return !!(await Course.exists({ _id: courseId, userId }));
}

/** The course's teacher, or a student enrolled in it. */
export async function canViewCourse(userId: string, courseId: string): Promise<boolean> {
  return (await ownsCourse(userId, courseId)) || !!(await resolveStudentForUser(userId, courseId));
}
