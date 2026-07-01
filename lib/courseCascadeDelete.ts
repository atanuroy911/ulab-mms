import Student from '@/models/Student';
import Exam from '@/models/Exam';
import Mark from '@/models/Mark';
import AttendanceSession from '@/models/AttendanceSession';
import ProjectGroup from '@/models/ProjectGroup';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneMarks from '@/models/CapstoneMarks';

// Deletes every collection that references a course by courseId. Used when a
// course itself (or its owning account) is deleted, so no orphaned data is left behind.
export async function cascadeDeleteCourseData(courseId: string) {
  await Promise.all([
    Student.deleteMany({ courseId }),
    Exam.deleteMany({ courseId }),
    Mark.deleteMany({ courseId }),
    AttendanceSession.deleteMany({ courseId }),
    ProjectGroup.deleteMany({ courseId }),
    CapstoneGroup.deleteMany({ courseId }),
    CapstoneMarks.deleteMany({ courseId }),
  ]);
}
