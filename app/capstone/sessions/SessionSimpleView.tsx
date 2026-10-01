'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardEdit, FileSpreadsheet, FileStack, FileText, Printer, Send, SlidersHorizontal, Users, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { isRunning, isPastSession } from '@/lib/capstoneStatus';
import { SimpleGroupsView, type SimpleGroup } from './SimpleGroupsView';

interface SetupStep {
  key: string;
  title: string;
  description: string;
  state: 'done' | 'current' | 'todo' | 'blocked';
  detail?: string;
  href?: string;
}


type Steps = { steps: SetupStep[]; nextStepKey: string | null };

// Last known setup status per session: shown at once on return, refreshed in the background.
const stepsCache = new Map<string, Steps>();
function cachedSteps(sessionId: string): Steps | null {
  if (stepsCache.has(sessionId)) return stepsCache.get(sessionId)!;
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(`capstone-steps:${sessionId}`) : null;
    return raw ? (JSON.parse(raw) as Steps) : null;
  } catch {
    return null;
  }
}

/**
 * The session in big buttons - only what running a capstone semester needs. Everything else
 * (and every detail) is one click away in the Advanced view; nothing here does anything the
 * Advanced view doesn't, it only puts the essentials first.
 */
export function SessionSimpleView(props: {
  sessionId: string;
  status: string;
  tracks: string[];
  groups: SimpleGroup[];
  refreshKey: number;
  /** The groups are still being fetched. */
  loading?: boolean;
  stageBar: React.ReactNode;
  emailing: boolean;
  onNewGroup: () => void;
  onOpenGroup: (g: SimpleGroup) => void;
  onSetSupervisor: (g: SimpleGroup) => void;
  onAddEvaluator: (g: SimpleGroup) => void;
  onEmailGraders: () => void;
  onSetupAction: (key: string) => void;
  onCourseFile: () => void;
  onSchemes: () => void;
}) {
  const { sessionId, status, tracks, groups } = props;
  const [steps, setSteps] = useState<Steps | null>(() => cachedSteps(sessionId));
  const [exportsOpen, setExportsOpen] = useState(false);
  // Simple mode's own screens: the overview, or the groups list.
  const [screen, setScreenState] = useState<'home' | 'groups'>('home');
  // A new screen starts at the top, wherever the page was scrolled.
  const setScreen = (next: 'home' | 'groups') => {
    setScreenState(next);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    fetch(`/api/capstone/sessions/${sessionId}/setup-status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        stepsCache.set(sessionId, d);
        try {
          window.sessionStorage.setItem(`capstone-steps:${sessionId}`, JSON.stringify({ steps: d.steps, nextStepKey: d.nextStepKey }));
        } catch {
          /* not cached */
        }
        setSteps(d);
      })
      .catch(() => undefined);
  }, [sessionId, props.refreshKey]);

  const step = (key: string) => steps?.steps.find((s) => s.key === key);
  const next = steps?.nextStepKey ? step(steps.nextStepKey) : null;
  const finished = isPastSession(status);
  const running = isRunning(status);
  const students = groups.reduce((n, g) => n + g.members.filter((m) => !m.removedAt).length, 0);
  const noSupervisor = groups.filter((g) => !g.supervisorId).length;
  const noEvaluator = groups.filter((g) => g.evaluators.filter((e) => !e.unassignedAt).length === 0).length;

  const groupsLine = props.loading
    ? 'Loading groups…'
    : groups.length
    ? [`${groups.length} groups · ${students} students`, noSupervisor ? `${noSupervisor} need a supervisor` : null, !noSupervisor && noEvaluator ? `${noEvaluator} need evaluators` : null]
        .filter(Boolean)
        .join(' · ')
    : 'No groups yet';

  if (screen === 'groups') {
    return (
      <SimpleGroupsView
        groups={groups}
        tracks={tracks}
        readOnly={finished}
        onBack={() => setScreen('home')}
        onOpen={props.onOpenGroup}
        onSetSupervisor={props.onSetSupervisor}
        onAddEvaluator={props.onAddEvaluator}
      />
    );
  }

  return (
    <div className="space-y-5">
      {props.stageBar}

      {/* Space held for the next step while it loads, so nothing jumps in later. */}
      {!finished && !steps && <div className="h-[104px] animate-pulse rounded-2xl bg-muted" aria-hidden />}
      {/* The one thing to do next, when there is one. */}
      {!finished && next && (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Next step</p>
            <p className="mt-0.5 text-lg font-semibold">{next.title}</p>
            <p className="text-sm text-muted-foreground">{next.detail || next.description}</p>
          </div>
          {next.href ? (
            <Button size="lg" className="h-12 shrink-0 text-base" asChild>
              <Link href={next.href}>
                Go <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          ) : (
            <Button size="lg" className="h-12 shrink-0 text-base" onClick={() => props.onSetupAction(next.key)}>
              Do it now <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile icon={Users} title="Groups" line={groupsLine} attention={noSupervisor > 0 && !finished} onClick={() => setScreen('groups')} />
        <Tile
          icon={UserPlus}
          title="Add a group"
          line="Title, supervisor and students"
          primary={status === 'draft'}
          disabled={finished ? 'The session is finished' : null}
          onClick={props.onNewGroup}
        />
        <Tile
          icon={ClipboardEdit}
          title="Enter marks"
          line={step('marks')?.detail || 'Every group’s marks in one table'}
          primary={running}
          href={`/capstone/sessions/${sessionId}/marks`}
        />
        <Tile
          icon={FileText}
          title={finished ? 'Grades & move on' : 'Grades & results'}
          line={finished ? 'Results, and moving groups to the next semester' : 'Totals and letter grades, as the scheme computes them'}
          primary={finished}
          href={`/capstone/sessions/${sessionId}/grades`}
        />
        <Tile
          icon={Send}
          title="Remind graders"
          line={running ? 'Email every supervisor and evaluator to submit marks' : 'Available while the session is running'}
          disabled={!running ? 'Only while the session is running' : props.emailing ? 'Sending…' : null}
          onClick={() => confirm('Email every supervisor and evaluator in this session asking them to submit their marks?') && props.onEmailGraders()}
        />
        <Tile icon={Printer} title="Print & export" line="Marking sheets, grade sheets, course file, group list" onClick={() => setExportsOpen(true)} />
      </div>

      <Dialog open={exportsOpen} onOpenChange={setExportsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Print &amp; export</DialogTitle>
            <DialogDescription>Each opens ready to print or save as PDF.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(
              [
                ['Presentation marking sheet', 'presentation-sheet'],
                ['Report rubric', 'report-sheet'],
                ['Grade sheet', 'transcript?scope=roster'],
                ['Group results', 'transcript?scope=groups'],
              ] as const
            ).map(([label, path]) => (
              <div key={path} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                <span className="min-w-40 flex-1 text-sm font-medium">{label}</span>
                {tracks.map((t) => (
                  <Button key={t} size="sm" variant="outline" asChild>
                    <a href={`/api/capstone/sessions/${sessionId}/${path}${path.includes('?') ? '&' : '?'}track=${t}`} target="_blank" rel="noopener noreferrer">
                      Capstone {t}
                    </a>
                  </Button>
                ))}
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  setExportsOpen(false);
                  props.onCourseFile();
                }}
              >
                <FileStack className="mr-2 h-4 w-4" /> Course file (CO-PO)
              </Button>
              <Button variant="outline" className="h-11" asChild>
                <a href={`/api/capstone/sessions/${sessionId}/groups-export`} target="_blank" rel="noopener noreferrer">
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Group list (.xlsx)
                </a>
              </Button>
            </div>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setExportsOpen(false);
                props.onSchemes();
              }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Which grading scheme each track uses
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tile({
  icon: Icon,
  title,
  line,
  onClick,
  href,
  primary = false,
  attention = false,
  disabled = null,
}: {
  icon: typeof Users;
  title: string;
  line: string;
  onClick?: () => void;
  href?: string;
  primary?: boolean;
  attention?: boolean;
  /** Why it can't be used right now - shown instead of hiding the button. */
  disabled?: string | null;
}) {
  const body = (
    <>
      <span
        className={cn(
          'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-colors',
          primary ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground'
        )}
      >
        <Icon className="h-7 w-7" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold leading-tight">{title}</span>
        <span className={cn('mt-1 block text-sm', attention ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
          {disabled || line}
        </span>
      </span>
    </>
  );
  const cls = cn(
    'group flex min-h-28 w-full items-center gap-4 rounded-2xl border-2 bg-card p-5 text-left shadow-sm transition-[border-color,box-shadow] duration-200',
    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30',
    primary && !disabled && 'border-primary/50'
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={disabled ? undefined : onClick} aria-disabled={!!disabled}>
      {body}
    </button>
  );
}
