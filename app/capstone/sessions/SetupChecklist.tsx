'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CheckCircle2, Circle, Lock, ListChecks, ArrowRight, X } from 'lucide-react';

/**
 * The session's setup checklist - the "what do I do next" panel.
 *
 * Shown as a small floating button in the bottom-right corner (progress + next step) that
 * opens the full checklist in a popover, rather than a full-width card that pushed the
 * groups list down on every visit.
 *
 * Running a capstone semester is an ordered process a coordinator goes through twice a year,
 * so the ordering is not something they can be expected to hold in their head. Every step
 * reports its own live state from the server (see the setup-status route), and each one
 * either links somewhere or triggers an action right here.
 */

type StepState = 'done' | 'current' | 'todo' | 'blocked';

interface SetupStep {
  key: string;
  title: string;
  description: string;
  state: StepState;
  detail?: string;
  href?: string;
  blockedBy?: string;
}

interface SetupStatus {
  status: string;
  steps: SetupStep[];
  done: number;
  total: number;
  nextStepKey: string | null;
}

interface Props {
  sessionId: string;
  /** Bumped by the parent after any change, to re-fetch status. */
  refreshKey?: number;
  /** Step actions the parent owns (opening a dialog, moving status). */
  onAction?: (stepKey: string) => void;
}

const STATE_ICON: Record<StepState, typeof Circle> = {
  done: CheckCircle2,
  current: Circle,
  todo: Circle,
  blocked: Lock,
};

const STATE_TONE: Record<StepState, string> = {
  done: 'text-emerald-500',
  current: 'text-primary',
  todo: 'text-muted-foreground',
  blocked: 'text-muted-foreground/50',
};

/** Steps the parent handles in-page rather than by navigation. */
const IN_PAGE_ACTIONS: Record<string, string> = {
  pin: 'Pin schemes',
  groups: 'Add a group',
  evaluators: 'Assign evaluators',
  open: 'Open session',
  marks: 'Request marks',
  chosen: 'Choose evaluators',
};

export function SetupChecklist({ sessionId, refreshKey = 0, onAction }: Props) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/capstone/sessions/${sessionId}/setup-status`);
      const data = await res.json();
      if (res.ok) setStatus(data);
    } catch {
      // The checklist is a guide, not a gate - if it can't load, the page still works.
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!status) return null;

  const nextStep = status.steps.find((s) => s.key === status.nextStepKey);
  const complete = status.done === status.total;
  const pct = Math.round((status.done / status.total) * 100);

  // Runs an in-page step action and closes the popover so the dialog it opens isn't hidden.
  const runAction = (key: string) => {
    setOpen(false);
    onAction?.(key);
  };

  // `compact` is the per-row "Go"; otherwise it's the labelled primary action for the next step.
  const actionButton = (step: SetupStep, compact: boolean) => {
    const label = compact ? 'Go' : IN_PAGE_ACTIONS[step.key] || 'Go';
    const className = compact ? 'h-7 shrink-0 px-2 text-xs' : undefined;
    const variant = compact ? 'ghost' : 'default';
    if (step.href) {
      return (
        <Button size="sm" variant={variant} className={className} asChild>
          <Link href={step.href} onClick={() => setOpen(false)}>
            {label}
            {!compact && <ArrowRight className="ml-1.5 h-3.5 w-3.5" />}
          </Link>
        </Button>
      );
    }
    if (onAction && (IN_PAGE_ACTIONS[step.key] || !compact)) {
      return (
        <Button size="sm" variant={variant} className={className} onClick={() => runAction(step.key)}>
          {label}
          {!compact && <ArrowRight className="ml-1.5 h-3.5 w-3.5" />}
        </Button>
      );
    }
    return null;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Session setup: ${status.done} of ${status.total} done`}
          // Sits beside the site-wide bug-report button (components/BugReportButton.tsx:
          // fixed bottom-6 right-6, h-12 w-12) - same bottom edge and height, offset past it
          // with a small gap - so neither covers the other.
          className={`fixed bottom-6 right-[5.25rem] z-40 flex h-12 max-w-[calc(100vw-6.75rem)] items-center gap-2 rounded-full border bg-background px-4 text-sm shadow-lg transition-shadow hover:shadow-xl ${
            complete ? '' : 'border-primary/40'
          }`}
        >
          {complete ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <ListChecks className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="font-medium">
            Setup {status.done}/{status.total}
          </span>
          {nextStep && (
            <span className="hidden truncate text-muted-foreground sm:inline">· Next: {nextStep.title}</span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent side="top" align="end" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <div className="border-b p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4" />
                Setup {status.done}/{status.total}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {nextStep ? (
                  <>
                    Next: <strong className="text-foreground">{nextStep.title}</strong>
                  </>
                ) : (
                  'Everything is set up.'
                )}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {/* The primary action is hoisted out of the list so the common case is one
                  click from here, without reading the whole checklist. */}
              {nextStep && actionButton(nextStep, false)}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Progress value={pct} className="mt-3 h-1.5" />
        </div>

        <div className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
          {status.steps.map((step, i) => {
            const Icon = STATE_ICON[step.state];
            const isNext = step.key === status.nextStepKey;
            const actionable = step.state === 'current' || step.state === 'todo';

            return (
              <div
                key={step.key}
                className={`flex items-start gap-3 rounded-lg p-2.5 ${isNext ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`}
              >
                <div className="flex flex-col items-center">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${STATE_TONE[step.state]} ${
                      step.state === 'current' ? 'fill-primary/20' : ''
                    }`}
                  />
                  {/* Connector, so the list reads as a sequence rather than a set. */}
                  {i < status.steps.length - 1 && (
                    <div
                      className={`mt-1 w-px flex-1 ${step.state === 'done' ? 'bg-emerald-500/30' : 'bg-border'}`}
                      style={{ minHeight: 12 }}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p
                      className={`text-sm font-medium ${step.state === 'blocked' ? 'text-muted-foreground' : ''} ${
                        step.state === 'done' ? 'text-muted-foreground line-through decoration-muted-foreground/40' : ''
                      }`}
                    >
                      {i + 1}. {step.title}
                    </p>
                    {step.detail && <span className="text-xs text-muted-foreground">{step.detail}</span>}
                  </div>
                  {/* The explanation is only useful while the step is live; a finished step
                      reduces to its title and count. */}
                  {step.state !== 'done' && <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>}
                  {step.blockedBy && <p className="mt-0.5 text-xs text-muted-foreground/70">{step.blockedBy}</p>}
                </div>

                {actionable && actionButton(step, true)}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
