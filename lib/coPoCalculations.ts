/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared CO-PO course-file calculations - the single source of truth for every
// student-count-independent number used by both the Alpha Excel export
// (lib/coPoDynamicExport.ts) and the Alpha PDF export (lib/coPoPdfReport.ts), so the two
// outputs can never silently disagree with each other.
import { calculateLetterGrade, getGradeDisplay } from '@/app/utils/grading';

export const CO_ATTAINMENT_THRESHOLD = 0.55;
export const PO_ATTAINMENT_THRESHOLD = 0.65;
export const WITHDRAWN_GRADE_LABEL = 'W (Withdrawn)';
export const ATTENDANCE_AT_RISK_THRESHOLD = 0.75;

export const GRADE_DISTRIBUTION: Array<{ label: string; grade: string }> = [
  { label: 'A+', grade: 'A+ (Plus)' },
  { label: 'A', grade: 'A (Plain)' },
  { label: 'A-', grade: 'A- (Minus)' },
  { label: 'B+', grade: 'B+ (Plus)' },
  { label: 'B', grade: 'B (Plain)' },
  { label: 'B-', grade: 'B- (Minus)' },
  { label: 'C+', grade: 'C+ (Plus)' },
  { label: 'C', grade: 'C (Plain)' },
  { label: 'D', grade: 'D (Plain)' },
  { label: 'F', grade: 'F (Fail)' },
  { label: 'I', grade: 'I (Incomplete)' },
  { label: 'W', grade: WITHDRAWN_GRADE_LABEL },
];

export function getMark(studentId: string, examId: string, marks: any[]) {
  return marks.find((m) => String(m.studentId) === String(studentId) && String(m.examId) === String(examId));
}

function getExamPercentage(rawMark: number, totalMarks: number) {
  if (!totalMarks || totalMarks <= 0) return 0;
  return (rawMark / totalMarks) * 100;
}

function getWeightedContribution(rawMark: number, totalMarks: number, weightage: number) {
  return (getExamPercentage(rawMark, totalMarks) * weightage) / 100;
}

export function findMidtermExam(exams: any[]) {
  return exams.find((e) => e.examType === 'midterm' || e.displayName?.toLowerCase().includes('mid'));
}

export function findFinalExam(exams: any[]) {
  return exams.find((e) => e.examType === 'final' || e.displayName?.toLowerCase().includes('final'));
}

export function findProjectExam(exams: any[]) {
  return exams.find((e) => e.examCategory === 'Project');
}

export function getExamWeight(exams: any[], category: string) {
  const exam = exams.find((e) => e.examCategory === category);
  return exam ? exam.weightage || 0 : 0;
}

function getMarkValue(student: any, exams: any[], marks: any[], category: string) {
  const exam = exams.find((e) => e.examCategory === category);
  if (!exam) return 0;
  const mark = getMark(student._id, exam._id, marks);
  if (!mark) return 0;
  return Math.round(getWeightedContribution(mark.rawMark, exam.totalMarks, exam.weightage || 0) * 100) / 100;
}

