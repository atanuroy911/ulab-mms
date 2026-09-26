'use client';

import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STAGES, STATUS_LABEL, stageOf, type SessionStatus, type Stage } from '@/lib/capstoneStatus';

/** What each stage is for, and what the coordinator should be doing while in it. */
const GUIDE: Record<Stage, { now: string; todo: string[] }> = {
  draft: {
    now: 'Nobody can submit anything yet.',
    todo: ['Pin a grading scheme to each track', 'Create groups, add students and supervisors', 'Assign evaluators'],
  },
  open: {
    now: 'Journals, reviews, marks and grading all happen now.',
    todo: [
      'Keep an eye on journals and marks still owed - remind graders if needed',
      'Enter paper mark sheets on graders’ behalf',
      'Check the grades page for gaps, then publish the results',
    ],
  },
  closed: {
    now: 'Results are published. Marks and journals are read-only.',
    todo: ['Move passing students on to the next session from the Grades page', 'Export the gradebook and course file'],
  },
};

/** The one forward step from each stage, and the optional step back. */
const FORWARD: Partial<Record<Stage, Stage>> = { draft: 'open', open: 'closed' };
const BACK: Partial<Record<Stage, Stage>> = { closed: 'open' };

export function SessionStageBar({
  status,
  actionLabel,
  onMove,
  canGoBackFromClosed,
}: {
  status: SessionStatus;
  /** Button text for a transition, e.g. actionLabel('open', 'closed') -> "Publish Results & Finish". */
  actionLabel: (from: string, to: string) => string;
  onMove: (to: SessionStatus) => void;
  /** Show the step back from Finished (coordinators and admins can reopen). */
  canGoBackFromClosed: boolean;
}) {
  const stage = stageOf(status);
  const current = STAGES.indexOf(stage);
  const forward = FORWARD[stage];
  const back = BACK[stage];
  const guide = GUIDE[stage];

  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      {/* The line of stages */}
      <ol className="flex items-center" aria-label="Session stages">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} className={cn('flex items-center', i < STAGES.length - 1 && 'flex-1')}>
              <span className="flex flex-col items-center gap-1 sm:flex-row sm:gap-2">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold',
                    done && 'border-emerald-500 bg-emerald-500 text-white',
                    active && 'border-primary bg-primary text-primary-foreground ring-4 ring-primary/20',
                    !done && !active && 'border-muted-foreground/30 text-muted-foreground'
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn('text-xs whitespace-nowrap sm:text-sm', active ? 'font-semibold' : 'text-muted-foreground')}>{STATUS_LABEL[s]}</span>
              </span>
              {i < STAGES.length - 1 && <span className={cn('mx-2 h-0.5 flex-1 rounded sm:mx-3', i < current ? 'bg-emerald-500' : 'bg-border')} />}
            </li>
          );
        })}
      </ol>

      {/* What this stage means, what to do, and the next step */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-medium">{guide.now}</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {guide.todo.map((t) => (
              <li key={t}>• {t}</li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {back && canGoBackFromClosed && (
            <Button variant="ghost" size="sm" onClick={() => onMove(back)} title="Step back one stage">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> {actionLabel(status, back)}
            </Button>
          )}
          {forward && (
            <Button onClick={() => onMove(forward)}>
              {actionLabel(status, forward)} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
