import mongoose, { Schema, Document, Model } from 'mongoose';

export type CapstoneTrack = 'A' | 'B' | 'C';

export interface ICapstoneGroupMember {
  studentAccountId: mongoose.Types.ObjectId;
  studentIdText: string;
  joinedAt: Date;
  removedAt?: Date | null;
  removedReason?: 'dropped' | 'transferred' | 'withdrawn' | 'admin-correction' | null;
  removedBy?: mongoose.Types.ObjectId | null;
  role: 'member' | 'leader';
}

export interface ICapstoneGroupEvaluator {
  evaluatorId: mongoose.Types.ObjectId;
  assignedAt: Date;
  assignedBy: mongoose.Types.ObjectId;
  unassignedAt?: Date | null;
}

/** Components whose evaluator panel the coordinator narrows down before final grading. */
export type CapstoneChoosableComponent = 'presentation' | 'report';

export const CHOOSABLE_COMPONENTS: CapstoneChoosableComponent[] = ['presentation', 'report'];

/** Max evaluators whose marks may be counted per component. */
export const MAX_CHOSEN_EVALUATORS = 2;

export interface ICapstoneChosenEvaluators {
  presentation: mongoose.Types.ObjectId[];
  report: mongoose.Types.ObjectId[];
}

export interface ICapstoneGroup extends Document {
  sessionId: mongoose.Types.ObjectId;
  track: CapstoneTrack;
  groupNumber: number;
  groupName?: string;
  projectTitle: string;
  projectAbstract?: string;
  members: ICapstoneGroupMember[];
  supervisorId: mongoose.Types.ObjectId;
  evaluators: ICapstoneGroupEvaluator[];
  /**
   * Coordinator-selected evaluators whose marks count toward the final grade, held
   * SEPARATELY PER COMPONENT (max 2 each).
   *
   * Presentation and report are graded in different sittings by different people: a group
   * may be presented to by evaluators X and Y, while its report is read by Y and Z. The
   * previous single `chosenEvaluatorIds` list forced one choice to cover both, so choosing
   * the right pair for the presentation silently mis-scored the report (and vice versa).
   */
  chosenEvaluators: ICapstoneChosenEvaluators;
  /** Google Drive / external link for the group's submitted report. */
  reportUrl?: string | null;
  previousGroupId?: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MemberSchema = new Schema(
  {
    studentAccountId: { type: Schema.Types.ObjectId, ref: 'StudentAccount', required: true },
    studentIdText: { type: String, required: true, trim: true },
    joinedAt: { type: Date, default: Date.now },
    removedAt: { type: Date, default: null },
    removedReason: {
      type: String,
      enum: ['dropped', 'transferred', 'withdrawn', 'admin-correction', null],
      default: null,
    },
    removedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, enum: ['member', 'leader'], default: 'member' },
  },
  { _id: false }
);

const EvaluatorSchema = new Schema(
  {
    evaluatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedAt: { type: Date, default: Date.now },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    unassignedAt: { type: Date, default: null },
  },
  { _id: false }
);

const CapstoneGroupSchema: Schema = new Schema(
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
    groupNumber: {
      type: Number,
      required: true,
    },
    groupName: {
      type: String,
      trim: true,
      default: '',
    },
    projectTitle: {
      type: String,
      required: [true, 'Please provide a project title'],
      trim: true,
    },
    projectAbstract: {
      type: String,
      default: '',
    },
    members: {
      type: [MemberSchema],
      default: [],
    },
    supervisorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    evaluators: {
      type: [EvaluatorSchema],
      default: [],
    },
    chosenEvaluators: {
      type: new Schema(
        {
          presentation: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
          report: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
        },
        { _id: false }
      ),
      default: () => ({ presentation: [], report: [] }),
    },
    reportUrl: {
      type: String,
      default: null,
    },
    previousGroupId: {
      type: Schema.Types.ObjectId,
      ref: 'CapstoneGroup',
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

CapstoneGroupSchema.index({ sessionId: 1, track: 1, groupNumber: 1 }, { unique: true });
CapstoneGroupSchema.index({ sessionId: 1, supervisorId: 1 });
CapstoneGroupSchema.index({ 'evaluators.evaluatorId': 1, sessionId: 1 });
CapstoneGroupSchema.index({ 'members.studentAccountId': 1, sessionId: 1 });

if (mongoose.models.CapstoneGroup) {
  delete mongoose.models.CapstoneGroup;
}

// Explicit collection name, deliberately NOT the Mongoose-default 'capstonegroups' - that
// collection still holds documents and a unique index (courseId_1_groupNumber_1) from the
// pre-rebuild capstone model. This rebuilt schema has a different shape (no `courseId` at
// all) and a different unique index ({sessionId,track,groupNumber}); reusing the old
// collection name would make the SECOND group ever created here fail with a duplicate-key
// error on the stale legacy index (courseId: null collides for every group). A fresh
// collection avoids the collision entirely instead of relying on a migration to clean up
// the old one perfectly before first deploy.
const CapstoneGroup: Model<ICapstoneGroup> = mongoose.model<ICapstoneGroup>(
  'CapstoneGroup',
  CapstoneGroupSchema,
  'capstonegroups_v2'
);

export default CapstoneGroup;
