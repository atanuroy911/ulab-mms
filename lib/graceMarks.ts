import { decodeGradingScale } from '@/app/utils/grading';

export interface GraceExam {
  _id: string;
  displayName: string;
  totalMarks: number;
  weightage: number;
  examCategory?: string;
  numberOfCOs?: number;
  numberOfQuestions?: number;
}

export interface GraceStudent {
  _id: string;
  studentId: string;
  name: string;
  withdrawn?: boolean;
}

export interface GraceMark {
  studentId: string;
  examId: string;
  rawMark: number;
  preGraceMark?: number | null;
}

export interface GraceCourseConfig {
  quizWeightage?: number;
  quizAggregation?: 'average' | 'best';
  assignmentWeightage?: number;
  assignmentAggregation?: 'average' | 'best' | 'sum';
  projectWeightage?: number;
  gradingScale?: string | null;
}

export interface GraceTarget {
  exam: GraceExam;
  rawMarkBefore: number;
  rawMarkAfter: number;
}

export interface GraceCandidate {
  student: GraceStudent;
  currentPercentage: number;
  targetPercentage: number;
  neededDelta: number;
  currentGradeDisplay: string;
  nextGradeDisplay: string;
  target: GraceTarget;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
// Ceiling (not nearest) so the written raw mark always delivers at least the required contribution -
// rounding to nearest can round down and leave the student a hair under the threshold, which would
// make them eligible again next time Grace runs and let grace stack in tiny increments.
const ceil2 = (n: number) => Math.ceil(n * 100 - 1e-9) / 100;

/** Smallest grading-scale threshold strictly above the given percentage, or null if already at the top tier. */
export function findNextThreshold(percentage: number, gradingScale: string | undefined | null): number | null {
  const grades = decodeGradingScale(gradingScale).sort((a, b) => a.threshold - b.threshold);
  for (const g of grades) {
    if (g.threshold > percentage) return g.threshold;
  }
  return null;
}

// Exams whose contribution is computed directly (rawMark/totalMarks*weightage) rather than
// through an aggregated Quiz/Assignment/Project column - safe to nudge without touching CO marks.
const DIRECT_CATEGORIES = ['ClassPerformance', 'Attendance', 'Others'];

function isEligibleExam(exam: GraceExam): boolean {
  // Exams with COs or per-question breakdowns carry data (coMarks/questionMarks) that must sum to
  // rawMark - bumping rawMark alone would leave those breakdowns silently inconsistent.
  return exam.weightage > 0 && !(exam.numberOfCOs && exam.numberOfCOs > 0) && !(exam.numberOfQuestions && exam.numberOfQuestions > 0);
}

function findDirectTarget(student: GraceStudent, exams: GraceExam[], marks: GraceMark[], neededPct: number, categories: string[] = DIRECT_CATEGORIES): GraceTarget | null {
  for (const category of categories) {
    const catExams = exams.filter(e => (e.examCategory || 'Others') === category && isEligibleExam(e));
    for (const exam of catExams) {
      const mark = marks.find(m => m.studentId === student._id && m.examId === exam._id);
      if (!mark) continue;
      const rawDelta = (neededPct / exam.weightage) * exam.totalMarks;
      const rawAfter = ceil2(mark.rawMark + rawDelta);
      if (rawAfter <= exam.totalMarks + 0.005) {
        return { exam, rawMarkBefore: mark.rawMark, rawMarkAfter: Math.min(exam.totalMarks, rawAfter) };
      }
    }
  }
  return null;
}

function findAggregatedTarget(
  student: GraceStudent,
  exams: GraceExam[],
  marks: GraceMark[],
  neededPct: number,
  category: 'Quiz' | 'Assignment' | 'Project',
  categoryWeightage: number | undefined,
  aggregationMethod: 'average' | 'best' | 'sum'
): GraceTarget | null {
  if (!categoryWeightage || categoryWeightage <= 0) return null;

  // N (for 'average') and sumTotal (for 'sum') must match getAggregatedMark's real computation
  // exactly - i.e. every category exam the student has a mark for, full stop. Narrowing this to
  // only the exams we're allowed to WRITE to (isEligibleExam - no COs/questions) would undercount
  // the group and understate how much a single exam needs to move, silently under-crediting the
  // student relative to what's actually needed to cross the grade boundary.
  const categoryExams = exams.filter(e => e.examCategory === category);
  const allCatMarks = categoryExams
    .map(exam => ({ exam, mark: marks.find(m => m.studentId === student._id && m.examId === exam._id) }))
    .filter((entry): entry is { exam: GraceExam; mark: GraceMark } => !!entry.mark);

  if (allCatMarks.length === 0) return null;

  if (aggregationMethod === 'best') {
    // The aggregate is driven solely by whichever exam has the highest percentage. If that exam
    // isn't a safe write target (COs/questions), bumping anything else wouldn't move the
    // aggregate at all, so there's no valid target.
    let best = allCatMarks[0];
    let bestPct = -1;
    for (const cm of allCatMarks) {
      const pct = (cm.mark.rawMark / cm.exam.totalMarks) * 100;
      if (pct > bestPct) {
        bestPct = pct;
        best = cm;
      }
    }
    if (!isEligibleExam(best.exam)) return null;
    const rawDelta = (neededPct / categoryWeightage) * best.exam.totalMarks;
    const rawAfter = ceil2(best.mark.rawMark + rawDelta);
    if (rawAfter <= best.exam.totalMarks + 0.005) {
      return { exam: best.exam, rawMarkBefore: best.mark.rawMark, rawMarkAfter: Math.min(best.exam.totalMarks, rawAfter) };
    }
    return null;
  }

  if (aggregationMethod === 'sum') {
    const sumTotal = allCatMarks.reduce((sum, cm) => sum + cm.exam.totalMarks, 0);
    if (sumTotal <= 0) return null;
    const rawDeltaTotal = (neededPct / categoryWeightage) * sumTotal;
    for (const cm of allCatMarks) {
      if (!isEligibleExam(cm.exam)) continue;
      const rawAfter = ceil2(cm.mark.rawMark + rawDeltaTotal);
      if (rawAfter <= cm.exam.totalMarks + 0.005) {
        return { exam: cm.exam, rawMarkBefore: cm.mark.rawMark, rawMarkAfter: Math.min(cm.exam.totalMarks, rawAfter) };
      }
    }
    return null;
  }

  // average: bumping one exam's own percentage by (N * deltaAvgPct) raises the mean by deltaAvgPct.
  const n = allCatMarks.length;
  const deltaAvgPct = (neededPct * 100) / categoryWeightage;
  const deltaSinglePct = deltaAvgPct * n;
  for (const cm of allCatMarks) {
    if (!isEligibleExam(cm.exam)) continue;
    const rawDelta = (deltaSinglePct / 100) * cm.exam.totalMarks;
    const rawAfter = ceil2(cm.mark.rawMark + rawDelta);
    if (rawAfter <= cm.exam.totalMarks + 0.005) {
      return { exam: cm.exam, rawMarkBefore: cm.mark.rawMark, rawMarkAfter: Math.min(cm.exam.totalMarks, rawAfter) };
    }
  }
  return null;
}

function findGraceTarget(student: GraceStudent, exams: GraceExam[], marks: GraceMark[], neededPct: number, course: GraceCourseConfig): GraceTarget | null {
  return (
    findDirectTarget(student, exams, marks, neededPct) ||
    findAggregatedTarget(student, exams, marks, neededPct, 'Assignment', course.assignmentWeightage, course.assignmentAggregation || 'average') ||
    findAggregatedTarget(student, exams, marks, neededPct, 'Quiz', course.quizWeightage, course.quizAggregation || 'average') ||
    // Midterm/Final/Project are normally off-limits because they're usually CO-linked - but if a
    // student has maxed out everywhere else and a SPECIFIC exam here has no COs configured
    // (numberOfCOs is 0/unset), it's just as safe to nudge as any other column. Only tried once
    // every CO-free option elsewhere is exhausted, since it's the least preferred choice.
    findDirectTarget(student, exams, marks, neededPct, ['MainExam']) ||
    findAggregatedTarget(student, exams, marks, neededPct, 'Project', course.projectWeightage, 'sum')
  );
}

export function computeGraceCandidates(
  students: GraceStudent[],
  exams: GraceExam[],
  marks: GraceMark[],
  course: GraceCourseConfig,
  calculateFinalGrade: (studentId: string) => { total: number },
  calculateLetterGrade: (percentage: number, gradingScale: string | undefined | null) => { display: string }
): GraceCandidate[] {
  const candidates: GraceCandidate[] = [];

  for (const student of students) {
    if (student.withdrawn) continue;

    // Already graced - don't re-offer until that grace is removed (or the mark is otherwise
    // edited, which clears preGraceMark). Without this, a rounding-down of the raw mark delta
    // that leaves the total a hair under the threshold would make the student eligible again on
    // the very next run, letting grace stack in tiny increments.
    const alreadyGraced = marks.some(m => m.studentId === student._id && typeof m.preGraceMark === 'number');
    if (alreadyGraced) continue;

    const current = round2(calculateFinalGrade(student._id).total);
    const nextThreshold = findNextThreshold(current, course.gradingScale);
    if (nextThreshold === null) continue;

    const needed = round2(nextThreshold - current);
    if (needed <= 0 || needed > 1) continue;

    const target = findGraceTarget(student, exams, marks, needed, course);
    if (!target) continue;

    candidates.push({
      student,
      currentPercentage: current,
      targetPercentage: nextThreshold,
      neededDelta: needed,
      currentGradeDisplay: calculateLetterGrade(current, course.gradingScale).display,
      nextGradeDisplay: calculateLetterGrade(nextThreshold, course.gradingScale).display,
      target,
    });
  }

  return candidates;
}
