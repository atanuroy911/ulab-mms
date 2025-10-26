export interface Student {
  id: string;
  name: string;
  marks: { [examId: string]: number }; // Raw marks entered (unscaled)
  scaledMarks?: { [examId: string]: number }; // Scaled marks after bell curve
  roundedMarks?: { [examId: string]: number }; // Rounded scaled marks
}

export interface Exam {
  id: string;
  name: string;
  totalMarks: number;
  scalingValue: number; // Final scaled maximum
  scalingMethod?: 'bellCurve' | 'linearNormalization' | 'minMaxNormalization' | 'percentile'; // Scaling method used
}

export interface MarksData {
  students: Student[];
  exams: Exam[];
}
