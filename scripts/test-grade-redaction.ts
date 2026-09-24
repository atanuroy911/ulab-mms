/**
 * redactMemberForGrader: a supervisor/evaluator sees another grader's mark for a component only
 * after submitting their own for it, and the computed grade only once they owe nothing.
 */
import { redactMemberForGrader, type MemberGrade } from '../lib/capstoneGrades';
import { countedEvaluators } from '../models/CapstoneGroup';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

const SUP = 'sup';
const EV_A = 'evA';
const EV_B = 'evB';

function sub(component: MemberGrade['submissions'][number]['component'], submitterId: string, role: 'supervisor' | 'evaluator') {
  return { component, submitterId, submitterName: submitterId, submitterRole: role, counted: true, rawScore: 10, rubricMax: 33 };
}

const member: MemberGrade = {
  studentAccountId: 's1',
  studentId: '2021-1-60-123',
  name: 'Jane',
  email: null,
  score: 78.5,
  letter: 'B+',
  trace: [{ nodeId: 'total', type: 'sum', label: 'Total', value: 78.5 }],
  missingComponents: [],
  submissions: [
    sub('report', SUP, 'supervisor'),
    sub('presentation', SUP, 'supervisor'),
    sub('peer', SUP, 'supervisor'),
    sub('weeklyJournal', SUP, 'supervisor'),
    sub('report', EV_A, 'evaluator'),
    sub('presentation', EV_B, 'evaluator'),
  ],
};

// Evaluator B has submitted only presentation: sees presentation marks (theirs + supervisor's),
// never anyone's report; the grade stays hidden because report is still owed.
const evB = redactMemberForGrader(member, EV_B, 'evaluator');
check('evB sees only presentation marks', evB.submissions.map((s) => `${s.component}:${s.submitterId}`).sort(), [
  'presentation:evB',
  'presentation:sup',
]);
check('evB grade hidden', [evB.score, evB.letter, evB.trace.length], [null, null, 0]);
check('evB owes report', evB.gradeHiddenUntil, ['report']);

// Evaluator A submitted report only: sees report marks, not presentation.
const evA = redactMemberForGrader(member, EV_A, 'evaluator');
check('evA sees only report marks', evA.submissions.map((s) => `${s.component}:${s.submitterId}`).sort(), [
  'report:evA',
  'report:sup',
]);

// Supervisor submitted all four components: sees everything, including the grade.
const sup = redactMemberForGrader(member, SUP, 'supervisor');
check('supervisor sees all marks', sup.submissions.length, 6);
check('supervisor sees grade', [sup.score, sup.letter], [78.5, 'B+']);
check('supervisor owes nothing', sup.gradeHiddenUntil, undefined);

// A grader who has submitted nothing sees no other grader's marks and no grade.
const fresh = redactMemberForGrader(member, 'someoneElse', 'evaluator');
check('no submissions -> no marks shown', fresh.submissions.length, 0);
check('no submissions -> grade hidden', fresh.score, null);

// The input is never mutated (the coordinator view reuses the same object).
check('input untouched', member.submissions.length, 6);

// countedEvaluators: whose evaluator marks count toward the grade for a component.
check('explicit choice wins', countedEvaluators(['a', 'c'], ['a', 'b', 'c']), ['a', 'c']);
check('choice of more than two is kept', countedEvaluators(['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd', 'e', 'f']), ['a', 'b', 'c', 'd']);
// Previously a group with one or two evaluators and no explicit choice counted NONE of them.
check('two evaluators, no choice -> both count', countedEvaluators([], ['a', 'b']), ['a', 'b']);
check('one evaluator, no choice -> it counts', countedEvaluators(undefined, ['a']), ['a']);
check('six evaluators, no choice -> undecided, none count', countedEvaluators([], ['a', 'b', 'c', 'd', 'e', 'f']), []);
check('no evaluators -> none', countedEvaluators([], []), []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
