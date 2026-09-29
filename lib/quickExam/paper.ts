// A student's own quick exam paper: which set, in what order, and how it is marked. Pure (no
// database) so it can be tested directly; lib/quickExam/server.ts stores and serves it.

export interface StoredQuestion {
  stem: string;
  options: string[];
  /** Index into `options`. Never sent to a student. */
  answer: number;
}

export interface StoredSet {
  name: string;
  questions: StoredQuestion[];
}

/** Position p on the student's paper shows question `q` of the set, options in order `o`. */
export interface PaperSlot {
  q: number;
  o: number[];
}

export type Random = () => number;

/** Fisher-Yates on a copy. */
export function shuffled<T>(items: T[], random: Random = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The set for the next student: the one fewest students have been given so far, so sets stay
 * evenly spread; ties are broken at random so neighbours who start together still differ.
 */
export function pickSet(setCount: number, takenPerSet: number[], random: Random = Math.random): number {
  const counts = Array.from({ length: setCount }, (_, i) => takenPerSet[i] ?? 0);
  const least = Math.min(...counts);
  const candidates = counts.map((c, i) => (c === least ? i : -1)).filter((i) => i >= 0);
  return candidates[Math.floor(random() * candidates.length)];
}

export function makePaper(set: StoredSet, opts: { shuffleQuestions: boolean; shuffleOptions: boolean }, random: Random = Math.random): PaperSlot[] {
  const order = set.questions.map((_, i) => i);
  const qs = opts.shuffleQuestions ? shuffled(order, random) : order;
  return qs.map((q) => {
    const o = set.questions[q].options.map((_, i) => i);
    return { q, o: opts.shuffleOptions ? shuffled(o, random) : o };
  });
}

/** What a student sees: no answers, no original positions. */
export function studentView(set: StoredSet, paper: PaperSlot[]) {
  return paper.map((slot) => ({
    stem: set.questions[slot.q].stem,
    options: slot.o.map((i) => set.questions[slot.q].options[i]),
  }));
}

/**
 * `answers[p]` is the option the student picked at paper position p, as they saw it (an
 * index into slot.o), or null. Returns how many are right.
 */
export function markPaper(set: StoredSet, paper: PaperSlot[], answers: Array<number | null | undefined>) {
  const perQuestion = paper.map((slot, p) => {
    const picked = answers[p];
    if (picked === null || picked === undefined || picked < 0 || picked >= slot.o.length) return null;
    return slot.o[picked] === set.questions[slot.q].answer;
  });
  return { correct: perQuestion.filter((x) => x === true).length, answered: perQuestion.filter((x) => x !== null).length, perQuestion };
}

/** The mark written to the course: the quiz score scaled to the exam column's total, 2 dp. */
export function scaledMark(correct: number, questionCount: number, examTotal: number): number {
  if (questionCount <= 0) return 0;
  return Math.round(((correct / questionCount) * examTotal) * 100) / 100;
}
