'use client';

import { useEffect, useMemo, useState, use as usePromise } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  ArrowLeft,
  Search,
  Workflow,
  ArrowRightCircle,
  ArrowUpDown,
  ClipboardEdit,
  ScrollText,
} from 'lucide-react';
import { ProgressionWizard } from './ProgressionWizard';
import { SessionModeToggle, useSessionMode } from '@/app/capstone/components/useSessionMode';
import { cn } from '@/lib/utils';
import { TeacherShell } from '@/app/components/TeacherShell';
import { toast } from 'sonner';

interface TraceEntry {
  nodeId: string;
  type: string;
  label: string;
  value: number;
  contributingSubmissions?: number;
}

interface Submission {
  component: string;
  submitterName: string;
  submitterRole: 'supervisor' | 'evaluator';
  counted: boolean;
  rawScore: number;
  rubricMax: number | null;
}

interface Member {
  studentAccountId: string;
  studentId: string;
  name: string | null;
  email: string | null;
  score: number | null;
  letter: string | null;
  trace: TraceEntry[];
  missingComponents: string[];
  submissions: Submission[];
  error?: string;
  /** Set for a supervisor/evaluator who still owes these components - see redactMemberForGrader. */
  gradeHiddenUntil?: string[];
}

interface Group {
  groupId: string;
  track: string;
  groupNumber: number;
  projectTitle: string;
  supervisorName: string | null;
  schemeName: string | null;
  schemeVersion: number | null;
  componentNodeIds: string[];
  members: Member[];
}

interface TrackReport {
  track: string;
  schemeName?: string;
  version?: number;
  status: string;
  message?: string;
  issues?: { message: string }[];
}

interface GradesResponse {
  department: string;
  sessionStatus?: string;
  canSeeWholeSession: boolean;
  tracks: TrackReport[];
  groups: Group[];
}

const COMPONENT_LABELS: Record<string, string> = {
  report: 'Report',
  presentation: 'Presentation',
  peer: 'Peer',
  weeklyJournal: 'Weekly Journal',
  poster: 'Poster',
};

/** Letter-grade colouring, so a cohort's spread reads at a glance. */
function gradeTone(letter: string | null): string {
  if (!letter) return 'text-muted-foreground';
  if (letter.startsWith('A')) return 'text-emerald-600 dark:text-emerald-400';
  if (letter.startsWith('B')) return 'text-sky-600 dark:text-sky-400';
  if (letter.startsWith('C')) return 'text-amber-600 dark:text-amber-400';
  if (letter.startsWith('D')) return 'text-orange-600 dark:text-orange-400';
  return 'text-destructive';
}

