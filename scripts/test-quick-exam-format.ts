// Quick exam paste format: the parser the builder preview and the server share.
import { parseExamText, normalizeMath, chatbotPrompt, optionLetter } from '../lib/quickExam/format';

let pass = 0;
let fail = 0;
function check(label: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL  ${label}\n      got      ${JSON.stringify(got)}\n      expected ${JSON.stringify(expected)}`);
  }
}
const one = (text: string) => parseExamText(text).sets[0];

// ── The example from the request (ChatGPT style, unnumbered, bare-letter key) ─────────────
{
  const text = `Using the same machine information, if a randomly selected product is defective, what is the probability that it came from Machine 3?
A. 0.1020
B. 0.2041
C. 0.2450
D. 0.5510

Answer Key:

B`;
  const s = one(text);
  check('unnumbered question read', s.questions.length, 1);
  check('its stem', s.questions[0].stem, 'Using the same machine information, if a randomly selected product is defective, what is the probability that it came from Machine 3?');
  check('its four options', s.questions[0].options, ['0.1020', '0.2041', '0.2450', '0.5510']);
  check('answer B', s.questions[0].answer, 1);
  check('clean', parseExamText(text).ok, true);
  // As pasted in the request: three key letters for one question -> flagged, not guessed.
  check('key longer than the questions is flagged', one(text + '\nC\nC').issues, ['The answer key has 3 answers for 1 question.']);
}

// ── A normal numbered paper ──────────────────────────────────────────────────────────────
const paper = `1. What is $2 + 2$?
A. 3
B. 4
C. 5
D. 22

2. Which is a prime number?
A. 4
B. 6
C. 7
D. 9

3. Solve for $x$: $2x = 10$
A. 2
B. 5
C. 10
D. 20

Answer Key:
1. B
2. C
3. B`;
{
  const r = parseExamText(paper);
  check('three questions', r.sets[0].questions.map((q) => q.number), [1, 2, 3]);
  check('answers mapped by number', r.sets[0].questions.map((q) => q.answer), [1, 2, 1]);
  check('maths kept in the stem', r.sets[0].questions[0].stem, 'What is $2 + 2$?');
  check('one set called A', r.sets.map((s) => s.name), ['A']);
  check('paper ok', r.ok, true);
}

// ── ChatGPT decorations ──────────────────────────────────────────────────────────────────
{
  const text = `**Q1.** **What is the derivative of \\(x^2\\)?**
- **A)** \\(x\\)
- **B)** \\(2x\\)
- **C)** \\(x^2\\)
- **D)** \\(2\\)

---

**Q2.** Evaluate:
\\[
\\int_0^1 x\\,dx
\\]
(a) 1
(b) 1/2
(c) 2
(d) 0

---

**Answer Key:**
1-B, 2-B`;
  const s = one(text);
  check('bold Q-numbers and bullets read', s.questions.map((q) => q.number), [1, 2]);
  check('\\( \\) becomes $ $, wrapping bold dropped', s.questions[0].stem, 'What is the derivative of $x^2$?');
  check('options from "- **A)**"', s.questions[0].options, ['$x$', '$2x$', '$x^2$', '$2$']);
  check('\\[ \\] becomes $$ block across lines', s.questions[1].stem, 'Evaluate:\n$$\n\\int_0^1 x\\,dx\n$$');
  check('"(a)" options', s.questions[1].options, ['1', '1/2', '2', '0']);
  check('"1-B, 2-B" key on one line', s.questions.map((q) => q.answer), [1, 1]);
  check('clean', s.issues.length + s.questions.flatMap((q) => q.issues).length, 0);
}

// ── Tables and multi-line stems and options ────────────────────────────────────────────────
{
  const text = `1. Use the table below.

| Machine | Output | Defective |
|---|---|---|
| M1 | 50% | 2% |
| M2 | 30% | 3% |

What share of all products is defective?
A. 0.021
B. 0.025
C. 0.031
D. 0.05

2. Which statement is true?
A. The first statement,
   which runs over two lines
B. The second
C. The third

Answer Key:
1. A
2. A`;
  const s = one(text);
  check('table stays in the stem', s.questions[0].stem.includes('| M2 | 30% | 3% |') && s.questions[0].stem.endsWith('What share of all products is defective?'), true);
  check('option continuation line joined', s.questions[1].options[0], 'The first statement,\n   which runs over two lines');
  check('three options allowed', s.questions[1].options.length, 3);
  check('clean', parseExamText(text).ok, true);
}

// ── Sets ───────────────────────────────────────────────────────────────────────────────────
{
  const text = `Set A
