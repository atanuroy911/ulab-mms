'use client';

import { JOURNAL_SECTIONS, parseJournal } from '@/lib/journalSections';
import { cn } from '@/lib/utils';

/** A journal entry, shown as its answered questions when it was written with the guided form. */
export function JournalText({ text, className, large }: { text: string; className?: string; large?: boolean }) {
  const { answers, structured } = parseJournal(text);
  if (!structured) {
    return <p className={cn('whitespace-pre-wrap wrap-break-word', large ? 'text-base leading-relaxed' : 'text-sm', className)}>{text}</p>;
  }
  return (
    <div className={cn('space-y-3', className)}>
      {JOURNAL_SECTIONS.filter((s) => answers[s.key]).map((s) => (
        <div key={s.key}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.heading}</p>
          <p className={cn('mt-0.5 whitespace-pre-wrap wrap-break-word', large ? 'text-base leading-relaxed' : 'text-sm')}>{answers[s.key]}</p>
        </div>
      ))}
    </div>
  );
}
