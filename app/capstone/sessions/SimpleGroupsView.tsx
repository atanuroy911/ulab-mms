'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Search, UserCheck, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Person = { _id: string; name: string } | string | null | undefined;

export interface SimpleGroup {
  _id: string;
  track: string;
  groupNumber: number;
  projectTitle: string;
  supervisorId: Person;
  supervisorLabel?: string | null;
  members: Array<{ studentAccountId: { name?: string; studentId?: string } | string; studentIdText: string; removedAt?: string | null }>;
  evaluators: Array<{ evaluatorId: Person; unassignedAt?: string | null }>;
}

const nameOf = (p: Person) => (p && typeof p === 'object' ? p.name : null);
/** Imported names sometimes carry the ID: "Sanaullah (231014035)". */
const cleanName = (n: string) => n.replace(/\s*\(\d{6,}\)\s*$/, '');

/**
 * The session's groups, Simple mode: one big row each, with the one fix it needs (a
 * supervisor, evaluators) as a button, and Open for everything else.
 */
export function SimpleGroupsView({
  groups,
  tracks,
  readOnly,
  onBack,
  onOpen,
  onSetSupervisor,
  onAddEvaluator,
}: {
  groups: SimpleGroup[];
  tracks: string[];
  readOnly: boolean;
  onBack: () => void;
  onOpen: (g: SimpleGroup) => void;
  onSetSupervisor: (g: SimpleGroup) => void;
  onAddEvaluator: (g: SimpleGroup) => void;
}) {
  const [track, setTrack] = useState(tracks[0] || 'A');
  const [query, setQuery] = useState('');
  const [onlyAttention, setOnlyAttention] = useState(false);

  const needs = (g: SimpleGroup) => ({
    supervisor: !g.supervisorId,
    evaluators: g.evaluators.filter((e) => !e.unassignedAt).length === 0,
  });
  const attentionCount = groups.filter((g) => g.track === track && (needs(g).supervisor || needs(g).evaluators)).length;

  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      groups
        .filter((g) => g.track === track)
        .filter((g) => !onlyAttention || needs(g).supervisor || needs(g).evaluators)
        .filter((g) => {
          if (!q) return true;
          const people = g.members.map((m) => (typeof m.studentAccountId === 'object' ? `${m.studentAccountId.name} ${m.studentAccountId.studentId}` : m.studentIdText)).join(' ');
          return `group ${g.groupNumber} ${g.projectTitle} ${people} ${nameOf(g.supervisorId) || g.supervisorLabel || ''}`.toLowerCase().includes(q);
        })
        .sort((a, b) => a.groupNumber - b.groupNumber),
    [groups, track, onlyAttention, q]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="lg" className="h-11" onClick={onBack}>
          <ArrowLeft className="mr-2 h-5 w-5" /> Back
        </Button>
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6 text-primary" /> Groups
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tracks.length > 1 && (
          <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Track">
            {tracks.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={track === t}
                onClick={() => setTrack(t)}
                className={cn('rounded-md px-4 py-1.5 text-sm font-medium', track === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                Capstone {t} <span className="opacity-70">({groups.filter((g) => g.track === t).length})</span>
              </button>
            ))}
          </div>
        )}
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a group, student or supervisor" className="h-10 pl-9" />
        </div>
        {attentionCount > 0 && !readOnly && (
          <button
            type="button"
            onClick={() => setOnlyAttention((v) => !v)}
            aria-pressed={onlyAttention}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              onlyAttention ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-500/50 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300'
            )}
          >
            Needs attention ({attentionCount})
          </button>
        )}
      </div>

      {list.length === 0 && (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          {onlyAttention ? 'Every group in this track has a supervisor and evaluators.' : q ? 'No group matches.' : 'No groups in this track yet.'}
        </p>
      )}

      <ul className="space-y-3">
        {list.map((g) => {
          const n = needs(g);
          const students = g.members.filter((m) => !m.removedAt);
          const evaluators = g.evaluators.filter((e) => !e.unassignedAt).map((e) => nameOf(e.evaluatorId) || 'Evaluator');
          return (
            <li key={g._id} className={cn('rounded-2xl border-2 bg-card p-4 sm:p-5', (n.supervisor || n.evaluators) && !readOnly ? 'border-amber-500/40' : 'border-border')}>
              <div className="flex flex-col gap-3">
                <button type="button" onClick={() => onOpen(g)} className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-medium text-muted-foreground">Group {g.groupNumber}</p>
                  <p className="text-lg font-semibold leading-snug">{g.projectTitle}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {students.length} students: {students.map((m) => cleanName((typeof m.studentAccountId === 'object' ? m.studentAccountId.name : null) || m.studentIdText)).join(', ')}
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span className={n.supervisor ? 'font-medium text-amber-700 dark:text-amber-400' : ''}>
                      <UserCheck className="mr-1 inline h-4 w-4 align-[-3px]" />
                      {nameOf(g.supervisorId) || (g.supervisorLabel ? `No supervisor yet (workbook: ${g.supervisorLabel})` : 'No supervisor yet')}
                    </span>
                    <span className={n.evaluators ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}>
                      {evaluators.length ? `Evaluators: ${evaluators.join(', ')}` : 'No evaluators yet'}
                    </span>
                  </p>
                </button>
                <div className="flex flex-wrap gap-2">
                  {/* Always there: highlighted while missing, plain once set (to change or add more). */}
                  {!readOnly && (
                    <Button className="h-11" variant={n.supervisor ? 'default' : 'outline'} onClick={() => onSetSupervisor(g)}>
                      <UserCheck className="mr-2 h-4 w-4" /> {n.supervisor ? 'Set supervisor' : 'Change supervisor'}
                    </Button>
                  )}
                  {!readOnly && (
                    <Button className="h-11" variant={n.evaluators && !n.supervisor ? 'default' : 'outline'} onClick={() => onAddEvaluator(g)}>
                      <UserPlus className="mr-2 h-4 w-4" /> Add evaluator
                    </Button>
                  )}
                  <Button variant="outline" className="h-11 sm:ml-auto" onClick={() => onOpen(g)}>
                    Open <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
