// Quick exam question format: what a teacher pastes (by hand or from ChatGPT) and how it is
// read. Client-safe and pure - the builder's live preview and the server use the same parser.
//
//   Set A                       <- optional; separates sets in one paste
//
//   1. Question text. Markdown, $x^2$ / $$...$$ maths and | tables | are all fine,
//      and may run over several lines.
//   A. first option
//   B. second option
//   C. third option
//   D. fourth option
//
//   2. Next question ...
//
//   Answer Key:
//   1. B
//   2. D                        <- or just one letter per line, in order
//
// Forgiving about what ChatGPT tends to produce: "Q1." / "**1.**" / "1)", "A)" / "(a)" /
// "**A.**", "---" separators, \( \) and \[ \] maths, "Answer: B" under a question, and answer
// keys written "1-B, 2-C" on one line.

export interface ParsedQuestion {
  /** The number the teacher wrote, or its position when unnumbered. */
  number: number;
  /** Markdown. */
  stem: string;
  /** Markdown, in the order written (A, B, C, ...). */
  options: string[];
  /** Index into `options`, or null when the key has no answer for it. */
  answer: number | null;
  issues: string[];
}

export interface ParsedSet {
  name: string;
  questions: ParsedQuestion[];
  /** Problems with the set as a whole (answer key missing, counts disagree, ...). */
  issues: string[];
}

export interface ParsedExam {
  sets: ParsedSet[];
  /** True when every set parsed cleanly and all sets have the same number of questions. */
  ok: boolean;
  issues: string[];
}

export const MAX_OPTIONS = 8;
const LETTERS = 'ABCDEFGH';

/** \( \) -> $ $ and \[ \] -> $$ $$, the delimiters the renderer understands. */
export function normalizeMath(text: string): string {
  return text
    .replace(/\\\[/g, '$$$$')
    .replace(/\\\]/g, '$$$$')
    .replace(/\\\(\s*/g, '$')
    .replace(/\s*\\\)/g, '$');
}

const RULE = /^\s*([-*_])\1{2,}\s*$/;
const SET_HEADING = /^\s*#{0,6}\s*\**\s*set\s*[-:]?\s*([A-Za-z0-9]{1,3})\s*\**\s*:?\s*\**\s*$/i;
const KEY_HEADING = /^\s*#{0,6}\s*[*_]*\s*(?:answer\s*key|answers|answer\s*sheet|key)\s*[*_]*\s*:?\s*[*_]*\s*(.*)$/i;
const QUESTION_START = /^\s*#{0,6}\s*\**\s*(?:q(?:uestion)?\s*\.?\s*)?(\d{1,3})\s*[.):]\**(?:\s+(.*))?$/i;
const OPTION = /^\s*(?:[-*+]\s+)?\**\s*\(?([A-Ha-h])[.)]\**\s+(.*)$/;
const INLINE_ANSWER = /^\s*\**\s*(?:correct\s+)?answer\s*\**\s*[:\-]\s*\**\s*\(?([A-Ha-h])\)?\**\s*(?:[.)].*)?$/i;

/** A letter to an option index ("b" -> 1). */
const letterIndex = (l: string) => LETTERS.indexOf(l.toUpperCase());

/** Splits a paste into its sets. Text before the first "Set" heading belongs to Set A. */
function splitSets(text: string): Array<{ name: string; body: string }> {
  const lines = text.split('\n');
  const sets: Array<{ name: string; lines: string[] }> = [];
  let current: { name: string; lines: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(SET_HEADING);
    if (m) {
      current = { name: m[1].toUpperCase(), lines: [] };
      sets.push(current);
      continue;
    }
    if (!current) {
      if (!line.trim()) continue;
      current = { name: 'A', lines: [] };
      sets.push(current);
    }
    current.lines.push(line);
  }
  return sets.filter((s) => s.lines.some((l) => l.trim())).map((s) => ({ name: s.name, body: s.lines.join('\n') }));
}

interface Draft {
  number: number | null;
  stem: string[];
  options: string[][];
  inlineAnswer: number | null;
}

