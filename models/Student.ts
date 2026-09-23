import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IStudent extends Document {
  studentId: string;
  name: string;
  email?: string;
  probation: boolean;
  withdrawn?: boolean;
  useAlias?: boolean; // Whether this student is grouped under the course's alternate code
  courseId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema: Schema = new Schema(
  {
    studentId: {
      type: String,
      required: [true, 'Please provide a student ID'],
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Please provide a student name'],
      trim: true,
    },
    // Populated lazily - either captured from a verified @ulab.edu.bd Google sign-in
    // (attendance check-in / check-marks / project check-in), or synced in bulk from URMS
    // via the ULAB Faculty Companion extension. Never required: most students won't have
    // this until one of those happens.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: undefined,
    },
    probation: {
      type: Boolean,
      default: false,
    },
    withdrawn: {
      type: Boolean,
      default: false,
    },
    useAlias: {
      type: Boolean,
      default: false,
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
  },
  {
    timestamps: true,
  }
);

// Ensure a student can't be added twice to the same course
StudentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
// Non-unique - lets StudentAccount (the person-level identity; see models/StudentAccount.ts)
// join to every per-course Student row for a given human via a plain indexed scan, without
// a denormalized FK to maintain on every course import.
StudentSchema.index({ studentId: 1 });

// Force re-registration with the latest schema on every load. Without this,
// a long-running dev server can keep using a stale cached model from before a
// schema field was added, which causes Mongoose to silently strip that field
// from writes (strict mode) instead of erroring - a hard bug to spot.
if (mongoose.models.Student) {
  delete mongoose.models.Student;
}

const Student: Model<IStudent> = mongoose.model<IStudent>('Student', StudentSchema);

export default Student;
