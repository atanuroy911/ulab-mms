'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronRight, FileText, LayoutGrid, List, Pencil, Plus, Search, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Person = { name?: string; email?: string } | string;

export interface BrowserGroup {
  _id: string;
  track: string;
  groupNumber: number;
  projectTitle: string;
  members: Array<{ studentAccountId: { name?: string; studentId?: string; email?: string } | string; studentIdText: string; removedAt?: string | null }>;
  supervisorId: Person | null;
  evaluators: Array<{ evaluatorId: Person; unassignedAt?: string | null }>;
  reportUrl?: string | null;
  journalCompletedAt?: string | null;
}

type ViewMode = 'list' | 'cards';
const VIEW_KEY = 'capstone-groups-view';

const nameOf = (p: Person | null) => (typeof p === 'object' && p ? p.name || '' : '');
const emailOf = (p: Person | null) => (typeof p === 'object' && p ? p.email || '' : '');
/** Imported names sometimes carry the ID: "Sanaullah (231014035)" - the ID is shown elsewhere. */
const cleanName = (n: string) => n.replace(/\s*\(\d{6,}\)\s*$/, '');
const memberName = (m: BrowserGroup['members'][number]) => cleanName(typeof m.studentAccountId === 'object' ? m.studentAccountId.name || m.studentIdText : m.studentIdText);
/** "Wahida Ferdose Urmi" -> "WU". */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .filter((_, i, all) => i === 0 || i === all.length - 1)
    .map((w) => w[0]!.toUpperCase())
    .join('');
const untitled = (title: string) => !title.trim() || /^untitled( project)?$/i.test(title.trim());