function parseQuestions(body: string): Draft[] {
  const drafts: Draft[] = [];
  let q: Draft | null = null;
  let blankSinceOption = false;

  for (const raw of body.split('\n')) {
    const line = RULE.test(raw) ? '' : raw;
    const blank = !line.trim();
    const option = line.match(OPTION);
    const start = line.match(QUESTION_START);
    const inline = line.match(INLINE_ANSWER);

    if (q && inline && q.options.length > 0) {
      q.inlineAnswer = letterIndex(inline[1]);
      continue;
    }

    if (q && q.options.length > 0) {
      // Collecting options.
      const expected = LETTERS[q.options.length];
      if (option && option[1].toUpperCase() === expected) {
        q.options.push([option[2]]);
        blankSinceOption = false;
      } else if (blank) {
        blankSinceOption = true;
      } else if (start) {
        q = { number: Number(start[1]), stem: [start[2] ?? ''], options: [], inlineAnswer: null };
        drafts.push(q);
        blankSinceOption = false;
      } else if (blankSinceOption) {
        // A new, unnumbered question after the last option.
        q = { number: null, stem: [line], options: [], inlineAnswer: null };
        drafts.push(q);
        blankSinceOption = false;
      } else {
        q.options[q.options.length - 1].push(line);
      }
      continue;
    }

    // Collecting a stem (or waiting for the first question).
    if (q && option && option[1].toUpperCase() === 'A' && q.stem.some((l) => l.trim())) {
      q.options.push([option[2]]);
      blankSinceOption = false;
    } else if (start && !q) {
      q = { number: Number(start[1]), stem: [start[2] ?? ''], options: [], inlineAnswer: null };
      drafts.push(q);
    } else if (!q) {
      if (blank) continue;
      q = { number: null, stem: [line], options: [], inlineAnswer: null };
      drafts.push(q);
    } else {
      q.stem.push(line);
    }
  }
  return drafts;
}

/** "1. B", "Q2) c", "3-D, 4-A", "B" - in order, with the question number when written. */
function parseAnswerKey(text: string): Array<{ number: number | null; answer: number }> {
  const out: Array<{ number: number | null; answer: number }> = [];
  const pair = /(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.):\-=]\s*\**\s*\(?([A-Ha-h])\)?(?![A-Za-z])/gi;
  const single = /^\s*(?:[-*+]\s+)?\**\s*(?:q(?:uestion)?\s*)?(?:(\d{1,3})\s*[.):\-=]?\s*)?\**\s*\(?([A-Ha-h])\)?\**(?![A-Za-z0-9])/i;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || RULE.test(line)) continue;
    const pairs = [...line.matchAll(pair)];
    if (pairs.length > 1) {
      for (const p of pairs) out.push({ number: Number(p[1]), answer: letterIndex(p[2]) });
      continue;
    }
    const m = line.match(single);
    if (m) out.push({ number: m[1] ? Number(m[1]) : null, answer: letterIndex(m[2]) });
  }
  return out;
}

/** Joins lines and drops bold that wraps the whole text ("**What is ...?**"). */
const clean = (lines: string[]) => {
  const s = lines.join('\n').trim();
  const wrapped = s.match(/^\*\*([\s\S]*)\*\*$/);
  return wrapped && !wrapped[1].includes('**') ? wrapped[1].trim() : s;
};

/** An answer-key heading: its own line, maybe with answers after it - never a sentence. */
function isKeyHeading(line: string) {
  const m = line.match(KEY_HEADING);
  return !!m && !OPTION.test(line) && /^[\s\dA-Ha-h.,;:)(\-=*]*$/.test(m[1]);
}

function parseSet(name: string, body: string): ParsedSet {
  const issues: string[] = [];
  const lines = body.split('\n');
  const keyAt = lines.findIndex(isKeyHeading);
  const questionPart = keyAt >= 0 ? lines.slice(0, keyAt).join('\n') : body;
  const keyPart = keyAt >= 0 ? [lines[keyAt].match(KEY_HEADING)![1], ...lines.slice(keyAt + 1)].join('\n') : '';

  const drafts = parseQuestions(questionPart);
  const key = keyAt >= 0 ? parseAnswerKey(keyPart) : [];
  const numbered = key.some((k) => k.number !== null);

  const questions: ParsedQuestion[] = drafts.map((d, i) => {
    const number = d.number ?? i + 1;
    const qIssues: string[] = [];
    const stem = clean(d.stem);
    const options = d.options.map((o) => clean(o));
    let answer: number | null = null;
    const fromKey = numbered ? key.find((k) => k.number === number) : key[i];
    if (fromKey) answer = fromKey.answer;
    else if (d.inlineAnswer !== null) answer = d.inlineAnswer;

    if (!stem) qIssues.push('The question text is empty.');
    if (options.length < 2) qIssues.push(options.length === 0 ? 'No options found - write them as "A. ...", "B. ...".' : 'Only one option found.');
    if (options.length > MAX_OPTIONS) qIssues.push(`At most ${MAX_OPTIONS} options.`);
    if (options.some((o) => !o)) qIssues.push('An option is empty.');
    if (new Set(options.map((o) => o.toLowerCase())).size < options.length) qIssues.push('Two options are the same.');
    if (answer === null) qIssues.push('No answer in the answer key.');
    else if (answer >= options.length) qIssues.push(`The answer (${LETTERS[answer]}) is not one of its options.`);
    return { number, stem, options, answer, issues: qIssues };
  });

  if (questions.length === 0) issues.push('No questions found.');
  if (keyAt < 0 && questions.some((q) => q.answer === null)) issues.push('No "Answer Key:" section found.');
  if (keyAt >= 0 && !numbered && key.length !== questions.length) {
    issues.push(`The answer key has ${key.length} answer${key.length === 1 ? '' : 's'} for ${questions.length} question${questions.length === 1 ? '' : 's'}.`);
  }
  if (numbered) {
    const extra = key.filter((k) => !questions.some((q) => q.number === k.number));
    if (extra.length) issues.push(`The answer key lists question${extra.length === 1 ? '' : 's'} ${extra.map((k) => k.number).join(', ')}, which ${extra.length === 1 ? "doesn't" : "don't"} exist.`);
  }
  const seen = new Set<number>();
  for (const q of questions) {
    if (seen.has(q.number)) issues.push(`Question ${q.number} appears twice.`);
    seen.add(q.number);
  }
  return { name, questions, issues };
}

