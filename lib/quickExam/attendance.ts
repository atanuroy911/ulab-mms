// Taking a quick exam counts as attending class that day: on submit the student is marked
// present in the course's attendance for the date they started (Bangladesh time).
import mongoose from 'mongoose';
import AttendanceSession from '@/models/AttendanceSession';
import Student from '@/models/Student';
import { buildAbsentFillRecords } from '@/lib/attendanceHelpers';

/** "YYYY-MM-DD" of `when` in Bangladesh - the calendar day the class happened. */
export function dhakaDateKey(when: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(when);
}

/**
 * Marks the student present for that day. Uses the teacher's session for the date when there
 * is one; otherwise creates the day's session the way closing one would leave it - everyone
 * else absent - so later exam-takers that day are flipped to present. A teacher's own
 * "absent" (marked by hand or by QR) is never overridden.
 */
export async function markPresentForQuickExam(opts: {
  courseId: unknown;
  teacherId: unknown;
  studentRecordId: unknown;
  studentIdText: string;
  startedAt: Date;
}): Promise<'present' | 'already' | 'kept-absent'> {
  const key = dhakaDateKey(opts.startedAt);
  const courseId = new mongoose.Types.ObjectId(String(opts.courseId));
  const studentId = new mongoose.Types.ObjectId(String(opts.studentRecordId));
  const day = { $gte: new Date(`${key}T00:00:00.000Z`), $lte: new Date(`${key}T23:59:59.999Z`) };

  let session = await AttendanceSession.findOne({ courseId, date: day });
  if (!session) {
    const students = await Student.find({ courseId }).select('studentId').lean();
    try {
      session = await AttendanceSession.create({
        courseId,
        startedBy: opts.teacherId,
        date: new Date(`${key}T00:00:00.000Z`),
        open: false,
        // The same code the teacher's "open session" uses for this date.
        sessionCode: `${String(courseId)}-${key}`,
        records: buildAbsentFillRecords([], students),
      });
    } catch (err) {
      // Another submit created it a moment ago.
      if ((err as { code?: number }).code !== 11000) throw err;
      session = await AttendanceSession.findOne({ courseId, date: day });
      if (!session) throw err;
    }
  }

  const record = session.records.find((r) => String(r.studentId) === String(studentId));
  if (record?.status === 'present') return 'already';
  if (record && record.markedBy !== 'auto') return 'kept-absent';

  const now = new Date();
  if (record) {
    await AttendanceSession.updateOne(
      { _id: session._id, records: { $elemMatch: { studentId, status: 'absent', markedBy: 'auto' } } },
      { $set: { 'records.$.status': 'present', 'records.$.recordedAt': now } }
    );
  } else {
    await AttendanceSession.updateOne(
      { _id: session._id, 'records.studentId': { $ne: studentId } },
      { $push: { records: { studentId, status: 'present', recordedAt: now, markedBy: 'auto', studentIdString: opts.studentIdText } } }
    );
  }
  return 'present';
}
