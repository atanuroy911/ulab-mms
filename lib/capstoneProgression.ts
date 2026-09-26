// Moving capstone groups on to the next session once a stage is graded - the rules, as pure
// functions shared by the API, the wizard and the tests. Client-safe.
//
//   Track A -> B -> C; a Track C group has finished the capstone (graduates, nothing moves).
//   Each student moves by default. They're held back if their grade is F, or if they have no
//   final grade yet; a student removed from the group as withdrawn is shown as withdrawn.
//   The coordinator can change any decision. A group moves if at least one student moves.

export type Decision = 'move' | 'hold' | 'withdrawn';

/** Why a student got their default decision - shown next to it. */
export type DecisionReason = 'passed' | 'failed' | 'noGrade' | 'withdrawn' | 'graduates';

export const NEXT_TRACK: Record<string, 'B' | 'C' | null> = { A: 'B', B: 'C', C: null };

export const REASON_LABEL: Record<DecisionReason, string> = {
  passed: 'Passed',
  failed: 'Failed (F)',
  noGrade: 'No final grade yet',
  withdrawn: 'Withdrawn',
  graduates: 'Completed capstone',
};

export const DECISION_LABEL: Record<Decision, string> = {
  move: 'Moves on',
  hold: 'Held back',
  withdrawn: 'Withdrawn (W) - not copied',
};

export interface MemberForDecision {
  letter: string | null;
  score: number | null;
  missingComponents?: string[];
  /** Set for a member removed from the group. */
  removedReason?: string | null;
}

/** The pre-filled decision for one student, and why. */
export function defaultDecision(m: MemberForDecision, track: string): { decision: Decision; reason: DecisionReason } {
  if (m.removedReason === 'withdrawn') return { decision: 'withdrawn', reason: 'withdrawn' };
  if (!NEXT_TRACK[track]) return { decision: 'hold', reason: 'graduates' };
  if (m.score === null || m.letter === null || (m.missingComponents?.length ?? 0) > 0) return { decision: 'hold', reason: 'noGrade' };
  if (/^F/i.test(m.letter)) return { decision: 'hold', reason: 'failed' };
  return { decision: 'move', reason: 'passed' };
}

export type GroupOutcome = 'moves' | 'partial' | 'stays' | 'graduates' | 'alreadyMoved';

export function groupOutcome(track: string, decisions: Decision[], alreadyMoved: boolean): GroupOutcome {
  if (alreadyMoved) return 'alreadyMoved';
  if (!NEXT_TRACK[track]) return 'graduates';
  const moving = decisions.filter((d) => d === 'move').length;
  if (moving === 0) return 'stays';
  return moving === decisions.length ? 'moves' : 'partial';
}

export const OUTCOME_LABEL: Record<GroupOutcome, string> = {
  moves: 'Whole group moves',
  partial: 'Moves without some members',
  stays: 'Whole group stays',
  graduates: 'Completed capstone',
  alreadyMoved: 'Already moved',
};
