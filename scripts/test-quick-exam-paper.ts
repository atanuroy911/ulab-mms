// Quick exam papers: shuffling, set assignment, marking and the mark written to the course.
import { shuffled, pickSet, makePaper, studentView, markPaper, scaledMark, type StoredSet } from '../lib/quickExam/paper';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}
// Deterministic random for repeatable tests.
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const set: StoredSet = {
  name: 'A',
  questions: Array.from({ length: 10 }, (_, i) => ({ stem: `Q${i + 1}`, options: ['w', 'x', 'y', 'z'].map((o) => `${o}${i + 1}`), answer: i % 4 })),
};

// Shuffling
const s = shuffled([1, 2, 3, 4, 5], seeded(1));
check('shuffle keeps every item', [...s].sort(), [1, 2, 3, 4, 5]);
check('shuffle leaves the input alone', shuffled([1, 2, 3]).length, 3);

// Papers
const paper = makePaper(set, { shuffleQuestions: true, shuffleOptions: true }, seeded(7));
check('every question once', paper.map((p) => p.q).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
check('every option once per question', paper.every((p) => [...p.o].sort().join() === '0,1,2,3'), true);
check('questions are reordered', paper.map((p) => p.q).join() !== '0,1,2,3,4,5,6,7,8,9', true);
check('options are reordered somewhere', paper.some((p) => p.o.join() !== '0,1,2,3'), true);
const fixed = makePaper(set, { shuffleQuestions: false, shuffleOptions: false });
check('no shuffling when turned off', [fixed.map((p) => p.q).join(), fixed.every((p) => p.o.join() === '0,1,2,3')], ['0,1,2,3,4,5,6,7,8,9', true]);

// 200 students: how often do two get the same paper? (10! x 24^10 orders - should be never)
const papers = new Set(Array.from({ length: 200 }, () => JSON.stringify(makePaper(set, { shuffleQuestions: true, shuffleOptions: true }))));
check('200 students, 200 different papers', papers.size, 200);

// What the student sees
const view = studentView(set, paper);
check('student view has no answers', JSON.stringify(view).includes('answer'), false);
check('student view shows the shuffled question', view[0].stem, set.questions[paper[0].q].stem);
check('...with its options in shuffled order', view[0].options, paper[0].o.map((i) => set.questions[paper[0].q].options[i]));

// Marking: pick, at each position, the option that is correct as the student sees it.
const allRight = paper.map((slot) => slot.o.indexOf(set.questions[slot.q].answer));
check('all correct', markPaper(set, paper, allRight).correct, 10);
const allWrong = allRight.map((i) => (i + 1) % 4);
check('all wrong', markPaper(set, paper, allWrong).correct, 0);
const half = allRight.map((i, p) => (p % 2 === 0 ? i : (i + 1) % 4));
check('half right', markPaper(set, paper, half).correct, 5);
const blanks = allRight.map((i, p) => (p < 3 ? null : i));
check('unanswered are neither right nor answered', [markPaper(set, paper, blanks).correct, markPaper(set, paper, blanks).answered], [7, 7]);
check('out-of-range picks count as unanswered', markPaper(set, paper, allRight.map(() => 9)).answered, 0);
check('short answer list', markPaper(set, paper, [allRight[0]]).correct, 1);
check('per-question result follows the paper order', markPaper(set, paper, half).perQuestion.slice(0, 2), [true, false]);

// Set assignment keeps sets even
check('first student: any set', [0, 1, 2].includes(pickSet(3, [])), true);
check('goes to the emptiest set', pickSet(3, [2, 1, 2]), 1);
const counts = [0, 0, 0];
const rnd = seeded(3);
for (let i = 0; i < 90; i++) counts[pickSet(3, counts, rnd)]++;
check('90 students over 3 sets -> 30 each', counts, [30, 30, 30]);
check('one set', pickSet(1, [5]), 0);

// The mark written to the course
check('scaled to the exam total', scaledMark(7, 10, 20), 14);
check('rounded to 2 dp', scaledMark(2, 3, 10), 6.67);
check('full marks', scaledMark(10, 10, 15), 15);
check('no questions -> 0', scaledMark(0, 0, 10), 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
