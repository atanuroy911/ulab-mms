export interface Student {
  _id: string;
  studentId: string;
  name: string;
}

export interface Course {
  _id: string;
  name: string;
  code: string;
  semester: string;
  year: number;
  courseType: 'Theory' | 'Lab';
  isArchived: boolean;
  showFinalGrade: boolean;
  quizAggregation?: 'average' | 'best';
  quizWeightage?: number;
  assignmentAggregation?: 'average' | 'best' | 'sum';
  assignmentWeightage?: number;
  projectWeightage?: number;
  gradingScale?: string;
}

export interface Exam {
  _id: string;
  displayName: string;
  totalMarks: number;
  weightage: number;
  examType: string;
  examCategory?: 'Quiz' | 'Assignment' | 'Project' | 'Attendance' | 'MainExam' | 'ClassPerformance' | 'Others';
  numberOfCOs?: number;
  numberOfQuestions?: number;
}

export interface Mark {
  _id: string;
  examId: string;
  rawMark: number;
  coMarks?: number[];
  questionMarks?: number[];
  weightedMark?: number;
}

export interface ClassStats {
  examId: string;
  average: number;
  highest: number;
  lowest: number;
  count: number;
}

export interface AttendanceSummary {
  totalSessions: number;
  presentSessions: number;
  absentSessions: number;
  percentage: number;
}

export interface CourseData {
  student: Student;
  course: Course;
  exams: Exam[];
  marks: Mark[];
  classStats: ClassStats[];
  attendance: AttendanceSummary;
}

export interface GradeBreakdownItem {
  name: string;
  mark: number;
  totalMarks: number;
  weightage: number;
  contribution: number;
  isAggregated?: boolean;
}

export interface FinalGradeResult {
  total: number;
  breakdown: GradeBreakdownItem[];
}

export interface GradeTargetEstimate {
  grade: string;
  targetPercentage: number;
  averageNeeded: number;
  achievable: boolean;
  color: 'green' | 'blue' | 'yellow' | 'orange';
}

export interface GradeProjections {
  completedWeightage: number;
  totalWeightage: number;
  remainingWeightage: number;
  currentPoints: number;
  estimates: GradeTargetEstimate[];
}
