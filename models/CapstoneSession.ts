import mongoose, { Schema, Document, Model } from 'mongoose';

export type CapstoneTrack = 'A' | 'B' | 'C';
export type CapstoneSessionStatus = 'draft' | 'open' | 'grading' | 'closed';

export interface ICapstoneSessionTrack {
  track: CapstoneTrack;
  /** Nullable until the grading graph engine (Phase 3) exists to assign one. */
  gradingSchemeId?: mongoose.Types.ObjectId | null;
  gradingSchemeVersion?: number | null;
  isOpen: boolean;
}

export interface ICapstoneSession extends Document {
  semesterId: mongoose.Types.ObjectId;
  department: string;
  title?: string;
  tracks: ICapstoneSessionTrack[];
  journalWeekCount: number;
  status: CapstoneSessionStatus;
  statusHistory: { status: CapstoneSessionStatus; at: Date; byUserId?: mongoose.Types.ObjectId }[];
  coordinatorIds: mongoose.Types.ObjectId[];
  resultsReleasedAt?: Date | null;
  createdBy: mongoose.Types.ObjectId;
  closedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CapstoneSessionTrackSchema = new Schema(
  {
    track: { type: String, enum: ['A', 'B', 'C'], required: true },
    // Nullable until Phase 3's grading graph engine assigns one - a session can be opened
    // and used for groups/journal/marks before a formal grading scheme is wired in.
    gradingSchemeId: { type: Schema.Types.ObjectId, ref: 'GradingScheme', default: null },
    gradingSchemeVersion: { type: Number, default: null },
    isOpen: { type: Boolean, default: true },
  },
  { _id: false }
);

const StatusHistoryEntrySchema = new Schema(
  {
    status: { type: String, enum: ['draft', 'open', 'grading', 'closed'], required: true },
    at: { type: Date, default: Date.now },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const CapstoneSessionSchema: Schema = new Schema(
  {
    semesterId: {
      type: Schema.Types.ObjectId,
      ref: 'Semester',
      required: true,
    },
    department: {
      type: String,
      required: [true, 'Please provide a department code'],
      trim: true,
      uppercase: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    tracks: {
      type: [CapstoneSessionTrackSchema],
      default: [],
    },
    journalWeekCount: {
      type: Number,
      required: true,
      min: 1,
      max: 30,
      default: 12,
    },
    status: {
      type: String,
      enum: ['draft', 'open', 'grading', 'closed'],
      default: 'draft',
    },
    statusHistory: {
      type: [StatusHistoryEntrySchema],
      default: [],
    },
    coordinatorIds: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    resultsReleasedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    closedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One capstone session per department per semester. If a department genuinely needs two
// concurrent sessions, the right fix is a `section`-style field, not a second ambiguous
// session for the same semester+department.
CapstoneSessionSchema.index({ semesterId: 1, department: 1 }, { unique: true });
CapstoneSessionSchema.index({ status: 1 });
CapstoneSessionSchema.index({ 'tracks.gradingSchemeId': 1 });

if (mongoose.models.CapstoneSession) {
  delete mongoose.models.CapstoneSession;
}

const CapstoneSession: Model<ICapstoneSession> = mongoose.model<ICapstoneSession>('CapstoneSession', CapstoneSessionSchema);

export default CapstoneSession;
