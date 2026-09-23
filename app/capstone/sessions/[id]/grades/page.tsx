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
  AlertTriangle,
  ArrowLeft,
  Search,
  Workflow,
} from 'lucide-react';
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
  }, [id]);

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
    if (!q) return data.groups;
    return data.groups
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
  }, [data, query]);

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
          <Button variant="outline" size="sm" onClick={() => router.push('/capstone/sessions')} title="Back to capstone sessions">
            <ArrowLeft className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Sessions</span>
          </Button>
          {data?.canSeeWholeSession && (
            <Button size="sm" onClick={exportXlsx} disabled={exporting} title="Download every group's grades, components and raw marks as an Excel workbook">
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
                href="/capstone/sessions"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Workflow className="h-3.5 w-3.5" />
                Pin a grading scheme
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by student, ID or project…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {filteredGroups.length === 0 ? (
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
                    <Button variant="outline" size="sm" asChild title="Open this group's journals and marks">
                      <Link href={`/capstone/groups/${group.groupId}`}>Open group</Link>
                    </Button>
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
      </div>

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
