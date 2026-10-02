import mongoose, { Schema, Document, Model } from 'mongoose';

// One grade change on a finished course (lib/gradeChange.ts). While `sentAt` is null it is a
// draft holding the teacher's reason; marking the form sent fills in the grades and moves the
// course's official grade for that student to the new one, so the next change starts there.
export interface IGradeChange extends Document {
  courseId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  studentRecordId: mongoose.Types.ObjectId;
  studentId: string;
  studentName: string;
  oldGrade: string;
  newGrade: string;
  oldTotal: number | null;
  newTotal: number | null;
  reason: string;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const GradeChangeSchema: Schema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    studentRecordId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    studentId: { type: String, required: true, trim: true },
    studentName: { type: String, default: '' },
    oldGrade: { type: String, default: '' },
    newGrade: { type: String, default: '' },
    oldTotal: { type: Number, default: null },
    newTotal: { type: Number, default: null },
    reason: { type: String, default: '', maxlength: 1000 },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

GradeChangeSchema.index({ courseId: 1, studentRecordId: 1, sentAt: 1 });

if (mongoose.models.GradeChange) {
  delete mongoose.models.GradeChange;
}

const GradeChange: Model<IGradeChange> = mongoose.model<IGradeChange>('GradeChange', GradeChangeSchema);

export default GradeChange;