/** Reads a whole paste: one or more sets, each with its own answer key. */
export function parseExamText(text: string): ParsedExam {
  const normalized = normalizeMath(text.replace(/\r\n?/g, '\n'));
  const sets = splitSets(normalized).map((s) => parseSet(s.name, s.body));
  const issues: string[] = [];
  if (sets.length === 0) issues.push('Paste your questions to begin.');
  const names = sets.map((s) => s.name);
  if (new Set(names).size < names.length) issues.push('Two sets have the same name.');
  const counts = [...new Set(sets.map((s) => s.questions.length))];
  if (counts.length > 1) issues.push(`Every set needs the same number of questions (found ${sets.map((s) => `${s.name}: ${s.questions.length}`).join(', ')}).`);
  const ok = issues.length === 0 && sets.every((s) => s.issues.length === 0 && s.questions.every((q) => q.issues.length === 0));
  return { sets, ok, issues };
}

/** Option letter for display ("A", "B", ...). */
export const optionLetter = (i: number) => LETTERS[i] ?? String(i + 1);

// ── The prompt teachers give ChatGPT (or any chatbot) ───────────────────────────────────

export interface PromptOptions {
  topic: string;
  count: number;
  sets: number;
  options: number;
  difficulty: string;
  extra?: string;
}

/**
 * A self-contained prompt: it needs no chat memory or custom instructions, so it works the
 * same in any fresh chat. The output is exactly what parseExamText reads.
 */
export function chatbotPrompt(p: PromptOptions): string {
  const letters = LETTERS.slice(0, p.options).split('');
  const setNames = LETTERS.slice(0, p.sets).split('');
  const multi = p.sets > 1;
  return [
    `Write ${p.count} multiple-choice question${p.count === 1 ? '' : 's'} on: ${p.topic || '[TOPIC]'}.`,
    `Difficulty: ${p.difficulty}. Each question has exactly ${p.options} options (${letters.join(', ')}) and exactly one correct answer.`,
    multi
      ? `Make ${p.sets} different sets (${setNames.map((s) => `Set ${s}`).join(', ')}) of ${p.count} questions each, covering the same syllabus at the same difficulty. Do not reuse a question between sets.`
      : '',
    p.extra ? `Also: ${p.extra}` : '',
    '',
    'Output rules - follow them exactly, because the text is read by a program:',
    '1. Output ONLY the questions and the answer key(s). No introduction, no explanations, no closing remarks.',
    `2. Number questions 1, 2, 3, ... like "1. Question text"${multi ? ', starting again at 1 in each set' : ''}.`,
    `3. Put each option on its own line as "A. option text", "B. option text", ... in that order.`,
    '4. Leave one blank line between questions.',
    '5. Write maths in LaTeX between single dollar signs for inline ($x^2$) or double dollar signs on their own lines for display ($$\\int_0^1 x\\,dx$$). Do not use \\( \\) or \\[ \\].',
    '6. If a table is needed, use a Markdown table (| col | col |).',
    '7. Do not mark the correct option in the question itself (no bold, no ticks, no "(correct)").',
    `8. After the last question${multi ? ' of each set' : ''}, write a line "Answer Key:" followed by one line per question like "1. B".`,
    multi ? `9. Start each set with its own line: ${setNames.map((s) => `"Set ${s}"`).join(', ')}.` : '',
    '',
    'Example of the exact format:',
    '',
    multi ? 'Set A' : '',
    multi ? '' : '',
    '1. A box has 3 red and 2 blue balls. What is $P(\\text{red})$?',
    ...letters.map((l, i) => `${l}. ${['$\\frac{3}{5}$', '$\\frac{2}{5}$', '$\\frac{1}{2}$', '$\\frac{3}{4}$', '$1$', '$0$', '$\\frac{1}{5}$', '$\\frac{4}{5}$'][i]}`),
    '',
    '2. Using the table, what is the mean of $x$?',
    '',
    '| x | 1 | 2 | 3 |',
    '|---|---|---|---|',
    '| f | 1 | 1 | 1 |',
    '',
    ...letters.map((l, i) => `${l}. ${[2, 1, 3, 6, 4, 5, 0, 7][i]}`),
    '',
    'Answer Key:',
    '1. A',
    '2. A',
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n')
    .trim();
}