1. A1?
A. x
B. y
Answer Key:
1. A

## Set B
1. B1?
A. x
B. y
Answer Key:
1. B`;
  const r = parseExamText(text);
  check('two sets', r.sets.map((s) => s.name), ['A', 'B']);
  check('each with its own key', r.sets.map((s) => s.questions[0].answer), [0, 1]);
  check('ok', r.ok, true);
  const uneven = parseExamText(text.replace('Answer Key:\n1. B', '2. B2?\nA. x\nB. y\nAnswer Key:\n1. B\n2. A'));
  check('sets of different lengths refused', uneven.ok, false);
  check('...with a clear message', uneven.issues[0], 'Every set needs the same number of questions (found A: 1, B: 2).');
  check('"**Set A:**" heading', parseExamText(text.replace('Set A', '**Set A:**')).sets.map((s) => s.name), ['A', 'B']);
}

// ── Mistakes the preview must catch ────────────────────────────────────────────────────────
{
  check('no answer key', one('1. Q?\nA. x\nB. y').issues, ['No "Answer Key:" section found.']);
  check('answer not among the options', one('1. Q?\nA. x\nB. y\nAnswer Key:\n1. D').questions[0].issues, ['The answer (D) is not one of its options.']);
  check('missing answer for one question', one('1. Q?\nA. x\nB. y\n\n2. R?\nA. x\nB. y\nAnswer Key:\n1. A').questions[1].issues, ['No answer in the answer key.']);
  check('only one option', one('1. Q?\nA. x\nAnswer Key:\n1. A').questions[0].issues, ['Only one option found.']);
  check('duplicate options', one('1. Q?\nA. same\nB. Same\nAnswer Key:\n1. A').questions[0].issues, ['Two options are the same.']);
  check('key names a question that does not exist', one('1. Q?\nA. x\nB. y\nAnswer Key:\n1. A\n5. B').issues, ["The answer key lists question 5, which doesn't exist."]);
  check('empty paste', parseExamText('   \n  ').issues, ['Paste your questions to begin.']);
  check('options out of order are not options', one('1. Q?\nA. x\nC. y\nAnswer Key:\n1. A').questions[0].options, ['x\nC. y']);
}

// ── Inline answers and other key styles ────────────────────────────────────────────────────
{
  check('"Answer: C" under a question', one('1. Q?\nA. x\nB. y\nC. z\nAnswer: C').questions[0].answer, 2);
  check('key "Q1) b"', one('1. Q?\nA. x\nB. y\nAnswer Key:\nQ1) b').questions[0].answer, 1);
  check('key with explanations', one('1. Q?\nA. x\nB. y\nAnswer Key:\n1. B - because y is a letter').questions[0].answer, 1);
  check('"Answers:" heading', one('1. Q?\nA. x\nB. y\nAnswers:\n1. B').questions[0].answer, 1);
  check('a stem starting with "Key" is not the key', one('1. Key terms: which is a noun?\nA. run\nB. dog\nAnswer Key:\n1. B').questions[0].stem, 'Key terms: which is a noun?');
  check('lowercase options', one('1. Q?\na) x\nb) y\nAnswer Key:\n1. b').questions[0].options, ['x', 'y']);
  check('question number alone on its line', one('1.\nWhat is it?\nA. x\nB. y\nAnswer Key:\n1. A').questions[0].stem, 'What is it?');
  check('CRLF line endings', one(paper.replace(/\n/g, '\r\n')).questions.length, 3);
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────────
check('normalizeMath', normalizeMath('\\(a\\) and \\[b\\]'), '$a$ and $$b$$');
check('optionLetter', [0, 3, 7].map(optionLetter), ['A', 'D', 'H']);

// The chatbot prompt's own example must parse cleanly - it is the format we promise.
for (const [sets, options] of [[1, 4], [2, 4], [3, 5]] as const) {
  const prompt = chatbotPrompt({ topic: 'Probability', count: 10, sets, options, difficulty: 'medium' });
  const example = prompt.slice(prompt.indexOf('Example of the exact format:') + 'Example of the exact format:'.length);
  const r = parseExamText(example);
  check(`prompt example parses (${sets} set, ${options} options)`, [r.ok, r.sets[0].questions.length, r.sets[0].questions[0].options.length], [true, 2, options]);
  check(`prompt asks for ${sets > 1 ? 'sets' : 'one set'}`, prompt.includes('Set B'), sets > 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
