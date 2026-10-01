'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileStack, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Group {
  _id: string;
  track: string;
  groupNumber: number;
  projectTitle: string;
  members: Array<{ studentAccountId: { _id: string; studentId: string; name: string } | string; studentIdText: string; removedAt?: string | null }>;
}

type Scope = 'track' | 'group' | 'student';

/**
 * The capstone course file, sheet by sheet: pick a track, whether it covers the whole track, one
 * group or one student, then open any sheet (each prints as its own PDF) or all of them.
 * The sheets offered come from the track's grading scheme.
 */
export function CourseFileDialog({ sessionId, tracks, groups, open, onOpenChange }: { sessionId: string; tracks: string[]; groups: Group[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [track, setTrack] = useState(tracks[0] || 'A');
  const [scope, setScope] = useState<Scope>('track');
  const [groupId, setGroupId] = useState('');
  const [studentId, setStudentId] = useState('');
  // What the server said for a track; anything for another track means "still loading".
  const [result, setResult] = useState<{ track: string; sheets?: Array<{ key: string; label: string }>; problem?: string } | null>(null);
  const current = result && result.track === track ? result : null;
  const sheets = current?.sheets ?? null;
  const problem = current?.problem ?? null;

  const trackGroups = useMemo(() => groups.filter((g) => g.track === track).sort((a, b) => a.groupNumber - b.groupNumber), [groups, track]);
  const students = useMemo(
    () =>
      trackGroups.flatMap((g) =>
        g.members
          .filter((m) => !m.removedAt)
          .map((m) => {
            const acc = typeof m.studentAccountId === 'object' ? m.studentAccountId : null;
            return { id: acc?._id || String(m.studentAccountId), label: `${acc?.studentId || m.studentIdText} ${acc?.name || ''} · G${g.groupNumber}` };
          })
      ),
    [trackGroups]
  );

  useEffect(() => {
    if (!open) return;
    fetch(`/api/capstone/sessions/${sessionId}/course-file?track=${track}&list=1`)
      .then(async (r) => {
        if ((r.headers.get('content-type') || '').includes('application/json')) {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Could not load the course file');
          setResult({ track, sheets: d.sheets });
        } else {
          // The route explains a missing scheme etc. as a small HTML page.
          const text = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          setResult({ track, problem: text.slice(0, 200) || 'This track has no course file yet.' });
        }
      })
      .catch((e) => setResult({ track, problem: e instanceof Error ? e.message : 'Could not load the course file' }));
  }, [open, sessionId, track]);

  const ready = scope === 'track' || (scope === 'group' && groupId) || (scope === 'student' && studentId);
  const url = (sheet?: string) => {
    const q = new URLSearchParams({ track });
    if (scope === 'group' && groupId) q.set('groupId', groupId);
    if (scope === 'student' && studentId) q.set('studentAccountId', studentId);
    if (sheet) q.set('sheet', sheet);
    return `/api/capstone/sessions/${sessionId}/course-file?${q}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileStack className="h-5 w-5" /> Course file (CO-PO)
          </DialogTitle>
          <DialogDescription>Each sheet opens ready to print or save as its own PDF. The sheets follow the track&apos;s grading scheme.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Track">
              {tracks.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={track === t}
                  onClick={() => {
                    setTrack(t);
                    setGroupId('');
                    setStudentId('');
                  }}
                  className={cn('rounded-md px-3 py-1 text-sm', track === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  Capstone {t}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Covers">
              {(
                [
                  ['track', 'Whole track'],
                  ['group', 'One group'],
                  ['student', 'One student'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={scope === k}
                  onClick={() => setScope(k)}
                  className={cn('rounded-md px-3 py-1 text-sm', scope === k ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {scope === 'group' && (
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" aria-label="Group">
              <option value="">Choose a group…</option>
              {trackGroups.map((g) => (
                <option key={g._id} value={g._id}>
                  Group {g.groupNumber} - {g.projectTitle}
                </option>
              ))}
            </select>
          )}
          {scope === 'student' && (
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" aria-label="Student">
              <option value="">Choose a student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}

          {problem ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{problem}</p>
          ) : !sheets ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              <ul className="divide-y rounded-lg border">
                {sheets.map((sh) => (
                  <li key={sh.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm">{sh.label}</span>
                    <Button size="sm" variant="ghost" className="h-8" disabled={!ready} asChild={!!ready}>
                      {ready ? (
                        <a href={url(sh.key)} target="_blank" rel="noopener noreferrer">
                          Open <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span>Open</span>
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
              <Button className="w-full" disabled={!ready} asChild={!!ready}>
                {ready ? (
                  <a href={url()} target="_blank" rel="noopener noreferrer">
                    Open every sheet together
                  </a>
                ) : (
                  <span>Choose a {scope} first</span>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
