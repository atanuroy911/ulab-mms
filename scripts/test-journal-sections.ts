/**
 * The guided journal form stores its answers as one headed text. It must round-trip, skip
 * empty optional answers, and never lose an older free-text entry when it's edited.
 */
import { composeJournal, parseJournal, emptyAnswers } from '../lib/journalSections';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}

const full = { worked: 'Built the loader\n- and tests', finished: 'Loader done', problems: 'GPU memory', next: 'Train model' };
const text = composeJournal(full);
check('composed text is readable', text, 'Worked on:\nBuilt the loader\n- and tests\n\nFinished:\nLoader done\n\nProblems:\nGPU memory\n\nNext week:\nTrain model');
check('round trip', parseJournal(text), { answers: full, structured: true });

const partial = { ...emptyAnswers(), worked: 'Read papers', next: 'Implement baseline' };
check('empty optional answers left out', composeJournal(partial), 'Worked on:\nRead papers\n\nNext week:\nImplement baseline');
check('partial round trip', parseJournal(composeJournal(partial)).answers, partial);

const legacy = 'Met supervisor, fixed bugs.\nFinished:\nnot a heading here because text came first';
check('older free text stays whole in the first answer', parseJournal(legacy), { answers: { ...emptyAnswers(), worked: legacy }, structured: false });
check('plain text', parseJournal('Just a note'), { answers: { ...emptyAnswers(), worked: 'Just a note' }, structured: false });
check('headings are case-insensitive', parseJournal('worked on:\nx').answers.worked, 'x');
check('Windows line endings', parseJournal('Worked on:\r\nx\r\n\r\nNext week:\r\ny').answers, { ...emptyAnswers(), worked: 'x', next: 'y' });
check('only required answer', composeJournal({ ...emptyAnswers(), worked: '  hi  ' }), 'Worked on:\nhi');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