export default function SessionGradesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();

  const [data, setData] = useState<GradesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState('');
  const [detailFor, setDetailFor] = useState<{ member: Member; group: Group } | null>(null);
  const [view, setView] = useState<'groups' | 'students'>('groups');
  const [trackFilter, setTrackFilter] = useState('all');
  const [sort, setSort] = useState<{ key: 'name' | 'group' | 'total'; dir: 1 | -1 }>({ key: 'group', dir: 1 });
  const [moveOpen, setMoveOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [mode, setMode] = useSessionMode();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/capstone/sessions/${id}/grades`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Failed to load grades');
        setData(body);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load grades');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, reloadKey]);

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/capstone/sessions/${id}/grades-export`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // The server sets a descriptive filename; this is only the fallback.
      a.download = `capstone-grades-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // All groups share a track's scheme, but a session can pin different schemes per track, so
  // column headers are derived per group rather than once for the table.
  const filteredGroups = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const inTrack = data.groups.filter((g) => trackFilter === 'all' || g.track === trackFilter);
    if (!q) return inTrack;
    return inTrack
      .map((group) => ({
        ...group,
        members: group.members.filter(
          (m) =>
            m.studentId.toLowerCase().includes(q) ||
            (m.name || '').toLowerCase().includes(q) ||
            group.projectTitle.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.members.length > 0);
  }, [data, query, trackFilter]);

  // Students view: one row per student, component columns by name across all groups.
  const studentColumns = useMemo(() => {
    const labels: string[] = [];
    for (const g of filteredGroups) {
      for (const t of g.members[0]?.trace || []) {
        if (g.componentNodeIds.includes(t.nodeId) && !labels.includes(t.label)) labels.push(t.label);
      }
    }
    return labels;
  }, [filteredGroups]);
  const studentRows = useMemo(() => {
    const rows = filteredGroups.flatMap((group) => group.members.map((member) => ({ group, member })));
    const key = (r: (typeof rows)[number]) =>
      sort.key === 'name'
        ? (r.member.name || r.member.studentId).toLowerCase()
        : sort.key === 'total'
          ? r.member.score ?? -1
          : `${r.group.track}${String(r.group.groupNumber).padStart(4, '0')}`;
    return rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * sort.dir);
  }, [filteredGroups, sort]);
  const toggleSort = (k: 'name' | 'group' | 'total') => setSort((p) => ({ key: k, dir: p.key === k ? (-p.dir as 1 | -1) : k === 'total' ? -1 : 1 }));
  const tracksPresent = [...new Set((data?.groups || []).map((g) => g.track))].sort();
  const canMoveOn = !!data?.canSeeWholeSession && data?.sessionStatus === 'closed';

  if (loading) {
    return (
      <TeacherShell title="Capstone Grades">
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </TeacherShell>
    );
  }

  const problemTracks = (data?.tracks || []).filter((t) => t.status !== 'ok');

  return (
    <TeacherShell
      title="Capstone Grades"
      subtitle={data ? `${data.department} · computed from submitted marks` : undefined}
      actions={
        <>
          <SessionModeToggle mode={mode} onChange={setMode} />
          <Button variant="outline" size="sm" onClick={() => router.push(`/capstone/sessions?session=${id}`)} title="Back to this session">
            <ArrowLeft className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Session</span>
          </Button>
          {data?.canSeeWholeSession && (
            <Button asChild size="sm" variant="outline" title="Every group's marks in one table - type any grader's marks in">
              <Link href={`/capstone/sessions/${id}/marks`}>
                <ClipboardEdit className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Enter marks</span>
              </Link>
            </Button>
          )}
          {data?.canSeeWholeSession && mode === 'advanced' && (
            <Button
              size="sm"
              variant={canMoveOn ? 'default' : 'outline'}
              onClick={() => setMoveOpen(true)}
              title={canMoveOn ? 'Move passing students and their groups on to the next session' : 'Available once this session is Finished - finishing publishes the results'}
            >
              <ArrowRightCircle className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Move to next session</span>
            </Button>
          )}
          {data?.canSeeWholeSession && mode === 'advanced' && (
            <Button size="sm" variant="outline" onClick={exportXlsx} disabled={exporting} title="Download every group's grades, components and raw marks as an Excel workbook">
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 sm:mr-2" />
              )}
              <span className="hidden sm:inline">Export Excel</span>
            </Button>
          )}
        </>
      }
    >
      <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
        {problemTracks.length > 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Some tracks can&apos;t be graded yet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {problemTracks.map((t) => (
                <div key={t.track} className="flex flex-wrap items-baseline gap-x-2">
                  <Badge variant="outline">Track {t.track}</Badge>
                  <span className="text-muted-foreground">
                    {t.message || t.issues?.map((i) => i.message).join('; ') || t.status}
                  </span>
                </div>
              ))}
              <Link
                href={`/capstone/sessions?session=${id}`}
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Workflow className="h-3.5 w-3.5" />
                Pin a grading scheme
              </Link>
            </CardContent>
          </Card>
        )}

        {mode === 'simple' && data ? (
          <SimpleGrades
            sessionId={id}
            groups={data.groups}
            canManage={!!data.canSeeWholeSession}
            canMoveOn={canMoveOn}
            exporting={exporting}
            onExport={exportXlsx}
            onMoveOn={() => setMoveOpen(true)}
            onOpen={(member, group) => setDetailFor({ member, group })}
          />
        ) : (
        <>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by student, ID or project…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {tracksPresent.length > 1 && (
            <div className="flex rounded-lg border p-0.5 text-sm" role="tablist" aria-label="Track">
              {['all', ...tracksPresent].map((t) => (
                <button key={t} type="button" role="tab" aria-selected={trackFilter === t} onClick={() => setTrackFilter(t)} className={cn('rounded-md px-2.5 py-1', trackFilter === t ? 'bg-muted font-medium' : 'text-muted-foreground')}>
                  {t === 'all' ? 'All tracks' : `Track ${t}`}
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto flex rounded-lg border p-0.5 text-sm" role="tablist" aria-label="View">
            {(['groups', 'students'] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn('rounded-md px-3 py-1', view === v ? 'bg-muted font-medium' : 'text-muted-foreground')}>
                {v === 'groups' ? 'By group' : 'By student'}
              </button>
            ))}
          </div>
        </div>

        {view === 'students' && filteredGroups.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-20 min-w-[200px] bg-background">
                    <button type="button" onClick={() => toggleSort('name')} className="flex items-center gap-1">
                      Student <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="min-w-[160px]">
                    <button type="button" onClick={() => toggleSort('group')} className="flex items-center gap-1">
                      Group <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  {studentColumns.map((label) => (
                    <TableHead key={label} className="min-w-[110px] text-center">
                      {label}
                    </TableHead>
                  ))}
                  <TableHead className="min-w-20 text-center font-semibold">
                    <button type="button" onClick={() => toggleSort('total')} className="mx-auto flex items-center gap-1">
                      Total <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="min-w-16 text-center font-semibold">Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentRows.map(({ group, member }) => {
                  const byLabel = new Map(member.trace.filter((t) => group.componentNodeIds.includes(t.nodeId)).map((t) => [t.label, t.value]));
                  return (
                    <TableRow key={`${group.groupId}:${member.studentAccountId}`} className="cursor-pointer" onClick={() => setDetailFor({ member, group })}>
                      <TableCell className="sticky left-0 z-10 bg-background">
                        <p className="truncate text-sm font-medium">{member.name || member.studentId}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{member.studentId}</p>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="font-mono">
                          {group.track} #{group.groupNumber}
                        </span>
                        <span className="block max-w-[220px] truncate text-muted-foreground">{group.supervisorName}</span>
                      </TableCell>
                      {studentColumns.map((label) => (
                        <TableCell key={label} className="text-center tabular-nums">
                          {byLabel.has(label) ? byLabel.get(label)!.toFixed(2) : '—'}
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-semibold tabular-nums">
                        {member.gradeHiddenUntil?.length ? '—' : member.score === null ? '—' : member.score.toFixed(2)}
                      </TableCell>
                      <TableCell className={`text-center font-bold ${gradeTone(member.letter)}`}>{member.letter || '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : filteredGroups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {query ? 'No students match that search.' : 'No groups to grade in this session yet.'}
            </CardContent>
          </Card>
        ) : (
          filteredGroups.map((group) => {
            // Column headers come from the first member's trace, filtered to the scheme's
            // component nodes - every member of a group is graded by the same scheme, so
            // one member is enough to establish the columns.
            const columns = (group.members[0]?.trace || []).filter((t) =>
              group.componentNodeIds.includes(t.nodeId)
            );

            return (
              <Card key={group.groupId}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        <span className="truncate">{group.projectTitle || 'Untitled Project'}</span>
                        <Badge variant="outline">
                          Track {group.track} · #{group.groupNumber}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        Supervisor: {group.supervisorName || 'Unassigned'}
                        {group.schemeName && (
                          <>
                            {' · '}
                            {group.schemeName}
                            {group.schemeVersion ? ` v${group.schemeVersion}` : ' (draft)'}
                          </>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {data?.canSeeWholeSession && (
                        <Button variant="outline" size="sm" asChild title="This group's results, ready to print or save as PDF">
                          <a href={`/api/capstone/sessions/${id}/transcript?scope=groups&groupId=${group.groupId}`} target="_blank" rel="noopener noreferrer">
                            <ScrollText className="mr-1.5 h-4 w-4" /> Results
                          </a>
                        </Button>
                      )}
                      <Button variant="outline" size="sm" asChild title="Open this group's journals and marks">
                        <Link href={`/capstone/groups/${group.groupId}`}>Open group</Link>
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  {/* Horizontal scroll with a pinned Student column, matching the attendance
                      and course marks tables - keeps name/ID readable on a phone while the
                      component columns scroll. */}
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 z-20 min-w-[170px] bg-background sm:min-w-[240px]">
                            Student
                          </TableHead>
                          {columns.map((col) => (
                            <TableHead key={col.nodeId} className="min-w-[110px] text-center">
                              {col.label}
                            </TableHead>
                          ))}
                          <TableHead className="min-w-20 text-center font-semibold">Total</TableHead>
                          <TableHead className="min-w-16 text-center font-semibold">Grade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.members.map((member) => {
                          const byNode = new Map(member.trace.map((t) => [t.nodeId, t]));
                          return (
                            <TableRow
                              key={member.studentAccountId}
                              className="cursor-pointer"
                              onClick={() => setDetailFor({ member, group })}
                            >
                              <TableCell className="sticky left-0 z-10 bg-background">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">
                                    {member.name || member.studentId}
                                  </p>
                                  <p className="truncate font-mono text-xs text-muted-foreground">
                                    {member.studentId}
                                  </p>
                                </div>
                              </TableCell>

                              {columns.map((col) => {
                                const entry = byNode.get(col.nodeId);
                                return (
                                  <TableCell key={col.nodeId} className="text-center tabular-nums">
                                    {entry ? entry.value.toFixed(2) : '—'}
                                  </TableCell>
                                );
                              })}

                              <TableCell className="text-center font-semibold tabular-nums">
                                {member.gradeHiddenUntil?.length ? (
                                  <span
                                    className="text-xs font-normal text-muted-foreground"
                                    title={`Shown once you've submitted your own ${member.gradeHiddenUntil.join(', ')} mark(s)`}
                                  >
                                    after your marks
                                  </span>
                                ) : member.score === null ? '—' : member.score.toFixed(2)}
                              </TableCell>
                              <TableCell
                                className={`text-center font-bold ${gradeTone(member.letter)}`}
                              >
                                {member.letter || '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {group.members.some((m) => m.missingComponents.length > 0) && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Some students are missing marks, so their totals are provisional. Tap a row
                      for the breakdown.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
        </>
        )}
      </div>

      {data?.canSeeWholeSession && (
        <ProgressionWizard sessionId={id} open={moveOpen} onOpenChange={setMoveOpen} onDone={() => setReloadKey((k) => k + 1)} />
      )}

      {/* Per-student breakdown: who submitted what, and whether it counted. */}
      <Dialog open={!!detailFor} onOpenChange={(open) => !open && setDetailFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {detailFor && (
            <>
              <DialogHeader>
                <DialogTitle>{detailFor.member.name || detailFor.member.studentId}</DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  {detailFor.member.studentId}
                  {detailFor.member.email ? ` · ${detailFor.member.email}` : ''}
                </DialogDescription>
                {data?.canSeeWholeSession && (
                  <Button variant="outline" size="sm" className="mt-2 w-fit" asChild>
                    <a href={`/api/capstone/students/${detailFor.member.studentAccountId}/transcript`} target="_blank" rel="noopener noreferrer">
                      <ScrollText className="mr-1.5 h-4 w-4" /> Grade report (every capstone term)
                    </a>
                  </Button>
                )}
              </DialogHeader>

              <div className="space-y-4">
                {detailFor.member.missingComponents.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      Not yet graded
                    </p>
                    <p className="mt-0.5 text-muted-foreground">
                      {detailFor.member.missingComponents
                        .map((c) => COMPONENT_LABELS[c] || c)
                        .join(', ')}
                      . The total below counts these as zero.
                    </p>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Submitted marks
                  </p>
                  {detailFor.member.submissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {detailFor.member.submissions.map((sub, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {COMPONENT_LABELS[sub.component] || sub.component}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {sub.submitterName} ·{' '}
                              {sub.submitterRole === 'supervisor' ? 'Supervisor' : 'Evaluator'}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="tabular-nums">
                              {sub.rawScore}
                              {sub.rubricMax ? ` / ${sub.rubricMax}` : ''}
                            </span>
                            {/* An uncounted mark is shown, not hidden - this is the question
                                that comes up when a student queries their grade. */}
                            <Badge variant={sub.counted ? 'secondary' : 'outline'}>
                              {sub.counted ? 'counted' : 'not counted'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    How the grade was calculated
                  </p>
                  <div className="space-y-1">
                    {detailFor.member.trace.map((step) => (
                      <div
                        key={step.nodeId}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate text-muted-foreground">{step.label}</span>
                        <span className="shrink-0 tabular-nums">{step.value.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {detailFor.member.error && (
                  <p className="text-sm text-destructive">{detailFor.member.error}</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </TeacherShell>
  );
}

const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'];

/**
 * Grades, Simple mode: where the session stands, the few things people do here (print, export,
 * move on) as big buttons, and every student in one plain list. A student opens the same
 * breakdown as in Advanced.
 */
function SimpleGrades({
  sessionId,
  groups,
  canManage,
  canMoveOn,
  exporting,
  onExport,
  onMoveOn,
  onOpen,
}: {
  sessionId: string;
  groups: Group[];
  canManage: boolean;
  canMoveOn: boolean;
  exporting: boolean;
  onExport: () => void;
  onMoveOn: () => void;
  onOpen: (member: Member, group: Group) => void;
}) {
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const tracks = [...new Set(groups.map((g) => g.track))].sort();
  const [track, setTrack] = useState(tracks[0] || 'A');
  const inTrack = groups.filter((g) => g.track === track);
  const rows = inTrack.flatMap((g) => g.members.map((m) => ({ g, m })));
  const graded = rows.filter((r) => r.m.letter && r.m.missingComponents.length === 0);
  const withLetter = rows.filter((r) => r.m.letter);
  const missing = rows.filter((r) => r.m.missingComponents.length > 0);
  const dist = GRADE_ORDER.map((l) => [l, withLetter.filter((r) => r.m.letter === l).length] as const).filter(([, n]) => n > 0);
  const q = query.trim().toLowerCase();
  const shown = rows
    .filter((r) => !onlyMissing || !missing.length || r.m.missingComponents.length > 0)
    .filter((r) => !q || `${r.m.studentId} ${r.m.name || ''} ${r.g.projectTitle} group ${r.g.groupNumber}`.toLowerCase().includes(q))
    .sort((a, b) => a.g.groupNumber - b.g.groupNumber);

  return (
    <div className="space-y-5">
      {tracks.length > 1 && (
        <div className="flex w-fit rounded-lg border p-0.5" role="tablist" aria-label="Track">
          {tracks.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={track === t}
              onClick={() => setTrack(t)}
              className={cn('rounded-md px-4 py-1.5 text-sm font-medium', track === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              Capstone {t}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-3xl font-bold tabular-nums">
            {graded.length} <span className="text-lg font-normal text-muted-foreground">/ {rows.length}</span>
          </p>
          <p className="text-sm text-muted-foreground">students with every mark in</p>
        </div>
        {/* Tap to list only the students still missing a mark. */}
        <button
          type="button"
          disabled={!missing.length}
          aria-pressed={onlyMissing}
          onClick={() => setOnlyMissing((v) => !v)}
          className={cn(
            'rounded-2xl border bg-card p-5 text-left transition-colors enabled:cursor-pointer enabled:hover:border-amber-500',
            missing.length && 'border-amber-500/50',
            onlyMissing && 'border-amber-500 ring-2 ring-amber-500/30'
          )}
        >
          <p className={cn('text-3xl font-bold tabular-nums', missing.length ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>{missing.length}</p>
          <p className="text-sm text-muted-foreground">
            {missing.length ? (onlyMissing ? 'still missing a mark - showing only them' : 'still missing a mark - tap to list them') : 'nobody is missing a mark'}
          </p>
        </button>
        <div className="rounded-2xl border bg-card p-5">
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold tabular-nums">
            {dist.length ? dist.map(([l, n]) => <span key={l}>{l}: {n}</span>) : <span className="font-normal text-muted-foreground">No grades yet</span>}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">grade spread</p>
        </div>
      </div>

      {canManage && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Button size="lg" variant="outline" className="h-14 text-base" asChild>
            <a href={`/api/capstone/sessions/${sessionId}/transcript?scope=roster&track=${track}`} target="_blank" rel="noopener noreferrer">
              <FileText className="mr-2 h-5 w-5" /> Print grade sheet
            </a>
          </Button>
          <Button size="lg" variant="outline" className="h-14 text-base" onClick={onExport} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileSpreadsheet className="mr-2 h-5 w-5" />} Download Excel
          </Button>
          <Button size="lg" className="h-14 text-base" onClick={onMoveOn} disabled={!canMoveOn} title={canMoveOn ? '' : 'After you finish the session (publish results)'}>
            <ArrowRightCircle className="mr-2 h-5 w-5" /> {canMoveOn ? 'Move groups on' : 'Move on - after finishing'}
          </Button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-11 pl-9" placeholder="Find a student, ID or project" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {shown.map(({ g, m }) => (
          <li key={`${g.groupId}:${m.studentAccountId}`}>
            <button type="button" onClick={() => onOpen(m, g)} className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{(m.name || m.studentId).replace(/\s*\(\d{6,}\)\s*$/, '')}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {m.studentId} · Group {g.groupNumber}
                  {m.missingComponents.length > 0 && <span className="text-amber-700 dark:text-amber-400"> · missing: {m.missingComponents.join(', ')}</span>}
                </span>
              </span>
              <span className="w-16 shrink-0 text-right text-sm tabular-nums">{m.score === null ? '-' : m.score.toFixed(2)}</span>
              <span className={cn('w-10 shrink-0 rounded-md py-1 text-center text-sm font-bold', m.letter === 'F' ? 'bg-destructive/10 text-destructive' : m.letter ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                {m.letter || '-'}
              </span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="p-8 text-center text-muted-foreground">No student matches.</li>}
      </ul>
    </div>
  );
}