/** Everything a coordinator might search a group by, lower-cased. */
function haystack(g: BrowserGroup) {
  const members = g.members
    .filter((m) => !m.removedAt)
    .flatMap((m) => (typeof m.studentAccountId === 'object' ? [m.studentAccountId.name, m.studentAccountId.studentId, m.studentAccountId.email] : [m.studentIdText]));
  const evaluators = g.evaluators.filter((e) => !e.unassignedAt).flatMap((e) => [nameOf(e.evaluatorId), emailOf(e.evaluatorId)]);
  return [g.projectTitle, `#${g.groupNumber}`, `group ${g.groupNumber}`, `track ${g.track}`, nameOf(g.supervisorId), emailOf(g.supervisorId), ...members, ...evaluators]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * The session's groups, sectioned by track, with search, a track filter, and two views: a thin
 * list whose rows expand in place (for scanning dozens of groups) and the full cards.
 */
export function GroupsBrowser<G extends BrowserGroup>({
  groups,
  tracks,
  renderDetails,
  onChangeSupervisor,
  onAddEvaluator,
}: {
  groups: G[];
  tracks: string[];
  renderDetails: (group: G, bare?: boolean) => ReactNode;
  /** Clicking a row's supervisor opens this; omitted when groups can't be edited. */
  onChangeSupervisor?: (group: G) => void;
  /** Adds an evaluator to the row's group; omitted when groups can't be edited. */
  onAddEvaluator?: (group: G) => void;
}) {
  const [query, setQuery] = useState('');
  const [trackFilter, setTrackFilter] = useState<string>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // The chosen view is a per-person preference, remembered on this device.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'cards') setView(saved);
    } catch {
      /* no storage - default view */
    }
  }, []);
  const changeView = (v: ViewMode) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* not remembered - fine */
    }
  };

  const index = useMemo(() => new Map(groups.map((g) => [g._id, haystack(g)])), [groups]);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (g: G) => terms.every((t) => index.get(g._id)!.includes(t));

  const allTracks = useMemo(() => {
    const present = new Set(groups.map((g) => g.track));
    return [...new Set([...tracks, ...present])].filter((t) => present.has(t)).sort();
  }, [groups, tracks]);
  const countByTrack = (t: string) => groups.filter((g) => g.track === t).length;

  const visible = groups.filter((g) => (trackFilter === 'all' || g.track === trackFilter) && matches(g));
  const sections = allTracks
    .map((t) => ({ track: t, items: visible.filter((g) => g.track === t).sort((a, b) => a.groupNumber - b.groupNumber) }))
    .filter((s) => s.items.length > 0);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allExpanded = visible.length > 0 && visible.every((g) => expanded.has(g._id));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, #number, supervisor, student name or ID, evaluator…"
            className="pl-9 pr-8"
            aria-label="Search groups"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {allTracks.length > 1 && (
            <div className="flex rounded-lg border p-0.5 text-sm" role="tablist" aria-label="Track">
              {['all', ...allTracks].map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={trackFilter === t}
                  onClick={() => setTrackFilter(t)}
                  className={cn('rounded-md px-2.5 py-1 whitespace-nowrap', trackFilter === t ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground')}
                >
                  {t === 'all' ? `All ${groups.length}` : `${t} · ${countByTrack(t)}`}
                </button>
              ))}
            </div>
          )}
          <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="View">
            {(
              [
                ['list', List, 'List'],
                ['cards', LayoutGrid, 'Cards'],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => changeView(v)}
                title={`${label} view`}
                className={cn('flex items-center gap-1.5 rounded-md px-2 py-1 text-sm', view === v ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground')}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center">
          <p className="text-sm text-muted-foreground">No groups match{query ? ` “${query}”` : ''}.</p>
          {(query || trackFilter !== 'all') && (
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setQuery('');
                setTrackFilter('all');
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <>
          {view === 'list' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setExpanded(allExpanded ? new Set() : new Set(visible.map((g) => g._id)))}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
          )}
          {sections.map(({ track, items }) => (
            <section key={track} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary">Track {track}</span>
                <span className="font-normal text-muted-foreground">
                  {items.length} {items.length === 1 ? 'group' : 'groups'}
                  {terms.length > 0 && items.length !== countByTrack(track) ? ` of ${countByTrack(track)}` : ''}
                </span>
              </h3>

              {view === 'cards' ? (
                <div className="grid gap-3 xl:grid-cols-2">{items.map((g) => renderDetails(g))}</div>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  {/* Column heads, wide screens only */}
                  <div className="hidden items-center gap-3 border-b bg-muted/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:flex">
                    <span className="w-14 shrink-0 pl-7">#</span>
                    <span className="min-w-0 flex-1">Project and students</span>
                    <span className="w-56 shrink-0">Supervisor</span>
                    <span className="w-48 shrink-0">Evaluators</span>
                    <span className="w-16 shrink-0 text-right">Status</span>
                  </div>
                  <ul className="divide-y">
                    {items.map((g) => {
                      const open = expanded.has(g._id);
                      const students = g.members.filter((m) => !m.removedAt);
                      const evaluators = g.evaluators.filter((e) => !e.unassignedAt).map((e) => nameOf(e.evaluatorId) || 'Evaluator');
                      const supervisor = nameOf(g.supervisorId);
                      const stop = (fn: () => void) => (e: { stopPropagation: () => void }) => {
                        e.stopPropagation();
                        fn();
                      };
                      return (
                        <li key={g._id} className={cn(open && 'bg-muted/20')}>
                          <div onClick={() => toggle(g._id)} className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 md:flex-nowrap">
                            {/* Group and project */}
                            <button
                              type="button"
                              onClick={stop(() => toggle(g._id))}
                              aria-expanded={open}
                              className="flex min-w-0 flex-1 basis-full items-start gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:basis-auto"
                            >
                              <ChevronRight className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
                              <span className="w-8 shrink-0 pt-px font-mono text-xs text-muted-foreground">#{g.groupNumber}</span>
                              <span className="min-w-0 flex-1">
                                <span className={cn('block truncate text-sm', untitled(g.projectTitle) ? 'italic text-muted-foreground' : 'font-medium')}>
                                  {untitled(g.projectTitle) ? 'Untitled project' : g.projectTitle}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground" title={students.map(memberName).join(', ')}>
                                  {students.length ? students.map(memberName).join(' · ') : 'No students'}
                                </span>
                              </span>
                            </button>

                            {/* Supervisor */}
                            <div className="flex w-full items-center pl-14 md:w-56 md:shrink-0 md:pl-0">
                              {supervisor ? (
                                onChangeSupervisor ? (
                                  <button
                                    type="button"
                                    onClick={stop(() => onChangeSupervisor(g))}
                                    title="Change supervisor"
                                    className="group/sup flex min-w-0 max-w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-background"
                                  >
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{initials(supervisor)}</span>
                                    <span className="min-w-0 truncate">{supervisor}</span>
                                    <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/sup:opacity-100" />
                                  </button>
                                ) : (
                                  <span className="flex min-w-0 items-center gap-2 text-sm">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{initials(supervisor)}</span>
                                    <span className="truncate">{supervisor}</span>
                                  </span>
                                )
                              ) : onChangeSupervisor ? (
                                <button
                                  type="button"
                                  onClick={stop(() => onChangeSupervisor(g))}
                                  className="flex items-center gap-1 rounded-full border border-amber-500/50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                                >
                                  <UserCheck className="h-3.5 w-3.5" /> Set supervisor
                                </button>
                              ) : (
                                <span className="text-xs text-amber-700 dark:text-amber-400">No supervisor</span>
                              )}
                            </div>

                            {/* Evaluators */}
                            <div className="flex w-full min-w-0 items-center gap-1.5 pl-14 md:w-48 md:shrink-0 md:pl-0">
                              {evaluators.length ? (
                                <>
                                  <span className="min-w-0 truncate text-xs text-muted-foreground" title={evaluators.join(', ')}>
                                    {evaluators.join(', ')}
                                  </span>
                                  {onAddEvaluator && (
                                    <button
                                      type="button"
                                      onClick={stop(() => onAddEvaluator(g))}
                                      title="Add an evaluator"
                                      aria-label="Add an evaluator"
                                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-muted-foreground hover:bg-background hover:text-foreground"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  )}
                                </>
                              ) : onAddEvaluator ? (
                                <button
                                  type="button"
                                  onClick={stop(() => onAddEvaluator(g))}
                                  className="flex items-center gap-1 rounded-full border border-amber-500/50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                                >
                                  <UserPlus className="h-3.5 w-3.5" /> Add evaluator
                                </button>
                              ) : (
                                <span className="text-xs text-amber-700 dark:text-amber-400">No evaluators</span>
                              )}
                            </div>

                            {/* Status */}
                            <span className="hidden w-16 shrink-0 items-center justify-end gap-2 text-xs text-muted-foreground md:flex">
                              <span className="flex items-center gap-0.5" title={`${students.length} students`}>
                                <Users className="h-3.5 w-3.5" /> {students.length}
                              </span>
                              {g.reportUrl && <FileText className="h-3.5 w-3.5" aria-label="Report linked" />}
                              {g.journalCompletedAt && <Check className="h-3.5 w-3.5 text-emerald-500" aria-label="Journal done" />}
                            </span>
                          </div>
                          {open && <div className="border-t px-4 py-4 sm:pl-12">{renderDetails(g, true)}</div>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