function getAggregatedMarkValue(student: any, exams: any[], marks: any[], category: 'Quiz' | 'Assignment', course: any) {
  const categoryExams = exams.filter((e) => e.examCategory === category);
  if (categoryExams.length === 0) return 0;

  const categoryMarks = categoryExams
    .map((exam) => getMark(student._id, exam._id, marks))
    .filter((mark) => mark !== undefined);

  if (categoryMarks.length === 0) return 0;

  const aggregationMethod = category === 'Quiz' ? course?.quizAggregation || 'average' : course?.assignmentAggregation || 'average';
  const categoryWeightage = category === 'Quiz' ? Number(course?.quizWeightage || 0) : Number(course?.assignmentWeightage || 0);

  if (aggregationMethod === 'best') {
    let bestMark = categoryMarks[0];
    let bestValue = -1;
    categoryMarks.forEach((mark) => {
      const exam = categoryExams.find((e) => String(e._id) === String(mark.examId));
      if (exam) {
        const percentage = getExamPercentage(mark.rawMark, exam.totalMarks);
        if (percentage > bestValue) {
          bestValue = percentage;
          bestMark = mark;
        }
      }
    });
    const bestExam = categoryExams.find((e) => String(e._id) === String(bestMark.examId));
    return bestExam ? getWeightedContribution(bestMark.rawMark, bestExam.totalMarks, categoryWeightage) : 0;
  }

  if (aggregationMethod === 'sum') {
    const sumRaw = categoryMarks.reduce((sum, mark) => sum + mark.rawMark, 0);
    const sumTotal = categoryMarks.reduce((sum, mark) => {
      const exam = categoryExams.find((e) => String(e._id) === String(mark.examId));
      return exam ? sum + exam.totalMarks : sum;
    }, 0);
    return sumTotal > 0 ? (getExamPercentage(sumRaw, sumTotal) * categoryWeightage) / 100 : 0;
  }

  const averagePercentage =
    categoryMarks.reduce((sum, mark) => {
      const exam = categoryExams.find((e) => String(e._id) === String(mark.examId));
      if (!exam) return sum;
      return sum + getExamPercentage(mark.rawMark, exam.totalMarks);
    }, 0) / categoryMarks.length;

  return (averagePercentage * categoryWeightage) / 100;
}

function getProjectAggregatedMarkValue(student: any, exams: any[], marks: any[], course: any) {
  const projectExams = exams.filter((e) => e.examCategory === 'Project');
  if (projectExams.length === 0) return 0;

  const projectMarks = projectExams
    .map((e) => ({ exam: e, mark: getMark(student._id, e._id, marks) }))
    .filter((x) => x.mark !== undefined);
  if (projectMarks.length === 0) return 0;

  const sumRaw = projectMarks.reduce((s, x) => s + Number(x.mark!.rawMark || 0), 0);
  const sumTotal = projectExams.reduce((s, e) => s + Number(e.totalMarks || 0), 0);
  const weighted = sumTotal > 0 ? (sumRaw / sumTotal) * Number(course?.projectWeightage || 0) : 0;
  return Math.round(weighted * 100) / 100;
}

function getMarkValueForExam(student: any, exam: any, marks: any[]) {
  if (!exam) return 0;
  const mark = getMark(student._id, exam._id, marks);
  return mark ? mark.rawMark : 0;
}

function getCOMarkValue(student: any, exam: any, marks: any[], coIndex: number) {
  if (!exam) return 0;
  const mark = getMark(student._id, exam._id, marks);
  return mark?.coMarks?.[coIndex] !== undefined ? mark.coMarks[coIndex] : 0;
}

export interface StudentRow {
  student: any;
  attendance: number;
  classPerformance: number;
  quiz: number;
  assignment: number;
  midterm: number;
  project: number;
  final: number;
  total: number;
  percent: number;
  gradeDisplay: string; // e.g. "A+ (Plus)", or the withdrawn label
  isWithdrawn: boolean;
  coMidterm: number[]; // raw CO marks per assessment, index 0-5 = CO1-CO6
  coFinal: number[];
  coProject: number[];
  coPercentage: number[]; // 0-1
  coAttained: number[]; // 0/1
  poPercentage: number[]; // 0-1, 12 entries
  poAttained: number[]; // 0/1, 12 entries
}

