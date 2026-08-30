// Standalone, framework-free reimplementation of the final-grade math in app/course/[id]/page.tsx
// (calculateFinalGrade / getAggregatedMark / getProjectAggregatedMark). Used by pages that fetch
// course data on their own instead of receiving the shared calculateFinalGrade closure - keeping
// this in one place means every consumer (URMS grade pages included) sees the same total a
// teacher sees in the Marks/Students tabs, including any Grace-adjusted marks.

export interface FinalGradeExam {
  _id: string;
  totalMarks: number;
  weightage: number;
  examCategory?: string;
}

export interface FinalGradeMark {
  studentId: string;
  examId: string;
  rawMark: number;
  weightedMark?: number | null;
}

export interface FinalGradeCourseConfig {
  quizWeightage?: number;
  quizAggregation?: 'average' | 'best';
  assignmentWeightage?: number;
  assignmentAggregation?: 'average' | 'best' | 'sum';
  projectWeightage?: number;
}

function getExamPercentage(rawMark: number, totalMarks: number) {
  if (!totalMarks) return 0;
  return (rawMark / totalMarks) * 100;
}

function getWeightedContribution(rawMark: number, totalMarks: number, weightage: number) {
  return (getExamPercentage(rawMark, totalMarks) * weightage) / 100;
}

function getAggregatedContribution(
  studentId: string,
  category: 'Quiz' | 'Assignment',
  exams: FinalGradeExam[],
  marks: FinalGradeMark[],
  course: FinalGradeCourseConfig
): number {
  const categoryExams = exams.filter(e => e.examCategory === category);
  if (categoryExams.length === 0) return 0;

  const categoryMarks = categoryExams
    .map(exam => ({ exam, mark: marks.find(m => m.studentId === studentId && m.examId === exam._id) }))
    .filter((entry): entry is { exam: FinalGradeExam; mark: FinalGradeMark } => !!entry.mark);

  if (categoryMarks.length === 0) return 0;

  const aggregationMethod = category === 'Quiz' ? course.quizAggregation || 'average' : course.assignmentAggregation || 'average';
  const categoryWeightage = Number((category === 'Quiz' ? course.quizWeightage : course.assignmentWeightage) || 0);

  if (aggregationMethod === 'best') {
    let bestPct = -1;
    let bestEntry = categoryMarks[0];
    for (const entry of categoryMarks) {
      const pct = getExamPercentage(entry.mark.rawMark, entry.exam.totalMarks);
      if (pct > bestPct) {
        bestPct = pct;
        bestEntry = entry;
      }
    }
    return getWeightedContribution(bestEntry.mark.rawMark, bestEntry.exam.totalMarks, categoryWeightage);
  }

  if (aggregationMethod === 'sum') {
    const sumRaw = categoryMarks.reduce((sum, entry) => sum + entry.mark.rawMark, 0);
    const sumTotal = categoryMarks.reduce((sum, entry) => sum + entry.exam.totalMarks, 0);
    return sumTotal > 0 ? (getExamPercentage(sumRaw, sumTotal) * categoryWeightage) / 100 : 0;
  }

  // average
  const averagePercentage =
    categoryMarks.reduce((sum, entry) => sum + getExamPercentage(entry.mark.rawMark, entry.exam.totalMarks), 0) / categoryMarks.length;
  return (averagePercentage * categoryWeightage) / 100;
}

function getProjectContribution(
  studentId: string,
  exams: FinalGradeExam[],
  marks: FinalGradeMark[],
  course: FinalGradeCourseConfig
): number {
  const projectExams = exams.filter(e => e.examCategory === 'Project');
  if (projectExams.length === 0) return 0;

  const projectMarks = projectExams
    .map(exam => ({ exam, mark: marks.find(m => m.studentId === studentId && m.examId === exam._id) }))
    .filter((entry): entry is { exam: FinalGradeExam; mark: FinalGradeMark } => !!entry.mark);

  if (projectMarks.length === 0) return 0;

  const sumRaw = projectMarks.reduce((sum, entry) => sum + entry.mark.rawMark, 0);
  const sumTotal = projectMarks.reduce((sum, entry) => sum + entry.exam.totalMarks, 0);
  const projectWeightage = Number(course.projectWeightage || 0);
  return sumTotal > 0 ? Math.round(((sumRaw / sumTotal) * projectWeightage) * 100) / 100 : 0;
}

/** Total weighted percentage (0-100) for a student, matching calculateFinalGrade in page.tsx. */
export function calculateFinalGradeTotal(
  studentId: string,
  exams: FinalGradeExam[],
  marks: FinalGradeMark[],
  course: FinalGradeCourseConfig
): number {
  let total = 0;

  for (const exam of exams) {
    if (exam.examCategory === 'Quiz' || exam.examCategory === 'Assignment' || exam.examCategory === 'Project') {
      continue; // handled by the aggregated helpers below
    }
    const mark = marks.find(m => m.studentId === studentId && m.examId === exam._id);
    if (!mark) continue;
    total += mark.weightedMark !== undefined && mark.weightedMark !== null
      ? mark.weightedMark
      : getWeightedContribution(mark.rawMark, exam.totalMarks, exam.weightage);
  }

  if (exams.some(e => e.examCategory === 'Quiz') && course.quizWeightage) {
    total += getAggregatedContribution(studentId, 'Quiz', exams, marks, course);
  }
  if (exams.some(e => e.examCategory === 'Assignment') && course.assignmentWeightage) {
    total += getAggregatedContribution(studentId, 'Assignment', exams, marks, course);
  }
  if (exams.some(e => e.examCategory === 'Project') && course.projectWeightage) {
    total += getProjectContribution(studentId, exams, marks, course);
  }

  return total;
}
