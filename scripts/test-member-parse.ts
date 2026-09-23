/**
 * The member line parser resolves fields by shape rather than position, so the cases where
 * it could silently put a name in the email column (or drop an ID) are worth pinning down.
 */
import { parseMemberLine } from '../app/capstone/sessions/MemberEntry';

let pass = 0;
let fail = 0;

function check(label: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

// The preferred, fully-specified form.
check('id, name, email', parseMemberLine('2021-1-60-123, Jane Doe, jane.doe@ulab.edu.bd'), {
  studentId: '2021-1-60-123',
  name: 'Jane Doe',
  email: 'jane.doe@ulab.edu.bd',
});

// Order must not matter - people paste from wherever their list already lives.
check('email first', parseMemberLine('jane.doe@ulab.edu.bd, 2021-1-60-123, Jane Doe'), {
  studentId: '2021-1-60-123',
  name: 'Jane Doe',
  email: 'jane.doe@ulab.edu.bd',
});
check('name first', parseMemberLine('Jane Doe, 2021-1-60-123'), {
  studentId: '2021-1-60-123',
  name: 'Jane Doe',
  email: '',
});

// Partial forms, which are what the URMS fetch exists to complete.
check('id only', parseMemberLine('2021-1-60-123'), {
  studentId: '2021-1-60-123',
  name: '',
  email: '',
});
check('id and name', parseMemberLine('2021-1-60-123, Jane Doe'), {
  studentId: '2021-1-60-123',
  name: 'Jane Doe',
  email: '',
});
check('id and email, no name', parseMemberLine('2021-1-60-123, jane@ulab.edu.bd'), {
  studentId: '2021-1-60-123',
  name: '',
  email: 'jane@ulab.edu.bd',
});

// Separators and whitespace.
check('tab separated', parseMemberLine('2021-1-60-123\tJane Doe\tjane@ulab.edu.bd'), {
  studentId: '2021-1-60-123',
  name: 'Jane Doe',
  email: 'jane@ulab.edu.bd',
});
check('semicolon separated', parseMemberLine('2021-1-60-123; Jane Doe; jane@ulab.edu.bd'), {
  studentId: '2021-1-60-123',
  name: 'Jane Doe',
  email: 'jane@ulab.edu.bd',
});
check('extra whitespace', parseMemberLine('  2021-1-60-123 ,   Jane Doe  '), {
  studentId: '2021-1-60-123',
  name: 'Jane Doe',
  email: '',
});

// Email is lowercased so it matches the unique index, which is lowercase.
check('email lowercased', parseMemberLine('2021-1-60-123, Jane, JANE.DOE@ULAB.EDU.BD')?.email, 'jane.doe@ulab.edu.bd');

// A 4-digit tail ID still parses (the pattern allows 3 or 4).
check('4-digit tail id', parseMemberLine('2021-1-60-1234, Jane')?.studentId, '2021-1-60-1234');

// A name split across several fields is rejoined rather than losing the surname.
check('multi-part name', parseMemberLine('2021-1-60-123, Doe, Jane')?.name, 'Doe Jane');

// Non-standard ID shapes fall back to "first token containing a digit", so a legacy format
// lands in the ID column instead of being swallowed into the name.
check('legacy id shape', parseMemberLine('CSE2021123, Jane Doe'), {
  studentId: 'CSE2021123',
  name: 'Jane Doe',
  email: '',
});

// Lines with nothing ID-like are rejected rather than creating a junk member.
check('no id at all', parseMemberLine('Jane Doe'), null);
check('empty line', parseMemberLine(''), null);
check('separators only', parseMemberLine(', , ,'), null);

// An email alone is not enough to identify a student - there is no ID to key the account on.
check('email only', parseMemberLine('jane@ulab.edu.bd'), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
