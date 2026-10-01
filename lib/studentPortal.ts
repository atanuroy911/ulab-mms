import type { Types } from 'mongoose';
import Mark from '@/models/Mark';
import Exam from '@/models/Exam';
import Course from '@/models/Course';
import AttendanceSession from '@/models/AttendanceSession';
import ProjectGroup from '@/models/ProjectGroup';
import Student from '@/models/Student';
// Registered for populate('userId') - the course's teacher.
import '@/models/User';
import { escapeRegExp } from '@/lib/utils';

// What a student sees of their own courses: read-only views built for one enrolment at a
// time. Every function here takes a Student record the caller has already proven belongs to
// the signed-in student - nothing in this file checks identity itself.

type StudentRecord = { _id: Types.ObjectId | string; studentId: string; name: string; withdrawn?: boolean; courseId: unknown };

const TERMS = ['spring', 'summer', 'fall'];

/** Sortable term number: 2026 Fall > 2026 Summer > 2026 Spring > 2025 Fall. */
export function termRank(semester: string, year: number): number {
  const i = TERMS.findIndex((t) => String(semester || '').toLowerCase().includes(t));
  return (Number(year) || 0) * 10 + (i < 0 ? 0 : i + 1);
}

/** Today's term by the ULAB calendar: Spring Jan-Apr, Summer May-Aug, Fall Sep-Dec. */
export function todayTermRank(now = new Date()): number {
  const m = now.getMonth();
  return now.getFullYear() * 10 + (m < 4 ? 1 : m < 8 ? 2 : 3);
}

/** The term before a term rank (Spring 2027 -> Fall 2026). */
export const previousTermRank = (rank: number) => (rank % 10 === 1 ? (Math.floor(rank / 10) - 1) * 10 + 3 : rank - 1);

/** Every course the student is enrolled in, by their student ID (any case). */
export async function enrolments(studentIdText: string) {
  return Student.find({ studentId: { $regex: new RegExp(`^${escapeRegExp(studentIdText)}$`, 'i') } }).lean<StudentRecord[]>();
}

function attendanceOf(sessions: Array<{ records?: Array<{ studentId: unknown; status: string }> }>, studentRecordId: string) {
  const total = sessions.length;
  // Match by the Student document id (as the teacher's view does), not the denormalized ID
  // string, which goes stale if a roll number is edited after attendance was taken.
  const present = sessions.filter((s) => (s.records || []).some((r) => String(r.studentId) === studentRecordId && r.status === 'present')).length;
  return { totalSessions: total, presentSessions: present, absentSessions: total - present, percentage: total ? Math.round((present / total) * 10000) / 100 : 0 };
}

/** The student's OEL/CEP (course project) group, with teammates' names - or null. */
export async function projectGroupFor(courseId: unknown, studentRecordId: string) {
  const pg = await ProjectGroup.findOne({ courseId }).populate('groups.studentIds', 'name studentId').lean<{
    isActive: boolean;
    maxMembersPerGroup: number;
    groups: Array<{ groupNumber: number; projectTitle: string; studentIds: Array<{ _id: unknown; name: string; studentId: string }> }>;
  }>();
  if (!pg) return { exists: false, formingOpen: false, group: null };
  const g = pg.groups.find((x) => x.studentIds.some((s) => String(s._id) === studentRecordId));
  return {
    exists: true,
    formingOpen: !!pg.isActive,
    group: g
      ? {
          groupNumber: g.groupNumber,
          projectTitle: g.projectTitle || '',
          maxMembers: pg.maxMembersPerGroup,
          members: g.studentIds.map((s) => ({ name: s.name, studentId: s.studentId, isMe: String(s._id) === studentRecordId })),
        }
      : null,
  };
}

