import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExam extends Document {
  displayName: string; // Renamable display name
  totalMarks: number;
  weightage: number; // Percentage weightage (not used for individual Quiz/Assignment exams)
  isRequired: boolean; // True for Mid/Final (Theory) or Lab Final/OEL (Lab)
  examType: 'midterm' | 'final' | 'labFinal' | 'oel' | 'custom'; // Type of exam
  examCategory?: 'Quiz' | 'Assignment' | 'Project' | 'Attendance' | 'MainExam' | 'ClassPerformance' | 'Others'; // Category for grouping
  numberOfCOs?: number; // For theory exams and Lab Final/OEL when needed
  numberOfQuestions?: number; // For question-wise marking
  rubricTemplateId?: mongoose.Types.ObjectId; // For Project exams: which rubric to mark with; null = direct marks, no rubric
  courseId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExamSchema: Schema = new Schema(
  {
    displayName: {
      type: String,
      required: [true, 'Please provide a display name'],
      trim: true,
    },
    totalMarks: {
      type: Number,
      required: [true, 'Please provide total marks'],
      min: [1, 'Total marks must be at least 1'],
    },
    weightage: {
      type: Number,
      required: [true, 'Please provide weightage'],
      min: [0, 'Weightage cannot be negative'],
      max: [100, 'Weightage cannot exceed 100'],
    },
    isRequired: {
      type: Boolean,
      default: false,
    },
    examType: {
      type: String,
      enum: ['midterm', 'final', 'labFinal', 'oel', 'custom'],
      required: true,
    },
    examCategory: {
      type: String,
      enum: ['Quiz', 'Assignment', 'Project', 'Attendance', 'MainExam', 'ClassPerformance', 'Others'],
      default: null,
    },
    numberOfCOs: {
      type: Number,
      min: [0, 'Number of COs cannot be negative'],
      default: null,
    },
    numberOfQuestions: {
      type: Number,
      min: [0, 'Number of Questions cannot be negative'],
      default: null,
    },
    rubricTemplateId: {
      type: Schema.Types.ObjectId,
      ref: 'RubricTemplate',
      default: null,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
ExamSchema.index({ courseId: 1 });

const Exam: Model<IExam> =
  mongoose.models.Exam || mongoose.model<IExam>('Exam', ExamSchema);

export default Exam;
