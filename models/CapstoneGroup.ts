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
  assignedBy: mongoose.Types.ObjectId | null;
  unassignedAt?: Date | null;
}

/** Components whose evaluator panel the coordinator narrows down before final grading. */
export type CapstoneChoosableComponent = 'presentation' | 'report';

export const CHOOSABLE_COMPONENTS: CapstoneChoosableComponent[] = ['presentation', 'report'];

/**
 * Minimum evaluators counted per component once a choice is made (there is no maximum - any
 * number of the group's active evaluators may count). A group with this many evaluators or
 * fewer needs no choice at all: all of them count (see countedEvaluators).
 */
export const MIN_CHOSEN_EVALUATORS = 2;

/**
 * The evaluators whose marks count for a component: the coordinator's choice, or - when
 * nothing is chosen and there are too few evaluators to narrow down - every active evaluator.
 * Nothing chosen with more evaluators than that means "not decided yet": none count.
 */
export function countedEvaluators(
  chosen: Array<unknown> | undefined,
  activeEvaluatorIds: string[]
): string[] {
  // An evaluator unassigned after being chosen stops counting: their marks are kept, but a
  // grade must not rest on someone no longer on the group.
  const picked = (chosen || []).map(String).filter((id) => activeEvaluatorIds.includes(id));
  if (picked.length > 0) return picked;
  // No choice made: every assigned evaluator counts - the department's workbooks average every
  // evaluator who marked. (This used to count none once there were more than two, silently
  // zeroing 40% of the report and presentation until a coordinator chose.)
  return activeEvaluatorIds;
}

/**
 * How a group's evaluator marks for one component become the "chosen evaluators" input of
 * the grading scheme, in words the screens use:
 *   all  - every active evaluator, combined by average (or best)
 *   topK - for each student, their K highest evaluator marks, averaged
 *   pick - only the evaluators the coordinator picked, combined by average (or best)
 * Stored as chosenEvaluators / chosenAggregate / evaluatorTopK; groups saved before Top K
 * existed read as "pick" (something chosen) or "all" (nothing chosen), as they always did.
 */
export type EvaluatorRuleMode = 'all' | 'topK' | 'pick';
export interface EvaluatorRule {
  mode: EvaluatorRuleMode;
  /** Evaluators whose marks are considered (all active ones for 'all' and 'topK'). */
  counted: string[];
  k: number | null;
  how: 'mean' | 'max';
}

export function evaluatorRule(
  saved: { chosen?: Array<unknown>; how?: 'mean' | 'max' | null; topK?: number | null },
  activeEvaluatorIds: string[]
): EvaluatorRule {
  const how = saved.how === 'max' ? 'max' : 'mean';
  if (saved.topK && saved.topK > 0) {
    return { mode: 'topK', counted: activeEvaluatorIds, k: Math.min(saved.topK, Math.max(activeEvaluatorIds.length, 1)), how: 'mean' };
  }
  const counted = countedEvaluators(saved.chosen, activeEvaluatorIds);
  const picked = (saved.chosen || []).map(String).filter((id) => activeEvaluatorIds.includes(id));
  return { mode: picked.length > 0 ? 'pick' : 'all', counted, k: null, how };
}

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
   * SEPARATELY PER COMPONENT (two or more each, or all of them when there are only 1-2).
   *
   * Presentation and report are graded in different sittings by different people: a group
   * may be presented to by evaluators X and Y, while its report is read by Y and Z. The
   * previous single `chosenEvaluatorIds` list forced one choice to cover both, so choosing
   * the right pair for the presentation silently mis-scored the report (and vice versa).
   */
  chosenEvaluators: ICapstoneChosenEvaluators;
  /**
   * Per component: combine the chosen evaluators' marks by average ('mean', the default) or
   * best ('max'). Overrides the grading scheme block's aggregate for chosen-evaluator blocks.
   */
  chosenAggregate?: { presentation?: 'mean' | 'max'; report?: 'mean' | 'max' };
  /** Per component: count each student's K highest evaluator marks (see evaluatorRule). */
  evaluatorTopK?: { presentation?: number | null; report?: number | null };
  /** Google Drive / external link for the group's submitted report. */
  reportUrl?: string | null;
  /** When the supervisor/coordinator last emailed this group a journal reminder. */
  lastJournalReminderAt?: Date | null;
  /** When every member's journal was closed and the journal marks were in - the coordinator
   *  was notified then. Cleared if an entry is reopened (lib/capstoneJournalWorkflow.ts). */
  journalCompletedAt?: Date | null;
  previousGroupId?: mongoose.Types.ObjectId | null;
  /**
   * Set once this group has been moved on to the next session (lib/capstoneProgression.ts):
   * where it went, and who stayed behind and why. Its presence is what stops a second move.
   */
  progression?: {
    targetSessionId: mongoose.Types.ObjectId;
    targetGroupId: mongoose.Types.ObjectId | null;
    movedAt: Date;
    movedBy: mongoose.Types.ObjectId | null;
    stayed: Array<{ studentAccountId: mongoose.Types.ObjectId; decision: 'hold' | 'withdrawn'; reason: string }>;
  } | null;
  createdBy: mongoose.Types.ObjectId | null;
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
    // null when assigned through the /admin panel's web-admin login (lib/capstoneAuth.ts).
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
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
    chosenAggregate: {
      type: new Schema(
        {
          presentation: { type: String, enum: ['mean', 'max'], default: 'mean' },
          report: { type: String, enum: ['mean', 'max'], default: 'mean' },
        },
        { _id: false }
      ),
      default: () => ({ presentation: 'mean', report: 'mean' }),
    },
    evaluatorTopK: {
      type: new Schema(
        {
          presentation: { type: Number, min: 1, default: null },
          report: { type: Number, min: 1, default: null },
        },
        { _id: false }
      ),
      default: () => ({ presentation: null, report: null }),
    },
    reportUrl: {
      type: String,
      default: null,
    },
    lastJournalReminderAt: {
      type: Date,
      default: null,
    },
    journalCompletedAt: {
      type: Date,
      default: null,
    },
    previousGroupId: {
      type: Schema.Types.ObjectId,
      ref: 'CapstoneGroup',
      default: null,
    },
    progression: {
      type: new Schema(
        {
          targetSessionId: { type: Schema.Types.ObjectId, ref: 'CapstoneSession', required: true },
          // null when the whole group stayed behind (nothing was created).
          targetGroupId: { type: Schema.Types.ObjectId, ref: 'CapstoneGroup', default: null },
          movedAt: { type: Date, required: true },
          movedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          stayed: {
            type: [
              new Schema(
                {
                  studentAccountId: { type: Schema.Types.ObjectId, ref: 'StudentAccount', required: true },
                  decision: { type: String, enum: ['hold', 'withdrawn'], required: true },
                  reason: { type: String, default: '' },
                },
                { _id: false }
              ),
            ],
            default: [],
          },
        },
        { _id: false }
      ),
      default: null,
    },
    createdBy: {
      // null when done through the /admin panel's web-admin login, which is not a User (lib/capstoneAuth.ts).
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