export function computeStudentRows(course: any, students: any[], exams: any[], marks: any[]): StudentRow[] {
  const midtermExam = findMidtermExam(exams);
  const finalExam = findFinalExam(exams);
  const projectExam = findProjectExam(exams);

  const coPoMapping: boolean[][] = course?.coPoMapping?.mapping || [];
  const maxMarks: Record<string, number[]> = course?.coPoMapping?.maxMarks || {};
  const midMax = midtermExam ? maxMarks[midtermExam._id.toString()] || [0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0];
  const finalMax = finalExam ? maxMarks[finalExam._id.toString()] || [0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0];
  const projectMax = projectExam ? maxMarks[projectExam._id.toString()] || [0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0];
  const coMaxTotal = [0, 1, 2, 3, 4, 5].map((i) => (midMax[i] || 0) + (finalMax[i] || 0) + (projectMax[i] || 0));
  const poMappedCoCount = Array.from({ length: 12 }, (_, po) =>
    coPoMapping.reduce((sum, coRow) => sum + (coRow?.[po] ? 1 : 0), 0)
  );

  return students.map((student) => {
    const attendance = getMarkValue(student, exams, marks, 'Attendance');
    const classPerformance = getMarkValue(student, exams, marks, 'ClassPerformance');
    const quiz = getAggregatedMarkValue(student, exams, marks, 'Quiz', course);
    const assignment = getAggregatedMarkValue(student, exams, marks, 'Assignment', course);
    const midterm = getMarkValueForExam(student, midtermExam, marks);
    const project = getProjectAggregatedMarkValue(student, exams, marks, course);
    const final = getMarkValueForExam(student, finalExam, marks);

    const total = Math.round(attendance + classPerformance + quiz + assignment + midterm + project + final);
    const percent = total / 100;
    const isWithdrawn = !!student.withdrawn;
    const grade = calculateLetterGrade(total, course?.gradingScale);
    const gradeDisplay = isWithdrawn ? WITHDRAWN_GRADE_LABEL : getGradeDisplay(grade.letter, grade.modifier);

    const coMidterm = [0, 1, 2, 3, 4, 5].map((i) => getCOMarkValue(student, midtermExam, marks, i));
    const coFinal = [0, 1, 2, 3, 4, 5].map((i) => getCOMarkValue(student, finalExam, marks, i));
    const coProject = [0, 1, 2, 3, 4, 5].map((i) => getCOMarkValue(student, projectExam, marks, i));

    const coPercentage = [0, 1, 2, 3, 4, 5].map((i) => {
      const raw = coMidterm[i] + coFinal[i] + coProject[i];
      return coMaxTotal[i] > 0 ? raw / coMaxTotal[i] : 0;
    });
    const coAttained = coPercentage.map((pct) => (isWithdrawn ? 0 : pct >= CO_ATTAINMENT_THRESHOLD ? 1 : 0));

    const poPercentage = Array.from({ length: 12 }, (_, po) => {
      const denom = poMappedCoCount[po];
      if (!denom) return 0;
      const numerator = coPercentage.reduce((sum, pct, co) => sum + (coPoMapping[co]?.[po] ? pct : 0), 0);
      return numerator / denom;
    });
    const poAttained = poPercentage.map((pct) => (isWithdrawn ? 0 : pct >= PO_ATTAINMENT_THRESHOLD ? 1 : 0));

    return {
      student, attendance, classPerformance, quiz, assignment, midterm, project, final,
      total, percent, gradeDisplay, isWithdrawn,
      coMidterm, coFinal, coProject, coPercentage, coAttained, poPercentage, poAttained,
    };
  });
}

export interface AttendanceStat { present: number; total: number }

export function computeAttendanceByStudent(students: any[], attendanceSessions: any[]): Map<string, AttendanceStat> {
  const sessionCount = attendanceSessions.length;
  const byStudent = new Map<string, AttendanceStat>();
  students.forEach((s) => byStudent.set(String(s._id), { present: 0, total: sessionCount }));
  attendanceSessions.forEach((session: any) => {
    (session.records || []).forEach((record: any) => {
      const stat = byStudent.get(String(record.studentId));
      if (stat && record.status === 'present') stat.present += 1;
    });
  });
  return byStudent;
}

export interface CoPoSummary {
  n: number;
  withdrawnCount: number;
  incompleteCount: number;
  gradedCount: number;
  distributionCounts: number[]; // aligned with GRADE_DISTRIBUTION
  assessmentWeights: { attendance: number; classPerformance: number; quiz: number; assignment: number; midterm: number; project: number; final: number };
  totalWeight: number;
  assessmentStats: Record<'attendance' | 'classPerformance' | 'quiz' | 'assignment' | 'midterm' | 'project' | 'final', { max: number; avg: number; min: number }>;
  coAttainedCounts: number[]; // 6
  coPercentageAvg: number[]; // 6, class average (0-1)
  poAttainedCounts: number[]; // 12
  poPercentageAvg: number[]; // 12, class average (0-1), non-withdrawn only
  sessionCount: number;
  absentStudentCount: number;
  finalTakenCount: number;
}

