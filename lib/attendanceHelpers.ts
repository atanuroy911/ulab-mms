interface AttendanceRecordLike {
  studentId: unknown;
  status: 'present' | 'absent';
  recordedAt: Date;
  markedBy?: 'qr' | 'manual' | 'auto';
  studentIdString?: string;
}

interface StudentLike {
  _id: unknown;
  studentId: string;
}

// Returns new records for any student in `allStudents` who has no existing
// record yet, so they can be appended to a session's records array.
export function buildAbsentFillRecords(
  existingRecords: Array<{ studentId: unknown }>,
  allStudents: StudentLike[]
): AttendanceRecordLike[] {
  const recordedIds = new Set(existingRecords.map((record) => String(record.studentId)));
  const now = new Date();

  return allStudents
    .filter((student) => !recordedIds.has(String(student._id)))
    .map((student) => ({
      studentId: student._id,
      status: 'absent',
      recordedAt: now,
      markedBy: 'auto',
      studentIdString: student.studentId,
    }));
}