/** The portal's course list: light, one row per enrolment. */
export async function courseSummaries(records: StudentRecord[]) {
  const courseIds = records.map((r) => r.courseId);
  const [courses, sessions, projectGroups] = await Promise.all([
    Course.find({ _id: { $in: courseIds } })
      .select('name code section semester year courseType isArchived userId')
      .populate('userId', 'name')
      .lean(),
    AttendanceSession.find({ courseId: { $in: courseIds } }).select('courseId records.studentId records.status').lean(),
    ProjectGroup.find({ courseId: { $in: courseIds } }).select('courseId isActive groups.groupNumber groups.projectTitle groups.studentIds').lean(),
  ]);
  const courseById = new Map(courses.map((c) => [String(c._id), c]));
  const newest = Math.max(0, ...courses.map((c) => termRank(c.semester, c.year)));
  // Last term's courses stay "this semester" until the student's new-term courses appear
  // (results, late marks) - but never longer than one term.
  const lastTerm = previousTermRank(todayTermRank());

  return records
    .map((r) => {
      const c = courseById.get(String(r.courseId));
      if (!c) return null;
      const rid = String(r._id);
      const pg = projectGroups.find((p) => String(p.courseId) === String(c._id));
      const mine = pg?.groups.find((g) => g.studentIds.some((s) => String(s) === rid));
      const rank = termRank(c.semester, c.year);
      const teacher = c.userId && typeof c.userId === 'object' && 'name' in c.userId ? String((c.userId as { name?: string }).name || '') : '';
      return {
        courseId: String(c._id),
        code: c.code,
        name: c.name,
        section: c.section ?? null,
        semester: c.semester,
        year: c.year,
        courseType: c.courseType,
        teacher: teacher || null,
        withdrawn: !!r.withdrawn,
        // Past: archived by the teacher, older than the student's newest term, or more than a term old.
        past: !!c.isArchived || rank < newest || rank < lastTerm,
        termRank: rank,
        attendance: attendanceOf(
          sessions.filter((s) => String(s.courseId) === String(c._id)),
          rid
        ),
        project: pg
          ? { formingOpen: !!pg.isActive, groupNumber: mine?.groupNumber ?? null, projectTitle: mine?.projectTitle || null }
          : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.termRank - a.termRank || a.code.localeCompare(b.code));
}

/**
 * One course's full marks report - the shape the Check Marks screens read (course, exams,
 * marks, class statistics, attendance).
 */
export async function courseReport(record: StudentRecord) {
  const course = await Course.findById(record.courseId);
  if (!course) return null;
  const rid = String(record._id);
  const [exams, allMarks, sessions] = await Promise.all([
    Exam.find({ courseId: course._id }).sort({ createdAt: 1 }),
    Mark.find({ courseId: course._id }).select('examId studentId rawMark coMarks questionMarks weightedMark').lean(),
    AttendanceSession.find({ courseId: course._id }).select('records.studentId records.status').lean(),
  ]);
  const marks = allMarks.filter((m) => String(m.studentId) === rid);

  // Class statistics per exam, for "how am I doing compared to the class".
  const classStats = exams.map((exam) => {
    const values = allMarks.filter((m) => String(m.examId) === String(exam._id)).map((m) => m.rawMark);
    return {
      examId: String(exam._id),
      average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      highest: values.length ? Math.max(...values) : 0,
      lowest: values.length ? Math.min(...values) : 0,
      count: values.length,
    };
  });

  return {
    student: { _id: record._id, studentId: record.studentId, name: record.name, withdrawn: record.withdrawn },
    attendance: attendanceOf(sessions, rid),
    course: {
      _id: course._id,
      name: course.name,
      code: course.code,
      semester: course.semester,
      year: course.year,
      courseType: course.courseType,
      isArchived: course.isArchived,
      showFinalGrade: course.showFinalGrade,
      quizAggregation: course.quizAggregation,
      quizWeightage: course.quizWeightage,
      assignmentAggregation: course.assignmentAggregation,
      assignmentWeightage: course.assignmentWeightage,
      projectWeightage: course.projectWeightage,
      gradingScale: course.gradingScale,
    },
    exams: exams.map((exam) => ({
      _id: exam._id,
      displayName: exam.displayName,
      totalMarks: exam.totalMarks,
      weightage: exam.weightage,
      examType: exam.examType,
      examCategory: exam.examCategory,
      numberOfCOs: exam.numberOfCOs,
      numberOfQuestions: exam.numberOfQuestions,
    })),
    marks: marks.map((mark) => ({
      _id: mark._id,
      examId: mark.examId,
      rawMark: mark.rawMark,
      coMarks: mark.coMarks,
      questionMarks: mark.questionMarks,
      weightedMark: mark.weightedMark,
    })),
    classStats,
  };
}
