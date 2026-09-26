import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWeeklyJournalEntry extends Document {
  sessionId: mongoose.Types.ObjectId;
  groupId: mongoose.Types.ObjectId;
  studentAccountId: mongoose.Types.ObjectId;
  weekNumber: number;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  workDone: string;
  submittedAt?: Date | null;
  supervisorComment: string;
  supervisorReviewedAt?: Date | null;
  supervisorId?: mongoose.Types.ObjectId | null;
  /** When the supervisor was last emailed about this entry - throttles "updated" emails. */
  supervisorNotifiedAt?: Date | null;
  /**
   * When the student was emailed this week's review. Explicitly null while an email is owed
   * (set by the review itself); absent on weeks reviewed before digests existed, which are
   * therefore never emailed again.
   */
  studentNotifiedAt?: Date | null;
  /** Set when a coordinator unlocked a reviewed entry (lib/capstoneJournalWorkflow.ts). */
  reopenedAt?: Date | null;
  reopenedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const WeeklyJournalEntrySchema: Schema = new Schema(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'CapstoneSession',
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
    weekNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    periodStart: {
      type: Date,
      default: null,
    },
    periodEnd: {
      type: Date,
      default: null,
    },
    workDone: {
      type: String,
      default: '',
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    supervisorComment: {
      type: String,
      default: '',
    },
    supervisorReviewedAt: {
      type: Date,
      default: null,
    },
    supervisorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    supervisorNotifiedAt: {
      type: Date,
      default: null,
    },
    // No default on purpose - see studentNotifiedAt above.
    studentNotifiedAt: {
      type: Date,
    },
    reopenedAt: {
      type: Date,
      default: null,
    },
    reopenedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Deliberately excludes groupId: if a student moves between groups mid-semester, their
// week-4 entry must still not be duplicable.
WeeklyJournalEntrySchema.index({ sessionId: 1, studentAccountId: 1, weekNumber: 1 }, { unique: true });
WeeklyJournalEntrySchema.index({ groupId: 1, weekNumber: 1 });
WeeklyJournalEntrySchema.index({ studentAccountId: 1, sessionId: 1 });

if (mongoose.models.WeeklyJournalEntry) {
  delete mongoose.models.WeeklyJournalEntry;
}

const WeeklyJournalEntry: Model<IWeeklyJournalEntry> = mongoose.model<IWeeklyJournalEntry>(
  'WeeklyJournalEntry',
  WeeklyJournalEntrySchema
);

export default WeeklyJournalEntry;
