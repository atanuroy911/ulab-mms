// The weekly-journal review cycle, as pure functions shared by the API and both UIs.
// Client-safe: no Node or model imports.
//
// One entry per student per week, one review pass:
//   not-started -> submitted (student saves; may keep editing) -> reviewed (supervisor gives
//   feedback once; the entry locks). A week the student never wrote can be closed by the
//   supervisor as `missed`, which also locks it. Only a coordinator can reopen a closed entry.

export type JournalEntryState = 'not-started' | 'submitted' | 'reviewed' | 'missed';

export interface JournalEntryLike {
  studentAccountId: string;
  weekNumber: number;
  submittedAt?: string | Date | null;
  supervisorReviewedAt?: string | Date | null;
}

export function entryState(entry: Omit<JournalEntryLike, 'studentAccountId' | 'weekNumber'> | null | undefined): JournalEntryState {
  if (!entry) return 'not-started';
  if (entry.supervisorReviewedAt) return entry.submittedAt ? 'reviewed' : 'missed';
  return entry.submittedAt ? 'submitted' : 'not-started';
}

/** Closed = the supervisor has dealt with it (reviewed, or closed as not submitted). */
export const isClosed = (state: JournalEntryState) => state === 'reviewed' || state === 'missed';

export interface MemberJournalStatus {
  studentAccountId: string;
  reviewed: number;
  missed: number;
  awaiting: number;
  notStarted: number;
  /** Every week closed. */
  closed: boolean;
  /** The supervisor's weekly-journal mark, when entered. */
  mark: number | null;
}

export interface GroupJournalStatus {
  weekCount: number;
  members: MemberJournalStatus[];
  weeksClosed: number;
  weeksTotal: number;
  awaitingReview: number;
  /** Whether the scheme asks the supervisor for a weekly-journal mark at all. */
  marksRequired: boolean;
  marksIn: number;
  /** Every active member's weeks are closed and (if required) every journal mark is in. */
  complete: boolean;
}

export function groupJournalStatus(params: {
  weekCount: number;
  memberIds: string[];
  entries: JournalEntryLike[];
  /** studentAccountId -> the supervisor's weekly-journal mark. */
  journalMarks: Map<string, number>;
  marksRequired: boolean;
}): GroupJournalStatus {
  const { weekCount, memberIds, entries, journalMarks, marksRequired } = params;
  const byKey = new Map(entries.map((e) => [`${String(e.studentAccountId)}:${e.weekNumber}`, e]));

  const members = memberIds.map((id) => {
    const counts = { reviewed: 0, missed: 0, awaiting: 0, notStarted: 0 };
    for (let week = 1; week <= weekCount; week++) {
      const state = entryState(byKey.get(`${id}:${week}`));
      if (state === 'reviewed') counts.reviewed++;
      else if (state === 'missed') counts.missed++;
      else if (state === 'submitted') counts.awaiting++;
      else counts.notStarted++;
    }
    return {
      studentAccountId: id,
      ...counts,
      closed: counts.reviewed + counts.missed === weekCount,
      mark: journalMarks.has(id) ? journalMarks.get(id)! : null,
    };
  });

  const weeksTotal = weekCount * memberIds.length;
  const weeksClosed = members.reduce((n, m) => n + m.reviewed + m.missed, 0);
  const marksIn = members.filter((m) => m.mark !== null).length;
  // A group with nobody in it, or nothing to review and nothing to mark, is never "done" -
  // there is nothing for the coordinator to be told about.
  const hasWork = memberIds.length > 0 && (weekCount > 0 || marksRequired);
  return {
    weekCount,
    members,
    weeksClosed,
    weeksTotal,
    awaitingReview: members.reduce((n, m) => n + m.awaiting, 0),
    marksRequired,
    marksIn,
    complete: hasWork && weeksClosed === weeksTotal && (!marksRequired || marksIn === memberIds.length),
  };
}
