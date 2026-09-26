import CapstoneGroup from '@/models/CapstoneGroup';
import WeeklyJournalEntry from '@/models/WeeklyJournalEntry';
import CapstoneMarkSubmission from '@/models/CapstoneMarkSubmission';
import CapstoneSession from '@/models/CapstoneSession';

/** What deleteSessionCascade would remove, so the UI can show the damage before confirming. */
export async function previewSessionCascade(sessionId: string) {
  const session = await CapstoneSession.findById(sessionId).select('status');
  if (!session) return null;
  const groups = await CapstoneGroup.find({ sessionId }).select('members');
  const [marks, journalEntries] = await Promise.all([
    CapstoneMarkSubmission.countDocuments({ sessionId }),
    WeeklyJournalEntry.countDocuments({ sessionId }),
  ]);
  return {
    status: session.status,
    groups: groups.length,
    students: groups.reduce((n, g) => n + g.members.filter((m) => !m.removedAt).length, 0),
    marks,
    journalEntries,
  };
}

/**
 * Deletes a whole capstone session and everything under it. Refuses on a closed session
 * unless explicitly forced - once results are snapshotted, deleting is a deliberate,
 * destructive admin action, not a routine cleanup.
 */
export async function deleteSessionCascade(sessionId: string, options: { force?: boolean } = {}) {
  const session = await CapstoneSession.findById(sessionId).select('status');
  if (!session) return { deleted: false, reason: 'not-found' as const };

  if (session.status === 'closed' && !options.force) {
    return { deleted: false, reason: 'closed' as const };
  }

  const groups = await CapstoneGroup.find({ sessionId }).select('_id');
  const groupIds = groups.map((g) => g._id);

  await Promise.all([
    WeeklyJournalEntry.deleteMany({ sessionId }),
    CapstoneMarkSubmission.deleteMany({ sessionId }),
    CapstoneGroup.deleteMany({ sessionId }),
  ]);
  await CapstoneSession.findByIdAndDelete(sessionId);

  return { deleted: true as const, groupsDeleted: groupIds.length };
}

/**
 * Deletes a single group and its journal/mark data. Refuses once the session has moved
 * past `open` (cohort should be frozen by then) - offer soft-removal of members instead.
 */
export async function deleteGroupCascade(groupId: string) {
  const group = await CapstoneGroup.findById(groupId).select('sessionId');
  if (!group) return { deleted: false, reason: 'not-found' as const };

  const session = await CapstoneSession.findById(group.sessionId).select('status');
  if (session && session.status === 'closed') {
    return { deleted: false, reason: 'session-locked' as const };
  }

  await Promise.all([
    WeeklyJournalEntry.deleteMany({ groupId }),
    CapstoneMarkSubmission.deleteMany({ groupId }),
  ]);
  await CapstoneGroup.findByIdAndDelete(groupId);

  return { deleted: true as const };
}
