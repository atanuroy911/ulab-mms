import CapstoneGroup, { CHOOSABLE_COMPONENTS, type ICapstoneGroup } from '@/models/CapstoneGroup';
import CapstoneMarkSubmission from '@/models/CapstoneMarkSubmission';

// Evaluators an imported workbook names only by initials (group.placeholderEvaluators).
// A name is one id across a session, so the same "MGK" can be linked in every group at once.

type GroupDoc = InstanceType<typeof CapstoneGroup> & ICapstoneGroup;

/** Drops a name from the group's evaluator choice, or hands its place to the linked person. */
function swapChoice(group: GroupDoc, placeholderId: string, to: string | null) {
  for (const c of CHOOSABLE_COMPONENTS) {
    const list = (group.chosenEvaluators?.[c] || []).map(String);
    if (!list.includes(placeholderId)) continue;
    group.chosenEvaluators[c] = list.flatMap((x) => (x === placeholderId ? (to && !list.includes(to) ? [to] : []) : [x])) as never;
    group.markModified('chosenEvaluators');
  }
}

/** The name stops counting; its marks stay on record. */
export async function removePlaceholder(group: GroupDoc, placeholderId: string) {
  const entry = (group.placeholderEvaluators || []).find((p) => String(p.id) === placeholderId && !p.removedAt);
  if (!entry) return false;
  entry.removedAt = new Date();
  swapChoice(group, placeholderId, null);
  await group.save();
  return true;
}

/**
 * The name becomes a real person: its marks are re-attributed to them and they join the group
 * as an evaluator, so every grade stays the same. With `everywhere`, every group in the session
 * that still has the name is linked.
 */
export async function linkPlaceholder(group: GroupDoc, placeholderId: string, userId: string, actorId: string, everywhere: boolean) {
  const targets: GroupDoc[] = everywhere
    ? await CapstoneGroup.find({ sessionId: group.sessionId, placeholderEvaluators: { $elemMatch: { id: placeholderId, removedAt: null } } })
    : [group];
  let linked = 0;
  const skipped: Array<{ groupNumber: number; track: string; reason: string }> = [];
  for (const g of targets) {
    const skip = (reason: string) => skipped.push({ groupNumber: g.groupNumber, track: g.track, reason });
    if (String(g.supervisorId) === userId) {
      skip('they supervise this group');
      continue;
    }
    // Marks are keyed on the submitter, so the person can't take over a mark for a student
    // and part they have already marked themselves.
    const theirs = await CapstoneMarkSubmission.find({ groupId: g._id, submitterId: userId }).select('studentAccountId component').lean();
    if (
      theirs.length &&
      (await CapstoneMarkSubmission.exists({
        groupId: g._id,
        submitterId: placeholderId,
        $or: theirs.map((m) => ({ studentAccountId: m.studentAccountId, component: m.component })),
      }))
    ) {
      skip('they already have their own marks for the same students');
      continue;
    }
    await CapstoneMarkSubmission.updateMany({ groupId: g._id, submitterId: placeholderId }, { $set: { submitterId: userId } });
    if (!g.evaluators.some((e) => !e.unassignedAt && String(e.evaluatorId) === userId)) {
      g.evaluators.push({ evaluatorId: userId, assignedAt: new Date(), assignedBy: actorId } as never);
    }
    const entry = (g.placeholderEvaluators || []).find((p) => String(p.id) === placeholderId && !p.removedAt);
    if (entry) entry.removedAt = new Date();
    swapChoice(g, placeholderId, userId);
    await g.save();
    linked++;
  }
  return { linked, skipped };
}
