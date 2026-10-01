import mongoose, { Document, Model, Schema } from 'mongoose';

/**
 * A message for one student, shown in their portal (the bell) whether or not an email could
 * be sent - many students brought in from URMS or added by hand have no email on file.
 * Keyed by the student ID text, so it reaches them however they were added.
 */
export interface IStudentNotification extends Document {
  /** Student ID, lower-cased. */
  studentId: string;
  kind: string;
  title: string;
  body: string;
  /** Where in the portal it leads. */
  href: string | null;
  emailed: boolean;
  readAt: Date | null;
  createdAt: Date;
}

const StudentNotificationSchema = new Schema<IStudentNotification>(
  {
    studentId: { type: String, required: true, lowercase: true, trim: true },
    kind: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
    href: { type: String, default: null },
    emailed: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

StudentNotificationSchema.index({ studentId: 1, createdAt: -1 });
// Kept for six months; the portal only shows recent ones.
StudentNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

if (mongoose.models.StudentNotification) delete mongoose.models.StudentNotification;
const StudentNotification: Model<IStudentNotification> = mongoose.model<IStudentNotification>('StudentNotification', StudentNotificationSchema);
export default StudentNotification;
