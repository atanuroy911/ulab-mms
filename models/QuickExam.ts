import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * A quick MCQ exam a teacher builds from pasted Markdown (lib/quickExam/format.ts). Students
 * take it signed in; each gets one set, shuffled for them, and is marked on submit - the mark
 * goes into `examId`, one of the course's ordinary exam columns.
 */
export interface IQuickExamQuestion {
  stem: string;
  options: string[];
  /** Index into `options`. Never sent to a student. */
  answer: number;
}

export interface IQuickExamSet {
  name: string;
  questions: IQuickExamQuestion[];
}

export type QuickExamStatus = 'draft' | 'published' | 'closed';

export interface IQuickExam extends Document {
  courseId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  instructions?: string;
  /** The paste the sets were read from, kept so the teacher can edit it. */
  sourceText: string;
  sets: IQuickExamSet[];
  durationMinutes: number;
  /** Students can start from here (null = as soon as it's published). */
  opensAt?: Date | null;
  /** No one can start or answer after this (null = until the teacher closes it). */
  closesAt?: Date | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  /** After submitting: the score only, or also which answers were right. */
  showReview: boolean;
  /** The paper only shows in full screen; leaving it clears the answers and signs the student out. */
  requireFullscreen: boolean;
  /** The course exam column the score is written to (scaled to its total). Set by publish. */
  examId?: mongoose.Types.ObjectId | null;
  /** Until published: create a new Quiz column with this name and total instead. */
  newExamName?: string | null;
  newExamTotal?: number | null;
  status: QuickExamStatus;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSchema = new Schema(
  {
    stem: { type: String, required: true },
    options: { type: [String], required: true },
    answer: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const SetSchema = new Schema(
  {
    name: { type: String, required: true },
    questions: { type: [QuestionSchema], default: [] },
  },
  { _id: false }
);

const QuickExamSchema = new Schema<IQuickExam>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    instructions: { type: String, default: '' },
    sourceText: { type: String, default: '' },
    sets: { type: [SetSchema], default: [] },
    durationMinutes: { type: Number, required: true, min: 1, max: 600 },
    opensAt: { type: Date, default: null },
    closesAt: { type: Date, default: null },
    shuffleQuestions: { type: Boolean, default: true },
    shuffleOptions: { type: Boolean, default: true },
    showReview: { type: Boolean, default: false },
    requireFullscreen: { type: Boolean, default: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', default: null },
    newExamName: { type: String, default: null },
    newExamTotal: { type: Number, default: null, min: 1 },
    status: { type: String, enum: ['draft', 'published', 'closed'], default: 'draft' },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

if (mongoose.models.QuickExam) {
  delete mongoose.models.QuickExam;
}

const QuickExam: Model<IQuickExam> = mongoose.model<IQuickExam>('QuickExam', QuickExamSchema);

export default QuickExam;
