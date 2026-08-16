import type { CourseData, Exam, FinalGradeResult, GradeProjections, GradeTargetEstimate, Mark } from '../types';

export function getMark(marks: Mark[], examId: string): Mark | undefined {
  return marks.find(m => m.examId === examId);
}

export function getExamPercentage(rawMark: number, totalMarks: number): number {
  if (!totalMarks || totalMarks <= 0) return 0;
  return (rawMark / totalMarks) * 100;
}

/** Aggregated mark for a Quiz or Assignment category, using the course's configured aggregation method. */
function getAggregatedMark(
  courseData: CourseData,
  category: 'Quiz' | 'Assignment'
): { mark: number; totalMarks: number } | null {
  const categoryExams = courseData.exams.filter(exam => exam.examCategory === category);
  if (categoryExams.length === 0) return null;

  const categoryMarks = categoryExams
    .map(exam => getMark(courseData.marks, exam._id))
    .filter((mark): mark is Mark => mark !== undefined);

  if (categoryMarks.length === 0) return null;

  const aggregationMethod = category === 'Quiz'
    ? courseData.course.quizAggregation || 'average'
    : courseData.course.assignmentAggregation || 'average';

  const categoryWeightage = category === 'Quiz'
    ? Number(courseData.course.quizWeightage || 0)
    : Number(courseData.course.assignmentWeightage || 0);

  if (aggregationMethod === 'best') {
    let bestMark = categoryMarks[0];
    let bestValue = -1;

    categoryMarks.forEach(mark => {
      const exam = categoryExams.find(e => e._id === mark.examId);
      if (exam) {
        const percentage = getExamPercentage(mark.rawMark, exam.totalMarks);
        if (percentage > bestValue) {
          bestValue = percentage;
          bestMark = mark;
        }
      }
    });

    const exam = categoryExams.find(e => e._id === bestMark.examId);
    if (exam) {
      const weightedScore = (getExamPercentage(bestMark.rawMark, exam.totalMarks) * categoryWeightage) / 100;
      return { mark: weightedScore, totalMarks: categoryWeightage };
    }
    return null;
  }

  if (aggregationMethod === 'sum') {
    const sumRaw = categoryMarks.reduce((sum, mark) => sum + mark.rawMark, 0);
    const sumTotal = categoryMarks.reduce((sum, mark) => {
      const exam = categoryExams.find(e => e._id === mark.examId);
      return exam ? sum + exam.totalMarks : sum;
    }, 0);

    const weightedSum = sumTotal > 0 ? (getExamPercentage(sumRaw, sumTotal) * categoryWeightage) / 100 : 0;
    return { mark: weightedSum, totalMarks: categoryWeightage };
  }

  const averagePercentage = categoryMarks.reduce((sum, mark) => {
    const exam = categoryExams.find(e => e._id === mark.examId);
    if (!exam) return sum;
    return sum + getExamPercentage(mark.rawMark, exam.totalMarks);
  }, 0) / categoryMarks.length;

  const weightedScore = (averagePercentage * categoryWeightage) / 100;
  return { mark: weightedScore, totalMarks: categoryWeightage };
}

/** Aggregated mark for the Project category: sum of all raw marks / sum of all totals, scaled to projectWeightage. */
function getProjectAggregatedMark(courseData: CourseData): { mark: number; totalMarks: number } | null {
  const projectExams = courseData.exams.filter(exam => exam.examCategory === 'Project');
  if (projectExams.length === 0) return null;

  const projectMarks = projectExams
    .map(exam => getMark(courseData.marks, exam._id))
    .filter((mark): mark is Mark => mark !== undefined);

  if (projectMarks.length === 0) return null;

  const projectWeightage = Number(courseData.course.projectWeightage || 0);
  const sumRaw = projectMarks.reduce((sum, mark) => sum + mark.rawMark, 0);
  const sumTotal = projectMarks.reduce((sum, mark) => {
    const exam = projectExams.find(e => e._id === mark.examId);
    return exam ? sum + exam.totalMarks : sum;
  }, 0);

  const weightedSum = sumTotal > 0 ? (getExamPercentage(sumRaw, sumTotal) * projectWeightage) / 100 : 0;
  return { mark: weightedSum, totalMarks: projectWeightage };
}

