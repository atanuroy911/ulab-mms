export type CourseType = 'Theory' | 'Lab';

export interface DefaultExamSeed {
  displayName: string;
  examType: 'midterm' | 'final' | 'labFinal' | 'oel' | 'custom';
  examCategory: 'Quiz' | 'Assignment' | 'Project' | 'Attendance' | 'MainExam' | 'ClassPerformance' | 'Others';
  totalMarks: number;
  weightage: number;
  isRequired: boolean;
  numberOfCOs?: number;
  numberOfQuestions?: number;
}

const theoryDefaults: DefaultExamSeed[] = [
  {
    displayName: 'Performance',
    examType: 'custom',
    examCategory: 'ClassPerformance',
    totalMarks: 5,
    weightage: 5,
    isRequired: true,
  },
  {
    displayName: 'Attendance',
    examType: 'custom',
    examCategory: 'Attendance',
    totalMarks: 5,
    weightage: 5,
    isRequired: true,
  },
  {
    displayName: 'Quiz',
    examType: 'custom',
    examCategory: 'Quiz',
    totalMarks: 15,
    weightage: 15,
    isRequired: true,
  },
  {
    displayName: 'Assignment',
    examType: 'custom',
    examCategory: 'Assignment',
    totalMarks: 10,
    weightage: 10,
    isRequired: true,
  },
  {
    displayName: 'Midterm Exam',
    examType: 'midterm',
    examCategory: 'MainExam',
    totalMarks: 25,
    weightage: 25,
    isRequired: true,
    numberOfCOs: 3,
  },
  {
    displayName: 'Project',
    examType: 'custom',
    examCategory: 'Project',
    totalMarks: 1,
    weightage: 0,
    isRequired: true,
  },
  {
    displayName: 'Final Exam',
    examType: 'final',
    examCategory: 'MainExam',
    totalMarks: 40,
    weightage: 40,
    isRequired: true,
    numberOfCOs: 4,
  },
];

const labDefaults: DefaultExamSeed[] = [
  {
    displayName: 'Performance',
    examType: 'custom',
    examCategory: 'ClassPerformance',
    totalMarks: 1,
    weightage: 0,
    isRequired: true,
  },
  {
    displayName: 'Attendance',
    examType: 'custom',
    examCategory: 'Attendance',
    totalMarks: 5,
    weightage: 5,
    isRequired: true,
  },
  {
    displayName: 'Assignment',
    examType: 'custom',
    examCategory: 'Assignment',
    totalMarks: 15,
    weightage: 15,
    isRequired: true,
  },
  {
    displayName: 'CLA',
    examType: 'custom',
    examCategory: 'Others',
    totalMarks: 10,
    weightage: 10,
    isRequired: true,
  },
  {
    displayName: 'Lab Final',
    examType: 'labFinal',
    examCategory: 'MainExam',
    totalMarks: 30,
    weightage: 30,
    isRequired: true,
  },
  {
    displayName: 'Report',
    examType: 'custom',
    examCategory: 'Others',
    totalMarks: 1,
    weightage: 0,
    isRequired: true,
  },
  {
    displayName: 'OEL/CEP',
    examType: 'oel',
    examCategory: 'Project',
    totalMarks: 40,
    weightage: 40,
    isRequired: true,
  },
];

export function getDefaultExamSeeds(courseType: CourseType) {
  return courseType === 'Theory' ? theoryDefaults : labDefaults;
}
