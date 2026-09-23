import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDepartment extends Document {
  code: string;
  name: string;
  shortCode: string;
  icon?: string;
  headUserId?: mongoose.Types.ObjectId | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema: Schema = new Schema(
  {
    code: {
      type: String,
      required: [true, 'Please provide a department code'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: [true, 'Please provide a department name'],
      trim: true,
    },
    shortCode: {
      type: String,
      required: [true, 'Please provide a short code'],
      trim: true,
    },
    icon: {
      type: String,
      default: '',
    },
    headUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Force re-registration with the latest schema on every load, so a long-running
// dev server can't keep using a stale cached model that silently strips newer
// fields from writes instead of erroring (same pattern as models/Student.ts).
if (mongoose.models.Department) {
  delete mongoose.models.Department;
}

const Department: Model<IDepartment> = mongoose.model<IDepartment>('Department', DepartmentSchema);

export default Department;
