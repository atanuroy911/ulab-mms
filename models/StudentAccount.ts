import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IStudentAccount extends Document {
  studentId: string;
  name: string;
  email?: string;
  googleId?: string | null;
  department?: string;
  program?: string;
  status: 'active' | 'graduated' | 'withdrawn' | 'inactive';
  photoUrl?: string;
  firstSignInAt?: Date;
  lastSignInAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StudentAccountSchema: Schema = new Schema(
  {
    studentId: {
      type: String,
      required: [true, 'Please provide a student ID'],
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },
    googleId: {
      type: String,
      // No `default: null` - a sparse unique index still indexes an explicit null, so a null
      // default let only ONE placeholder account (created when a coordinator adds a student to
      // a capstone group, before they've ever signed in) exist; the next failed with E11000 on
      // googleId_1. Accounts not yet linked to Google must simply not have the field.
      unique: true,
      sparse: true,
    },
    department: {
      type: String,
      trim: true,
      default: '',
    },
    program: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'graduated', 'withdrawn', 'inactive'],
      default: 'active',
    },
    photoUrl: {
      type: String,
      default: '',
    },
    firstSignInAt: {
      type: Date,
      default: null,
    },
    lastSignInAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

StudentAccountSchema.index({ department: 1, status: 1 });

// Force re-registration with the latest schema on every load (same pattern as
// models/Student.ts) so a long-running dev server can't keep using a stale cached model.
if (mongoose.models.StudentAccount) {
  delete mongoose.models.StudentAccount;
}

const StudentAccount: Model<IStudentAccount> = mongoose.model<IStudentAccount>('StudentAccount', StudentAccountSchema);

export default StudentAccount;