export function computeCoPoSummary(
  course: any,
  students: any[],
  exams: any[],
  marks: any[],
  attendanceSessions: any[],
  rows: StudentRow[],
): CoPoSummary {
  const n = students.length;
  const withdrawnCount = rows.filter((r) => r.isWithdrawn).length;
  const incompleteCount = 0; // no "incomplete" concept tracked in this system
  const gradedCount = n - withdrawnCount - incompleteCount;

  const distributionCounts = GRADE_DISTRIBUTION.map(({ grade }) => rows.filter((r) => r.gradeDisplay === grade).length);

  const assessmentWeights = {
    attendance: getExamWeight(exams, 'Attendance'),
    classPerformance: getExamWeight(exams, 'ClassPerformance'),
    quiz: exams.some((e) => e.examCategory === 'Quiz') ? Number(course.quizWeightage || 0) : 0,
    assignment: exams.some((e) => e.examCategory === 'Assignment') ? Number(course.assignmentWeightage || 0) : 0,
    midterm: findMidtermExam(exams)?.weightage || 0,
    project: exams.some((e) => e.examCategory === 'Project') ? Number(course.projectWeightage || 0) : 0,
    final: findFinalExam(exams)?.weightage || 0,
  };
  const totalWeight = Object.values(assessmentWeights).reduce((sum, w) => sum + (Number(w) || 0), 0);

  const statsFor = (values: number[]) => ({
    max: values.length ? Math.max(...values) : 0,
    avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
    min: values.length ? Math.min(...values) : 0,
  });
  const assessmentStats = {
    attendance: statsFor(rows.map((r) => r.attendance)),
    classPerformance: statsFor(rows.map((r) => r.classPerformance)),
    quiz: statsFor(rows.map((r) => r.quiz)),
    assignment: statsFor(rows.map((r) => r.assignment)),
    midterm: statsFor(rows.map((r) => r.midterm)),
    project: statsFor(rows.map((r) => r.project)),
    final: statsFor(rows.map((r) => r.final)),
  };

  const coAttainedCounts = [0, 1, 2, 3, 4, 5].map((i) => rows.reduce((sum, r) => sum + r.coAttained[i], 0));
  const coPercentageAvg = [0, 1, 2, 3, 4, 5].map((i) => (rows.length ? rows.reduce((sum, r) => sum + r.coPercentage[i], 0) / rows.length : 0));
  const poAttainedCounts = Array.from({ length: 12 }, (_, i) => rows.reduce((sum, r) => sum + r.poAttained[i], 0));
  const poPercentageAvg = Array.from({ length: 12 }, (_, i) => {
    const sum = rows.filter((r) => !r.isWithdrawn).reduce((s, r) => s + r.poPercentage[i], 0);
    return gradedCount > 0 ? sum / gradedCount : 0;
  });

  const attendanceByStudent = computeAttendanceByStudent(students, attendanceSessions);
  const absentStudentCount = students.filter((s) => {
    const stat = attendanceByStudent.get(String(s._id));
    if (!stat || stat.total === 0) return false;
    return stat.present / stat.total < ATTENDANCE_AT_RISK_THRESHOLD;
  }).length;

  const finalExam = findFinalExam(exams);
  const finalTakenCount = finalExam ? rows.filter((r) => getMark(r.student._id, finalExam._id, marks) !== undefined).length : 0;

  return {
    n, withdrawnCount, incompleteCount, gradedCount, distributionCounts,
    assessmentWeights, totalWeight, assessmentStats,
    coAttainedCounts, coPercentageAvg, poAttainedCounts, poPercentageAvg,
    sessionCount: attendanceSessions.length, absentStudentCount, finalTakenCount,
  };
}
