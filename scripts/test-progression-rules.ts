/**
 * Who moves on to the next capstone session by default, and how a group's outcome reads.
 * The full move is exercised against a database separately; these are the rules.
 */
import { defaultDecision, groupOutcome, NEXT_TRACK } from '../lib/capstoneProgression';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

check('A -> B -> C, C completes', [NEXT_TRACK.A, NEXT_TRACK.B, NEXT_TRACK.C], ['B', 'C', null]);
check('pass moves', defaultDecision({ letter: 'B+', score: 76 }, 'A'), { decision: 'move', reason: 'passed' });
check('D still passes', defaultDecision({ letter: 'D', score: 51 }, 'A'), { decision: 'move', reason: 'passed' });
check('F is held back', defaultDecision({ letter: 'F', score: 40 }, 'A'), { decision: 'hold', reason: 'failed' });
check('no total yet is held back', defaultDecision({ letter: null, score: null }, 'B'), { decision: 'hold', reason: 'noGrade' });
check('missing marks is held back', defaultDecision({ letter: 'A', score: 90, missingComponents: ['peer'] }, 'A'), { decision: 'hold', reason: 'noGrade' });
check('withdrawn member', defaultDecision({ letter: null, score: null, removedReason: 'withdrawn' }, 'A'), { decision: 'withdrawn', reason: 'withdrawn' });
check('Track C graduates', defaultDecision({ letter: 'A', score: 90 }, 'C'), { decision: 'hold', reason: 'graduates' });
check('whole group moves', groupOutcome('A', ['move', 'move'], false), 'moves');
check('partial group', groupOutcome('A', ['move', 'hold'], false), 'partial');
check('whole group stays (all F)', groupOutcome('A', ['hold', 'hold'], false), 'stays');
check('whole group stays (all W)', groupOutcome('B', ['withdrawn'], false), 'stays');
check('Track C group completes', groupOutcome('C', ['hold'], false), 'graduates');
check('already moved wins', groupOutcome('A', ['move'], true), 'alreadyMoved');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
