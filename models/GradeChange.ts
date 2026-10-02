import mongoose, { Schema, Document, Model } from 'mongoose';

// One grade change (lib/gradeChange.ts) - an append-only record per change, so a student can
// have several. While `sentAt` is null it is a draft holding the teacher's reason for the
// automatic change; once sent it is final: the grades, the reason and the form exactly as
// printed (`details`), so it can be printed again. Sending moves the course's official grade.

export interface GradeChangeDetails {
  program: string;
  headName: string;
  teacherName: string;
  term: string;
  courseCode: string;
  courseTitle: string;
  section: string;
}
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
  /** auto: detected from the marks (one per student); manual: written on the full form. */
  kind: 'auto' | 'manual';
  details?: GradeChangeDetails | null;
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
    kind: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    details: {
      type: new Schema(
        {
          program: String,
          headName: String,
          teacherName: String,
          term: String,
          courseCode: String,
          courseTitle: String,
          section: String,
        },
        { _id: false }
      ),
      default: undefined,
    },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

GradeChangeSchema.index({ courseId: 1, studentRecordId: 1, sentAt: 1 });
GradeChangeSchema.index({ courseId: 1, sentAt: -1 });

if (mongoose.models.GradeChange) {
  delete mongoose.models.GradeChange;
}

const GradeChange: Model<IGradeChange> = mongoose.model<IGradeChange>('GradeChange', GradeChangeSchema);

export default GradeChange;
