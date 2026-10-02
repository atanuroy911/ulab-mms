'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Link2, MoreHorizontal, Search, Trash2, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Person = { _id: string; name: string } | string | null | undefined;
const idOf = (p: Person) => (p && typeof p === 'object' ? p._id : p || '');

export interface SimpleGroup {
  _id: string;
  track: string;
  groupNumber: number;
  projectTitle: string;
  supervisorId: Person;
  supervisorLabel?: string | null;
  members: Array<{ studentAccountId: { _id?: string; name?: string; studentId?: string } | string; studentIdText: string; removedAt?: string | null }>;
  evaluators: Array<{ evaluatorId: Person; unassignedAt?: string | null }>;
}

const nameOf = (p: Person) => (p && typeof p === 'object' ? p.name : null);
/** Imported names sometimes carry the ID: "Sanaullah (231014035)". */
const cleanName = (n: string) => n.replace(/\s*\(\d{6,}\)\s*$/, '');

/** What can be done to a group from Simple mode - the same handlers the Advanced view uses. */
export interface SimpleGroupActions {
  onOpenStudent: (g: SimpleGroup, studentAccountId: string) => void;
  onAddStudents: (g: SimpleGroup) => void;
  onRemoveStudent: (g: SimpleGroup, studentAccountId: string) => void;
  onRemoveEvaluator: (g: SimpleGroup, evaluatorId: string) => void;
  onDeleteGroup: (g: SimpleGroup) => void;
  onBulkReports: () => void;
}

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
  actions,
}: {
  groups: SimpleGroup[];
  tracks: string[];
  readOnly: boolean;
  onBack: () => void;
  onOpen: (g: SimpleGroup) => void;
  onSetSupervisor: (g: SimpleGroup) => void;
  onAddEvaluator: (g: SimpleGroup) => void;
  actions: SimpleGroupActions;
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
        {!readOnly && groups.length > 0 && (
          <Button variant="outline" className="ml-auto h-11" onClick={actions.onBulkReports} title="Paste every group's final report link at once (end of semester)">
            <Link2 className="mr-2 h-4 w-4" /> Paste report links
          </Button>
        )}
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
          const evaluators = g.evaluators.filter((e) => !e.unassignedAt).map((e) => ({ id: idOf(e.evaluatorId), name: nameOf(e.evaluatorId) || 'Evaluator' }));
          const chip = 'inline-flex items-center rounded-lg border bg-secondary/60 text-sm';
          return (
            <li key={g._id} className={cn('rounded-2xl border-2 bg-card p-4 sm:p-5', (n.supervisor || n.evaluators) && !readOnly ? 'border-amber-500/40' : 'border-border')}>
              <div className="flex flex-col gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <button type="button" onClick={() => onOpen(g)} className="block text-left">
                    <span className="block text-sm font-medium text-muted-foreground">Group {g.groupNumber}</span>
                    <span className="block text-lg font-semibold leading-snug hover:underline">{g.projectTitle}</span>
                  </button>
                  {/* Students: tap a name for their marks, grade and journal */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-sm text-muted-foreground">{students.length} students:</span>
                    {students.map((m) => {
                      const sid = typeof m.studentAccountId === 'object' ? m.studentAccountId._id || '' : m.studentAccountId;
                      const name = cleanName((typeof m.studentAccountId === 'object' ? m.studentAccountId.name : null) || m.studentIdText);
                      return (
                        <span key={sid || m.studentIdText} className={chip}>
                          <button type="button" onClick={() => sid && actions.onOpenStudent(g, sid)} className="rounded-l-lg px-2.5 py-1 hover:bg-secondary" title="Marks, grade and journal">
                            {name}
                          </button>
                          {!readOnly && sid && (
                            <button type="button" onClick={() => actions.onRemoveStudent(g, sid)} className="rounded-r-lg border-l px-2 py-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${name}`} title="Remove from this group (journal and marks are kept)">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                  <p className={cn('text-sm', n.supervisor ? 'font-medium text-amber-700 dark:text-amber-400' : '')}>
                    <UserCheck className="mr-1 inline h-4 w-4 align-[-3px]" />
                    {nameOf(g.supervisorId) || (g.supervisorLabel ? `No supervisor yet (workbook: ${g.supervisorLabel})` : 'No supervisor yet')}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className={cn('mr-1', n.evaluators ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                      {evaluators.length ? 'Evaluators:' : 'No evaluators yet'}
                    </span>
                    {evaluators.map((e) => (
                      <span key={e.id} className={chip}>
                        <span className={cn('px-2.5 py-1', readOnly && 'rounded-lg')}>{e.name}</span>
                        {!readOnly && (
                          <button type="button" onClick={() => actions.onRemoveEvaluator(g, e.id)} className="rounded-r-lg border-l px-2 py-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Unassign ${e.name}`} title="Unassign (marks they submitted are kept)">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
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
                  {!readOnly && (
                    <Button className="h-11" variant="outline" onClick={() => actions.onAddStudents(g)}>
                      <Users className="mr-2 h-4 w-4" /> Add students
                    </Button>
                  )}
                  {!readOnly && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-11 w-11 p-0 sm:ml-auto" aria-label="More for this group">
                          <MoreHorizontal className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => actions.onDeleteGroup(g)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete group
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button variant="outline" className={cn('h-11', readOnly && 'sm:ml-auto')} onClick={() => onOpen(g)}>
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
