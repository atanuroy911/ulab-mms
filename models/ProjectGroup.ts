import mongoose, { Schema, Document, Model } from 'mongoose';
import { IRubricScores, calculateProjectMark, RUBRIC_CRITERIA } from '@/app/utils/projectRubric';

// Re-export for convenience in server-side code
export type { IRubricScores };
export { calculateProjectMark, RUBRIC_CRITERIA };

export interface IExamRubricEntry {
  examId: mongoose.Types.ObjectId;
  scores: IRubricScores;
  markMode: 'direct' | 'rubric';
  reasoning?: string;
  directMark?: number | null; // used when markMode === 'direct'
}

export interface IProjectGroupEntry {
  _id: mongoose.Types.ObjectId;
  groupNumber: number;
  projectTitle: string;
  studentIds: mongoose.Types.ObjectId[];
  rubricScores: IRubricScores; // legacy: single rubric for group
  examRubricScores: IExamRubricEntry[]; // per-exam rubric scores + mode
  markedAt?: Date;
}

export interface IProjectGroup extends Document {
  courseId: mongoose.Types.ObjectId;
  isActive: boolean;
  maxMembersPerGroup: number;
  groups: IProjectGroupEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const RubricScoresSchema = new Schema(
  {
    c1: { type: Number, min: 0, max: 3, default: 0 },
    c2: { type: Number, min: 0, max: 3, default: 0 },
    c3: { type: Number, min: 0, max: 3, default: 0 },
    c4: { type: Number, min: 0, max: 3, default: 0 },
    c5: { type: Number, min: 0, max: 3, default: 0 },
  },
  { _id: false }
);

const ExamRubricEntrySchema = new Schema(
  {
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true },
    scores: {
      type: RubricScoresSchema,
      default: () => ({ c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 }),
    },
    markMode: { type: String, enum: ['direct', 'rubric'], default: 'direct' },
    reasoning: { type: String, default: '' },
    directMark: { type: Number, default: null },
  },
  { _id: false }
);

const ProjectGroupEntrySchema = new Schema({
  groupNumber: { type: Number, required: true },
  projectTitle: { type: String, default: '' },
  studentIds: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
  rubricScores: {
    type: RubricScoresSchema,
    default: () => ({ c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 }),
  },
  examRubricScores: { type: [ExamRubricEntrySchema], default: [] },
  markedAt: { type: Date, default: null },
});

const ProjectGroupSchema: Schema = new Schema(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      unique: true, // unique already creates an index — no need for schema.index() below
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    maxMembersPerGroup: {
      type: Number,
      default: 4,
      min: [1, 'Must allow at least 1 member per group'],
    },
    groups: [ProjectGroupEntrySchema],
  },
  { timestamps: true }
);

// Note: courseId already has an index from unique:true above — no duplicate index needed

const ProjectGroup: Model<IProjectGroup> =
  mongoose.models.ProjectGroup ||
  mongoose.model<IProjectGroup>('ProjectGroup', ProjectGroupSchema);

export default ProjectGroup;
