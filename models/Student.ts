import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IStudent extends Document {
  studentId: string;
  name: string;
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

const Student: Model<IStudent> =
  mongoose.models.Student || mongoose.model<IStudent>('Student', StudentSchema);

export default Student;
