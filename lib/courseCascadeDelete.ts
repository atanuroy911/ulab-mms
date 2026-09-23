import Student from '@/models/Student';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import AttendanceSession from '@/models/AttendanceSession';
import ProjectGroup from '@/models/ProjectGroup';

// Deletes every collection that references a course by courseId. Used when a
// course itself (or its owning account) is deleted, so no orphaned data is left behind.
//
// Capstone is intentionally NOT included here: it no longer references Course at all
// (CapstoneSession/CapstoneGroup are self-contained, keyed on semesterId+department instead
// of courseId) - see lib/capstoneCascadeDelete.ts for its own cascade.
export async function cascadeDeleteCourseData(courseId: string) {
  await Promise.all([
    Student.deleteMany({ courseId }),
    Exam.deleteMany({ courseId }),
    Mark.deleteMany({ courseId }),
    AttendanceSession.deleteMany({ courseId }),
    ProjectGroup.deleteMany({ courseId }),
  ]);
}
