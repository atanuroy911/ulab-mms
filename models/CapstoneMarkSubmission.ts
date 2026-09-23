import mongoose, { Schema, Document, Model } from 'mongoose';

export type CapstoneMarkComponent = 'report' | 'presentation' | 'peer' | 'weeklyJournal' | 'poster';
export type CapstoneSubmitterRole = 'supervisor' | 'evaluator';

export interface ICapstoneMarkSubmission extends Document {
  sessionId: mongoose.Types.ObjectId;
  track: 'A' | 'B' | 'C';
  groupId: mongoose.Types.ObjectId;
  studentAccountId: mongoose.Types.ObjectId;
  component: CapstoneMarkComponent;
  submitterId: mongoose.Types.ObjectId;
  submitterRole: CapstoneSubmitterRole;
  rawScore: number;
  rubricScores?: Record<string, number> | null;
  rubricMax?: number | null;
  comment?: string;
  status: 'draft' | 'submitted';
  submittedAt?: Date | null;
  revisionCount: number;
  lastEditedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CapstoneMarkSubmissionSchema: Schema = new Schema(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'CapstoneSession',
      required: true,
    },
    track: {
      type: String,
      enum: ['A', 'B', 'C'],
      required: true,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'CapstoneGroup',
      required: true,
    },
    studentAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentAccount',
      required: true,
    },
    component: {
      type: String,
      enum: ['report', 'presentation', 'peer', 'weeklyJournal', 'poster'],
      required: true,
    },
    // "Who typed this" - NOT supervisorId/evaluatorId. This is the fix for the old
    // CapstoneMarks bug where the unique index was keyed on supervisorId instead of the
    // actual submitter, so a second evaluator grading the same student silently collided
    // with (or overwrote) the first. See docs/capstone-marking-and-rubrics.md.
    submitterId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Descriptive only - deliberately NOT part of the unique index (see below).
    submitterRole: {
      type: String,
      enum: ['supervisor', 'evaluator'],
      required: true,
    },
    // No blanket max:100 - report is out of 33/42, presentation 45, peer 5, journal 10.
    // Ceilings are enforced per-component server-side in the submit route, not here.
    rawScore: {
      type: Number,
      required: true,
      min: 0,
    },
    rubricScores: {
      type: Schema.Types.Mixed,
      default: null,
    },
    rubricMax: {
      type: Number,
      default: null,
    },
    comment: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['draft', 'submitted'],
      default: 'submitted',
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    revisionCount: {
      type: Number,
      default: 0,
    },
    lastEditedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// The load-bearing fix: keyed on the submitter, not the role, so N evaluators produce N
// rows instead of colliding. `submitterRole` is deliberately excluded - if it were part of
// the key, someone who is both supervisor AND evaluator of the same group (the old model's
// 'both' enum shows this happens) could submit two different scores for the same student
// and have both counted. Enforce at assignment time instead: a group's supervisor must not
// also appear in its active evaluator list.
CapstoneMarkSubmissionSchema.index(
  { sessionId: 1, studentAccountId: 1, component: 1, submitterId: 1 },
  { unique: true }
);
CapstoneMarkSubmissionSchema.index({ sessionId: 1, component: 1 });
CapstoneMarkSubmissionSchema.index({ submitterId: 1, sessionId: 1, status: 1 });
CapstoneMarkSubmissionSchema.index({ groupId: 1, component: 1 });

if (mongoose.models.CapstoneMarkSubmission) {
  delete mongoose.models.CapstoneMarkSubmission;
}

const CapstoneMarkSubmission: Model<ICapstoneMarkSubmission> = mongoose.model<ICapstoneMarkSubmission>(
  'CapstoneMarkSubmission',
  CapstoneMarkSubmissionSchema
);

export default CapstoneMarkSubmission;
