// The guided weekly-journal form asks four questions; the answers are stored as one text
// with a heading per answer, so the supervisor view, emails and CSV export read naturally
// and older free-text entries keep working. Client-safe.

export interface JournalSection {
  key: 'worked' | 'finished' | 'problems' | 'next';
  heading: string;
  question: string;
  hint: string;
  required: boolean;
}

export const JOURNAL_SECTIONS: JournalSection[] = [
  {
    key: 'worked',
    heading: 'Worked on',
    question: 'What did you work on this week?',
    hint: 'e.g. Set up the dataset pipeline, read two papers on depth estimation, met the supervisor on Tuesday.',
    required: true,
  },
  {
    key: 'finished',
    heading: 'Finished',
    question: 'What did you finish or learn?',
    hint: 'e.g. The data loader now works for the full dataset; learned how YOLO tracking assigns IDs.',
    required: false,
  },
  {
    key: 'problems',
    heading: 'Problems',
    question: 'Did anything block you?',
    hint: 'e.g. GPU memory runs out on large batches - trying smaller batches next.',
    required: false,
  },
  {
    key: 'next',
    heading: 'Next week',
    question: "What's your plan for next week?",
    hint: 'e.g. Train the first model and compare it with the baseline.',
    required: false,
  },
];

export type JournalAnswers = Record<JournalSection['key'], string>;

export const emptyAnswers = (): JournalAnswers => ({ worked: '', finished: '', problems: '', next: '' });

/** Answers -> the stored text. Empty optional answers are left out. */
export function composeJournal(answers: JournalAnswers): string {
  return JOURNAL_SECTIONS.filter((s) => answers[s.key].trim())
    .map((s) => `${s.heading}:\n${answers[s.key].trim()}`)
    .join('\n\n');
}

/**
 * Stored text -> answers. Text that wasn't written with the form (older entries) goes
 * entirely into the first answer, so nothing is lost when it's edited.
 */
export function parseJournal(text: string): { answers: JournalAnswers; structured: boolean } {
  const answers = emptyAnswers();
  const byHeading = new Map(JOURNAL_SECTIONS.map((s) => [`${s.heading.toLowerCase()}:`, s.key]));
  let current: JournalSection['key'] | null = null;
  let sawHeading = false;
  const lines: Record<string, string[]> = { worked: [], finished: [], problems: [], next: [] };
  const preamble: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const key = byHeading.get(line.trim().toLowerCase());
    if (key) {
      current = key;
      sawHeading = true;
      continue;
    }
    if (current) lines[current].push(line);
    else preamble.push(line);
  }
  if (!sawHeading || preamble.join('').trim()) {
    answers.worked = text.trim();
    return { answers, structured: false };
  }
  for (const s of JOURNAL_SECTIONS) answers[s.key] = lines[s.key].join('\n').trim();
  return { answers, structured: true };
}
