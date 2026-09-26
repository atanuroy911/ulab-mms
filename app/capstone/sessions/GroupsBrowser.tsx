'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronRight, FileText, LayoutGrid, List, Search, ShieldCheck, UserCog, Users, X } from 'lucide-react';
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
  supervisorId: Person;
  evaluators: Array<{ evaluatorId: Person; unassignedAt?: string | null }>;
  reportUrl?: string | null;
  journalCompletedAt?: string | null;
}

type ViewMode = 'list' | 'cards';
const VIEW_KEY = 'capstone-groups-view';

const nameOf = (p: Person) => (typeof p === 'object' && p ? p.name || '' : '');
const emailOf = (p: Person) => (typeof p === 'object' && p ? p.email || '' : '');

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
}: {
  groups: G[];
  tracks: string[];
  renderDetails: (group: G, bare?: boolean) => ReactNode;
  /** Clicking a row's supervisor opens this; omitted when groups can't be edited. */
  onChangeSupervisor?: (group: G) => void;
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
                <ul className="divide-y overflow-hidden rounded-lg border">
                  {items.map((g) => {
                    const open = expanded.has(g._id);
                    const members = g.members.filter((m) => !m.removedAt).length;
                    const evaluators = g.evaluators.filter((e) => !e.unassignedAt).length;
                    return (
                      <li key={g._id} className={cn(open && 'bg-muted/20')}>
                        {/* The whole row expands; the supervisor has its own button to change them. */}
                        <div
                          onClick={() => toggle(g._id)}
                          className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle(g._id);
                            }}
                            aria-expanded={open}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          >
                            <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
                            <span className="w-9 shrink-0 font-mono text-xs text-muted-foreground">#{g.groupNumber}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{g.projectTitle}</span>
                              <span className="block truncate text-xs text-muted-foreground md:hidden">{nameOf(g.supervisorId)}</span>
                            </span>
                          </button>
                          {onChangeSupervisor ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onChangeSupervisor(g);
                              }}
                              title="Change supervisor"
                              className="group/sup hidden w-44 shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs text-muted-foreground hover:bg-background hover:text-foreground md:flex"
                            >
                              <span className="min-w-0 flex-1 truncate">{nameOf(g.supervisorId)}</span>
                              <UserCog className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover/sup:opacity-100" />
                            </button>
                          ) : (
                            <span className="hidden w-44 shrink-0 truncate text-xs text-muted-foreground md:block">{nameOf(g.supervisorId)}</span>
                          )}
                          <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1" title={`${members} students`}>
                              <Users className="h-3.5 w-3.5" /> {members}
                            </span>
                            <span className={cn('flex items-center gap-1', evaluators === 0 && 'text-amber-600')} title={`${evaluators} evaluators`}>
                              <ShieldCheck className="h-3.5 w-3.5" /> {evaluators}
                            </span>
                            <span className="hidden w-8 items-center gap-1.5 sm:flex">
                              {g.reportUrl && <FileText className="h-3.5 w-3.5" aria-label="Report linked" />}
                              {g.journalCompletedAt && <Check className="h-3.5 w-3.5 text-emerald-500" aria-label="Journal done" />}
                            </span>
                          </span>
                        </div>
                        {open && <div className="border-t px-4 py-4 sm:pl-12">{renderDetails(g, true)}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
