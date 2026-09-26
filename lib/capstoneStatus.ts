// What a capstone session's status means to people, in one place. A session goes through
// three stages: Setting up (draft) -> Running (open) -> Finished (closed). Grading and
// publishing results happen while Running; finishing publishes the results, and only then are
// students moved on to the next session. 'grading' is a stage the app used to have - sessions
// still stored with it are simply Running. Client-safe.

export type SessionStatus = 'draft' | 'open' | 'grading' | 'closed';

export const STATUS_LABEL: Record<SessionStatus, string> = {
  draft: 'Setting up',
  open: 'Running',
  grading: 'Running',
  closed: 'Finished',
};

export const STATUS_HINT: Record<SessionStatus, string> = {
  draft: 'Being set up - students and graders cannot submit anything yet.',
  open: 'Running - journals, marks and grading all happen now.',
  grading: 'Running - journals, marks and grading all happen now.',
  closed: 'Finished - results are published and kept read-only.',
};

/** Tailwind classes for a status pill. */
export const STATUS_TONE: Record<SessionStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  open: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  grading: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  closed: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
};

/** The three stages, in order. */
export const STAGES = ['draft', 'open', 'closed'] as const;
export type Stage = (typeof STAGES)[number];

/** The stage a stored status belongs to ('grading' is an older Running session). */
export const stageOf = (status: string | null | undefined): Stage => (status === 'grading' ? 'open' : ((status as Stage) || 'draft'));

/** Journals, marks and members can still change. */
export const isRunning = (status: string | null | undefined) => status === 'open' || status === 'grading';

/** A finished semester: its groups move to "Past semesters" everywhere. */
export const isPastSession = (status: string | null | undefined) => status === 'closed';

export const statusLabel = (status: string | null | undefined) => STATUS_LABEL[status as SessionStatus] || status || '';