/** Weighted final grade total + per-exam contribution breakdown, with Quiz/Assignment/Project aggregated into single rows. */
export function calculateFinalGrade(courseData: CourseData): FinalGradeResult {
  const breakdown: FinalGradeResult['breakdown'] = [];
  let totalContribution = 0;

  const hasQuizzes = courseData.exams.some(exam => exam.examCategory === 'Quiz');
  const hasAssignments = courseData.exams.some(exam => exam.examCategory === 'Assignment');
  const hasProjects = courseData.exams.some(exam => exam.examCategory === 'Project');

  courseData.exams.forEach(exam => {
    if (exam.examCategory === 'Quiz' || exam.examCategory === 'Assignment' || exam.examCategory === 'Project') return;

    const mark = getMark(courseData.marks, exam._id);
    if (!mark) return;

    const contribution = mark.weightedMark !== undefined && mark.weightedMark !== null
      ? mark.weightedMark
      : (mark.rawMark / exam.totalMarks) * exam.weightage;

    breakdown.push({
      name: exam.displayName,
      mark: mark.rawMark,
      totalMarks: exam.totalMarks,
      weightage: exam.weightage,
      contribution,
    });

    totalContribution += contribution;
  });

  if (hasQuizzes && courseData.course.quizWeightage) {
    const aggMark = getAggregatedMark(courseData, 'Quiz');
    if (aggMark) {
      const percentage = (aggMark.mark / aggMark.totalMarks) * 100;
      const contribution = (percentage * courseData.course.quizWeightage) / 100;

      breakdown.push({
        name: 'Quiz (Aggregated)',
        mark: aggMark.mark,
        totalMarks: aggMark.totalMarks,
        weightage: courseData.course.quizWeightage,
        contribution,
        isAggregated: true,
      });

      totalContribution += contribution;
    }
  }

  if (hasAssignments && courseData.course.assignmentWeightage) {
    const aggMark = getAggregatedMark(courseData, 'Assignment');
    if (aggMark) {
      const percentage = (aggMark.mark / aggMark.totalMarks) * 100;
      const contribution = (percentage * courseData.course.assignmentWeightage) / 100;

      breakdown.push({
        name: `${courseData.course.courseType === 'Lab' ? 'Assessment' : 'Assignment'} (Aggregated)`,
        mark: aggMark.mark,
        totalMarks: aggMark.totalMarks,
        weightage: courseData.course.assignmentWeightage,
        contribution,
        isAggregated: true,
      });

      totalContribution += contribution;
    }
  }

  if (hasProjects && courseData.course.projectWeightage) {
    const aggMark = getProjectAggregatedMark(courseData);
    if (aggMark) {
      const percentage = (aggMark.mark / aggMark.totalMarks) * 100;
      const contribution = (percentage * courseData.course.projectWeightage) / 100;

      breakdown.push({
        name: 'Project (Aggregated)',
        mark: aggMark.mark,
        totalMarks: aggMark.totalMarks,
        weightage: courseData.course.projectWeightage,
        contribution,
        isAggregated: true,
      });

      totalContribution += contribution;
    }
  }

  return { total: totalContribution, breakdown };
}

const GRADE_TARGETS: Array<{ grade: string; min: number; color: GradeTargetEstimate['color'] }> = [
  { grade: 'A+', min: 95, color: 'green' },
  { grade: 'A', min: 85, color: 'green' },
  { grade: 'A-', min: 80, color: 'blue' },
  { grade: 'B+', min: 75, color: 'blue' },
  { grade: 'B', min: 70, color: 'blue' },
  { grade: 'B-', min: 65, color: 'yellow' },
  { grade: 'C+', min: 60, color: 'yellow' },
  { grade: 'C-', min: 55, color: 'orange' },
  { grade: 'D', min: 50, color: 'orange' },
];

/** How much average is needed in remaining exams to hit each achievable grade target. Null once all exams are graded. */
export function calculateGradeProjections(courseData: CourseData, gradeData: FinalGradeResult): GradeProjections | null {
  const completedWeightage = gradeData.breakdown.reduce((sum, item) => sum + item.weightage, 0);
  const totalWeightage = courseData.exams.reduce((sum, exam) => {
    if (exam.examCategory === 'Quiz' && courseData.course.quizWeightage) return sum;
    if (exam.examCategory === 'Assignment' && courseData.course.assignmentWeightage) return sum;
    if (exam.examCategory === 'Project' && courseData.course.projectWeightage) return sum;
    return sum + exam.weightage;
  }, 0) + (courseData.course.quizWeightage || 0) + (courseData.course.assignmentWeightage || 0) + (courseData.course.projectWeightage || 0);

  const remainingWeightage = totalWeightage - completedWeightage;
  if (remainingWeightage <= 0) return null;

  const estimates = GRADE_TARGETS.map(target => {
    const neededFromRemaining = target.min - gradeData.total;
    const averageNeeded = remainingWeightage > 0 ? (neededFromRemaining / remainingWeightage) * 100 : 0;

    return {
      grade: target.grade,
      targetPercentage: target.min,
      averageNeeded: Math.max(0, averageNeeded),
      achievable: averageNeeded <= 100 && averageNeeded >= 0,
      color: target.color,
    };
  }).filter(e => e.achievable);

  return {
    completedWeightage,
    totalWeightage,
    remainingWeightage,
    currentPoints: gradeData.total,
    estimates,
  };
}

export function calculateTotalWeightage(exams: Exam[]): number {
  return exams.reduce((sum, exam) => sum + exam.weightage, 0);
}
