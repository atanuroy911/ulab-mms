'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  Circle,
  Lock,
  ChevronRight,
  ChevronDown,
  Loader2,
  ListChecks,
  ArrowRight,
} from 'lucide-react';

/**
 * The session's setup checklist - the "what do I do next" panel.
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
  const [loading, setLoading] = useState(true);
  // Collapsed once setup is complete, so a finished session isn't dominated by a checklist
  // of ticks. Expanded while there is still something to do.
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/capstone/sessions/${sessionId}/setup-status`);
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
        setExpanded(data.done < data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking setup…
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const nextStep = status.steps.find((s) => s.key === status.nextStepKey);
  const pct = Math.round((status.done / status.total) * 100);

  return (
    <Card className={nextStep ? 'border-primary/40' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4" />
              Setup
              <Badge variant={status.done === status.total ? 'secondary' : 'outline'}>
                {status.done}/{status.total}
              </Badge>
            </CardTitle>
            <CardDescription>
              {nextStep ? (
                <>
                  Next: <strong className="text-foreground">{nextStep.title}</strong>
                </>
              ) : (
                'Everything is set up.'
              )}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {/* The primary action is hoisted out of the list so the common case is one
                click from here, without reading the whole checklist. */}
            {nextStep &&
              (nextStep.href ? (
                <Button size="sm" asChild>
                  <Link href={nextStep.href}>
                    {IN_PAGE_ACTIONS[nextStep.key] || 'Go'}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : onAction ? (
                <Button size="sm" onClick={() => onAction(nextStep.key)}>
                  {IN_PAGE_ACTIONS[nextStep.key] || 'Go'}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              ) : null)}

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Collapse checklist' : 'Expand checklist'}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Progress value={pct} className="mt-2 h-1.5" />
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-1 pt-0">
          {status.steps.map((step, i) => {
            const Icon = STATE_ICON[step.state];
            const isNext = step.key === status.nextStepKey;
            const actionable = step.state === 'current' || step.state === 'todo';

            return (
              <div
                key={step.key}
                className={`flex items-start gap-3 rounded-lg p-2.5 transition-colors ${
                  isNext ? 'bg-primary/5 ring-1 ring-primary/20' : ''
                }`}
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
                      className={`mt-1 w-px flex-1 ${
                        step.state === 'done' ? 'bg-emerald-500/30' : 'bg-border'
                      }`}
                      style={{ minHeight: 12 }}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p
                      className={`text-sm font-medium ${
                        step.state === 'blocked' ? 'text-muted-foreground' : ''
                      } ${step.state === 'done' ? 'text-muted-foreground line-through decoration-muted-foreground/40' : ''}`}
                    >
                      {i + 1}. {step.title}
                    </p>
                    {step.detail && (
                      <span className="text-xs text-muted-foreground">{step.detail}</span>
                    )}
                  </div>

                  {/* The explanation is only useful while the step is live; a finished step
                      reduces to its title and count. */}
                  {step.state !== 'done' && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                  )}

                  {step.blockedBy && (
                    <p className="mt-0.5 text-xs text-muted-foreground/70">{step.blockedBy}</p>
                  )}
                </div>

                {actionable &&
                  (step.href ? (
                    <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" asChild>
                      <Link href={step.href}>Go</Link>
                    </Button>
                  ) : onAction && IN_PAGE_ACTIONS[step.key] ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs"
                      onClick={() => onAction(step.key)}
                    >
                      Go
                    </Button>
                  ) : null)}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
