import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import Course from '@/models/Course';
import Student from '@/models/Student';
import StudentAccount from '@/models/StudentAccount';
import User from '@/models/User';
import '@/models/Semester';
import { notifyStudents } from '@/lib/studentNotify';

// Things every student of a session or course should hear about once, sent after the action
// that caused them (portal copy for all, email where an address is known).

/** A capstone session has started: each student's group, supervisor and the journal. */
export async function announceSessionOpened(sessionId: string) {
  const session = await CapstoneSession.findById(sessionId).populate('semesterId', 'name').lean<{ department: string; semesterId?: { name?: string } }>();
  if (!session) return;
  const groups = await CapstoneGroup.find({ sessionId }).lean();
  const [students, supervisors] = await Promise.all([
    StudentAccount.find({ _id: { $in: groups.flatMap((g) => g.members.filter((m) => !m.removedAt).map((m) => m.studentAccountId)) } })
      .select('studentId')
      .lean(),
    User.find({ _id: { $in: groups.map((g) => g.supervisorId).filter(Boolean) } }).select('name').lean(),
  ]);
  const studentIdOf = new Map(students.map((s) => [String(s._id), s.studentId]));
  const supervisorOf = new Map(supervisors.map((u) => [String(u._id), u.name as string]));
  const term = session.semesterId?.name ? ` (${session.semesterId.name})` : '';
  await notifyStudents(
    'capstone',
    groups.flatMap((g) => {
      const supervisor = (g.supervisorId && supervisorOf.get(String(g.supervisorId))) || null;
      return g.members
        .filter((m) => !m.removedAt)
        .map((m) => ({
          studentId: studentIdOf.get(String(m.studentAccountId)) || m.studentIdText,
          title: `Capstone ${g.track} has started - you're in Group ${g.groupNumber}`,
          subject: `${session.department} Capstone ${g.track}${term} has started`,
          body: `Group ${g.groupNumber}: ${g.projectTitle}.${supervisor ? ` Supervisor: ${supervisor}.` : ''} Write your weekly journal every week in the student portal.`,
          href: '/student/dashboard/capstone',
        }));
    })
  );
}

/** A course's teacher opened project-group forming. */
export async function announceProjectGroupsOpen(courseId: string) {
  const [course, students] = await Promise.all([
    Course.findById(courseId).select('code name courseType').lean<{ code: string; name: string; courseType?: string }>(),
    Student.find({ courseId, withdrawn: { $ne: true } }).select('studentId').lean(),
  ]);
  if (!course) return;
  const what = course.courseType === 'Lab' ? 'OEL / CEP project' : 'project';
  await notifyStudents(
    'project',
    students.map((s) => ({
      studentId: s.studentId,
      title: `${course.code}: form your ${what} group`,
      subject: `${course.code}: ${what} groups are open`,
      body: `Your teacher opened ${what} groups for ${course.code} - ${course.name}. Start a group or join one, and add your project title.`,
      href: `/project/${courseId}`,
    }))
  );
}
