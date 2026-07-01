import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAttendanceSession extends Document {
  courseId: mongoose.Types.ObjectId;
  startedBy: mongoose.Types.ObjectId;
  date: Date;
  open: boolean;
  qrEnabled?: boolean;
  sessionCode: string;
  records: Array<{
    studentId: mongoose.Types.ObjectId;
    status: 'present' | 'absent';
    recordedAt: Date;
    markedBy?: 'qr' | 'manual' | 'auto';
    studentIdString?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSessionSchema: Schema = new Schema(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    startedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    open: {
      type: Boolean,
      default: true,
    },
    qrEnabled: {
      type: Boolean,
      default: false,
    },
    sessionCode: {
      type: String,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    records: [
      {
        studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
        status: { type: String, enum: ['present', 'absent'], required: true },
        recordedAt: { type: Date, default: Date.now },
        markedBy: { type: String, enum: ['qr', 'manual', 'auto'], default: 'manual' },
        studentIdString: { type: String },
      },
    ],
  },
  { timestamps: true }
);

// Force re-registration with the latest schema on every load, so a long-running
// dev server can't keep using a stale cached model that silently strips newer
// fields/enum values (e.g. markedBy: 'auto') from writes instead of erroring.
if (mongoose.models.AttendanceSession) {
  delete mongoose.models.AttendanceSession;
}

const AttendanceSession: Model<IAttendanceSession> = mongoose.model<IAttendanceSession>('AttendanceSession', AttendanceSessionSchema);

export default AttendanceSession;
