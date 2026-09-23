/**
 * Semester names must be unique ignoring case and spacing, so the admin panel and the capstone
 * "Open Session" wizard can't create two spellings of the same term.
 */
import { cleanSemesterName, semesterNamePattern } from '../lib/semesterName';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

check('clean collapses spaces', cleanSemesterName('  Fall   2026 '), 'Fall 2026');

const cases: Array<[string, string, boolean]> = [
  ['fall 2026', 'Fall 2026', true],
  ['  FALL   2026 ', 'Fall 2026', true],
  ['Fall 2026', 'Fall  2026', true],
  ['Fall 2026', 'Fall 2027', false],
  ['Fall', 'Fall 2026', false],
  ['Fall 2026', 'Fall 2026 (old)', false],
  // Regex metacharacters in a name are literal, not patterns.
  ['Fall.2026', 'Fall 2026', false],
  ['Fall.2026', 'Fall.2026', true],
];
for (const [query, stored, expected] of cases) {
  check(`"${query}" vs "${stored}"`, semesterNamePattern(query).test(stored), expected);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
