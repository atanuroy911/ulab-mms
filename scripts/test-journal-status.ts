/**
 * The weekly-journal review cycle: entry states, per-member progress, and when a group's
 * journal counts as done (every week closed for every active member, plus journal marks
 * when the scheme asks for them) - which is what triggers the coordinator's email.
 */
import { entryState, groupJournalStatus, isClosed } from '../lib/capstoneJournalStatus';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

const T = '2026-09-01T00:00:00Z';
check('no entry', entryState(null), 'not-started');
check('saved, not reviewed', entryState({ submittedAt: T }), 'submitted');
check('saved and reviewed', entryState({ submittedAt: T, supervisorReviewedAt: T }), 'reviewed');
check('closed without a submission', entryState({ submittedAt: null, supervisorReviewedAt: T }), 'missed');
check('empty doc', entryState({}), 'not-started');
check('reviewed is closed', isClosed('reviewed'), true);
check('missed is closed', isClosed('missed'), true);
check('submitted is not closed', isClosed('submitted'), false);

const reviewed = (s: string, w: number) => ({ studentAccountId: s, weekNumber: w, submittedAt: T, supervisorReviewedAt: T });
const missed = (s: string, w: number) => ({ studentAccountId: s, weekNumber: w, submittedAt: null, supervisorReviewedAt: T });
const submitted = (s: string, w: number) => ({ studentAccountId: s, weekNumber: w, submittedAt: T, supervisorReviewedAt: null });

// Two students, three weeks.
const allClosed = [reviewed('a', 1), reviewed('a', 2), missed('a', 3), reviewed('b', 1), reviewed('b', 2), reviewed('b', 3)];
const marks = new Map([['a', 8], ['b', 9]]);

const done = groupJournalStatus({ weekCount: 3, memberIds: ['a', 'b'], entries: allClosed, journalMarks: marks, marksRequired: true });
check('all weeks closed + marks in -> complete', done.complete, true);
check('counts closed weeks', [done.weeksClosed, done.weeksTotal], [6, 6]);
check('missed counted separately', done.members[0].missed, 1);

const noMarks = groupJournalStatus({ weekCount: 3, memberIds: ['a', 'b'], entries: allClosed, journalMarks: new Map([['a', 8]]), marksRequired: true });
check('a missing journal mark keeps it open', noMarks.complete, false);
check('marks in counted', noMarks.marksIn, 1);

const marksNotNeeded = groupJournalStatus({ weekCount: 3, memberIds: ['a', 'b'], entries: allClosed, journalMarks: new Map(), marksRequired: false });
check('scheme without journal marks: weeks alone finish it', marksNotNeeded.complete, true);

const oneAwaiting = groupJournalStatus({
  weekCount: 3,
  memberIds: ['a', 'b'],
  entries: [...allClosed.filter((e) => !(e.studentAccountId === 'b' && e.weekNumber === 3)), submitted('b', 3)],
  journalMarks: marks,
  marksRequired: true,
});
check('an entry awaiting review keeps it open', oneAwaiting.complete, false);
check('awaiting counted', oneAwaiting.awaitingReview, 1);

const oneUnwritten = groupJournalStatus({
  weekCount: 3,
  memberIds: ['a', 'b'],
  entries: allClosed.filter((e) => !(e.studentAccountId === 'b' && e.weekNumber === 3)),
  journalMarks: marks,
  marksRequired: true,
});
check('an unwritten week keeps it open', oneUnwritten.complete, false);
check('not-started counted', oneUnwritten.members[1].notStarted, 1);

// A removed member's weeks don't hold the group back (callers pass active members only),
// and a new member with nothing written does.
check(
  'only active members count',
  groupJournalStatus({ weekCount: 3, memberIds: ['a'], entries: allClosed, journalMarks: marks, marksRequired: true }).complete,
  true
);
check(
  'a newly added member reopens it',
  groupJournalStatus({ weekCount: 3, memberIds: ['a', 'b', 'c'], entries: allClosed, journalMarks: marks, marksRequired: true }).complete,
  false
);

// Entries for weeks beyond the session's week count (the count was lowered) are ignored.
check(
  'weeks beyond the count are ignored',
  groupJournalStatus({ weekCount: 2, memberIds: ['a', 'b'], entries: [...allClosed, submitted('a', 5)], journalMarks: marks, marksRequired: true }).complete,
  true
);

// Nothing to do means nothing to announce.
check('empty group never completes', groupJournalStatus({ weekCount: 3, memberIds: [], entries: [], journalMarks: new Map(), marksRequired: true }).complete, false);
check(
  'no weeks and no marks never completes',
  groupJournalStatus({ weekCount: 0, memberIds: ['a'], entries: [], journalMarks: new Map(), marksRequired: false }).complete,
  false
);
check(
  'no weeks but marks required: complete once marks are in',
  groupJournalStatus({ weekCount: 0, memberIds: ['a'], entries: [], journalMarks: new Map([['a', 7]]), marksRequired: true }).complete,
  true
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
