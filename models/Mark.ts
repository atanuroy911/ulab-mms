import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMark extends Document {
  studentId: mongoose.Types.ObjectId;
  examId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  rawMark: number;
  coMarks?: number[]; // Array of CO marks [CO1, CO2, CO3, ...]
  nonCoMark?: number; // Mark not mapped to any specific CO
  questionMarks?: number[]; // Array of Question marks [Q1, Q2, Q3, ...]
  weightedMark?: number;
  preGraceMark?: number | null; // rawMark before the last "Grace" bump was applied, cleared on any later manual edit
  createdAt: Date;
  updatedAt: Date;
}

const MarkSchema: Schema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    examId: {
      type: Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
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
    rawMark: {
      type: Number,
      required: [true, 'Please provide a mark'],
      min: [0, 'Mark cannot be negative'],
    },
    coMarks: {
      type: [Number],
      default: null,
    },
    nonCoMark: {
      type: Number,
      default: null,
    },
    questionMarks: {
      type: [Number],
      default: null,
    },
    weightedMark: {
      type: Number,
      default: null,
    },
    preGraceMark: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure a student can't have duplicate marks for the same exam
MarkSchema.index({ studentId: 1, examId: 1 }, { unique: true });
MarkSchema.index({ courseId: 1 });

const Mark: Model<IMark> =
  mongoose.models.Mark || mongoose.model<IMark>('Mark', MarkSchema);

export default Mark;
