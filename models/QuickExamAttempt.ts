import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * One student's go at a quick exam: their set, their own shuffled paper, the answers saved as
 * they go, and the score once marked. One per student per exam (unique index), so a second
 * tab or a refresh continues the same paper.
 */
export interface IQuickExamAttempt extends Document {
  quickExamId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  /** The course enrolment (Student document) the mark is written for. */
  studentRecordId: mongoose.Types.ObjectId;
  studentIdText: string;
  studentName: string;
  setIndex: number;
  /** Position p shows question `q` of the set with options in order `o`. */
  paper: Array<{ q: number; o: number[] }>;
  /** Per position: the option picked as the student saw it (index into paper[p].o), or null. */
  answers: Array<number | null>;
  startedAt: Date;
  /** Answers are refused after this (start + duration, or the exam's close time if earlier). */
  deadline: Date;
  submittedAt?: Date | null;
  /** Marked by the server after the deadline passed without a submit. */
  autoSubmitted: boolean;
  /** Times the student left full screen - each one cleared their answers and signed them out. */
  violations: number;
  lastViolationAt?: Date | null;
  correct?: number | null;
  /** The mark written to the course's exam column (scaled to its total). */
  mark?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const QuickExamAttemptSchema = new Schema<IQuickExamAttempt>(
  {
    quickExamId: { type: Schema.Types.ObjectId, ref: 'QuickExam', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    studentRecordId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    studentIdText: { type: String, required: true },
    studentName: { type: String, default: '' },
    setIndex: { type: Number, required: true, min: 0 },
    paper: {
      type: [new Schema({ q: { type: Number, required: true }, o: { type: [Number], required: true } }, { _id: false })],
      required: true,
    },
    answers: { type: [Schema.Types.Mixed], default: [] },
    startedAt: { type: Date, required: true },
    deadline: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    autoSubmitted: { type: Boolean, default: false },
    violations: { type: Number, default: 0 },
    lastViolationAt: { type: Date, default: null },
    correct: { type: Number, default: null },
    mark: { type: Number, default: null },
  },
  { timestamps: true }
);

// One attempt per student per exam - a second tab or a double click can't start a second paper.
QuickExamAttemptSchema.index({ quickExamId: 1, studentRecordId: 1 }, { unique: true });
QuickExamAttemptSchema.index({ quickExamId: 1, setIndex: 1 });

if (mongoose.models.QuickExamAttempt) {
  delete mongoose.models.QuickExamAttempt;
}

const QuickExamAttempt: Model<IQuickExamAttempt> = mongoose.model<IQuickExamAttempt>('QuickExamAttempt', QuickExamAttemptSchema);

export default QuickExamAttempt;
