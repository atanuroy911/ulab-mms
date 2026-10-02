'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, FilePen, FileText, History, Info, Loader2, PlayCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { openPrintTab, type GradeStatusApi, type PendingGradeChange } from './useGradeStatus';

// Course status (running / finished) and grade change forms - see lib/gradeChange.ts.
//   CourseStatusPill   - in the course header: the status, and its menu.
//   GradeChangesDialog - the grade changes waiting for a form, and the history.
//   MarksGradeChangeHint - one line on the Marks tab of a finished course.

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

/** The status as a small pill - also used on the dashboard's course cards. */
export function StatusPill({ status, owed = 0, className }: { status?: 'running' | 'finished'; owed?: number; className?: string }) {
  const finished = status === 'finished';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
        finished ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
        className
      )}
      title={finished ? 'Finished - grades are final' : 'Running - grades still being worked on'}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', finished ? 'bg-emerald-500' : 'bg-sky-500')} />
      {finished ? 'Finished' : 'Running'}
      {owed > 0 && <span className="rounded-full bg-amber-500 px-1.5 py-px text-[10px] font-bold text-white">{owed}</span>}
    </span>
  );
}

/** The header pill: shows the status; its menu finishes / reopens the course and opens the grade change forms. */
export function CourseStatusPill({
  courseId,
  studentCount,
  gs,
  onOpenChanges,
  onOpenEditor,
}: {
  courseId: string;
  studentCount: number;
  gs: GradeStatusApi;
  onOpenChanges: () => void;
  onOpenEditor: (studentRecordIds: string[]) => void;
}) {
  const data = gs.data;
  const [confirm, setConfirm] = useState<'finish' | 'reopen' | null>(null);
  const [busy, setBusy] = useState(false);
  const finished = data?.status === 'finished';
  const owed = finished ? data?.changes.length || 0 : 0;

  const changeStatus = async (action: 'finish' | 'reopen') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/grade-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      gs.apply(json);
      toast.success(action === 'finish' ? 'Course finished - grades recorded as final' : 'Course is running again');
      setConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="ml-1 inline-flex items-center rounded-full align-middle focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Course status">
            <StatusPill status={data.status} owed={owed} className="cursor-pointer hover:brightness-95" />
            <ChevronDown className="ml-0.5 h-3 w-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {finished ? `Grades final since ${fmt(data.finishedAt)}. Marks stay editable; a grade that changes needs a grade change form.` : 'When the grades are final, mark the course finished. Marks stay editable afterwards.'}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {finished ? (
            <>
              <DropdownMenuItem onClick={onOpenChanges}>
                <FileText className="mr-2 h-4 w-4" />
                Grade changes{owed ? ` (${owed} need a form)` : ''}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenEditor([])}>
                <FilePen className="mr-2 h-4 w-4" />
                Manual grade change form…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setConfirm('reopen')}>
                <PlayCircle className="mr-2 h-4 w-4" />
                Mark as running
              </DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuItem onClick={() => setConfirm('finish')} disabled={studentCount === 0}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark as finished
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenEditor([])}>
                <FilePen className="mr-2 h-4 w-4" />
                Manual grade change form…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm === 'finish' ? 'Mark the course as finished?' : 'Mark the course as running again?'}</DialogTitle>
            <DialogDescription asChild>
              {confirm === 'finish' ? (
                <div className="space-y-2 text-sm">
                  <p>The grades of all {studentCount} students are recorded as final, as the marks give them now.</p>
                  <p>You can still edit marks. If a student&apos;s grade changes after this, a Grade Change Form is prepared for them.</p>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <p>Grade changes stop being tracked while the course is running.</p>
                  <p>
                    When you finish it again, the grades at that moment become the final ones
                    {owed ? ` - including the ${owed} change${owed === 1 ? '' : 's'} not yet sent` : ''}. The grade change history is kept.
                  </p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => confirm && changeStatus(confirm)} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirm === 'finish' ? 'Mark as finished' : 'Mark as running'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One line on the Marks tab of a finished course - so editing marks never surprises. */
export function MarksGradeChangeHint({ gs, onOpenChanges }: { gs: GradeStatusApi; onOpenChanges: () => void }) {
  const data = gs.data;
  if (!data || data.status !== 'finished') return null;
  const owed = data.changes.length;
  return (
    <p className={cn('mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs', owed ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
      {owed ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Info className="h-3.5 w-3.5 shrink-0" />}
      {owed
        ? `${owed === 1 ? '1 student’s grade has' : `${owed} students’ grades have`} changed since the course was finished - each needs a grade change form.`
        : 'This course is finished. Editing marks is fine; if a student’s grade changes, a grade change form is prepared.'}
      <button type="button" onClick={onOpenChanges} className="font-medium underline underline-offset-2 hover:no-underline">
        {owed ? 'Open grade changes' : 'Grade changes'}
      </button>
    </p>
  );
}

// What the teacher typed for a missing head / program, remembered on this device.
const PROGRAM_KEY = 'grade-form-program';
const remembered = (key: string) => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};
const remember = (key: string, value: string) => {
  try {
    if (value.trim()) localStorage.setItem(key, value.trim());
  } catch {
    /* storage unavailable */
  }
};

/** The grade changes waiting for a form (automatic), the history, and the way to the manual form. */
export function GradeChangesDialog({
  open,
  onOpenChange,
  courseId,
  gs,
  onOpenEditor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  gs: GradeStatusApi;
  onOpenEditor: (studentRecordIds: string[]) => void;
}) {
  const data = gs.data;
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [showHistory, setShowHistory] = useState(false);
  const headKey = `grade-form-head:${data?.department?.code || 'none'}`;
  const [head, setHead] = useState(() => remembered(headKey));
  const [program, setProgram] = useState(() => remembered(PROGRAM_KEY));
  const [editingHead, setEditingHead] = useState(false);

  const reasonOf = (c: PendingGradeChange) => reasons[c.studentRecordId] ?? c.reason;

  const post = async (body: object, label: string) => {
    setBusy(label);
    try {
      const res = await fetch(`/api/courses/${courseId}/grade-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      return json;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const saveReason = async (c: PendingGradeChange) => {
    const reason = reasonOf(c).trim();
    if (reason === c.reason.trim()) return true;
    const ok = await post({ action: 'reason', studentRecordId: c.studentRecordId, reason }, `reason:${c.studentRecordId}`);
    if (ok) gs.patch((d) => ({ ...d, changes: d.changes.map((x) => (x.studentRecordId === c.studentRecordId ? { ...x, reason } : x)) }));
    return !!ok;
  };

  const headMissing = !data?.department?.headName;
  const programMissing = !data?.department?.program;
  const details = () => ({ ...(headMissing && head.trim() ? { headName: head.trim() } : {}), ...(programMissing && program.trim() ? { program: program.trim() } : {}) });

  const openForms = async (changes: PendingGradeChange[]) => {
    const tab = openPrintTab();
    for (const c of changes) {
      if (!(await saveReason(c))) {
        tab?.close();
        return;
      }
    }
    if (headMissing) remember(headKey, head);
    if (programMissing) remember(PROGRAM_KEY, program);
    const q = new URLSearchParams({ students: changes.map((c) => c.studentRecordId).join(',') });
    if (headMissing && head.trim()) q.set('head', head.trim());
    if (programMissing && program.trim()) q.set('program', program.trim());
    const url = `/api/courses/${courseId}/grade-change-form?${q}`;
    if (tab) tab.location.href = url;
    else window.open(url, '_blank');
  };

  const markSent = async (changes: PendingGradeChange[]) => {
    if (
      !window.confirm(
        changes.length === 1
          ? `Mark ${changes[0].studentId}'s form as sent?\n\n${changes[0].oldGrade} → ${changes[0].newGrade} becomes the official grade and is kept on record.`
          : `Mark all ${changes.length} forms as sent?\n\nEach new grade becomes the official grade and is kept on record.`
      )
    ) {
      return;
    }
    for (const c of changes) if (!(await saveReason(c))) return;
    const json = await post({ action: 'sent', studentRecordIds: changes.map((c) => c.studentRecordId), details: details() }, 'sent');
    if (json) {
      gs.apply(json);
      toast.success(changes.length === 1 ? 'Form marked as sent' : `${changes.length} forms marked as sent`);
    }
  };

  const saveHeadForDepartment = async () => {
    if (!data?.department || !head.trim()) return;
    setBusy('head');
    try {
      const res = await fetch(`/api/departments/${data.department.code}/head-name`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ headName: head.trim() }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      gs.patch((d) => (d.department ? { ...d, department: { ...d.department, headName: json.headName }, form: { ...d.form, headName: json.headName } } : d));
      setEditingHead(false);
      toast.success(`Department head saved for every ${data.department.code} form`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(null);
    }
  };

  const finished = data?.status === 'finished';
  const firstChanges = data?.changes.filter((c) => !c.repeat) || [];
  const repeatChanges = data?.changes.filter((c) => c.repeat) || [];
  const openEditor = (ids: string[]) => {
    onOpenChange(false);
    onOpenEditor(ids);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Grade changes</DialogTitle>
          <DialogDescription>
            {finished
              ? `Grades are final since ${fmt(data?.finishedAt ?? null)}. A grade that changes after that needs the Controller of Examinations' Grade Change Form.`
              : 'The course is running, so grade changes aren’t tracked yet. Mark it finished from the status pill when the grades are final - or use the manual form.'}
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {finished && data.changes.length === 0 && (
              <p className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> No grade changes waiting. Every student has their official grade.
              </p>
            )}

            {finished && data.changes.length > 0 && (
              <>
                {/* Who signs: the department's head, set by a coordinator or admin */}
                <div className={cn('rounded-lg border px-3 py-2.5 text-sm', headMissing || programMissing ? 'border-amber-500/40 bg-amber-500/5' : 'bg-muted/30')}>
                  {!headMissing && !editingHead ? (
                    <p className="flex flex-wrap items-center gap-x-2">
                      <span className="text-muted-foreground">Head of the department on the form:</span>
                      <span className="font-medium">{data.department!.headName}</span>
                      {data.canSetHead && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0"
                          onClick={() => {
                            setHead(data.department!.headName);
                            setEditingHead(true);
                          }}
                        >
                          Change
                        </Button>
                      )}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {headMissing && (
                        <p className="font-medium text-amber-800 dark:text-amber-300">
                          {data.canSetHead
                            ? `No department head is set for ${data.department?.code}. Set it once here and it goes on every form from the department.`
                            : data.department
                              ? 'No department head is set. Ask your coordinator to set the department head. Until then, type the name for these forms.'
                              : 'This course isn’t linked to a department. Ask your coordinator to set the department head, or type the names for these forms.'}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Input className="h-9 max-w-xs" placeholder="Head of the department’s name" value={head} onChange={(e) => setHead(e.target.value)} />
                        {data.canSetHead && (
                          <Button size="sm" onClick={saveHeadForDepartment} disabled={busy === 'head' || !head.trim()}>
                            {busy === 'head' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save for the department
                          </Button>
                        )}
                        {editingHead && (
                          <Button size="sm" variant="ghost" onClick={() => setEditingHead(false)}>
                            Cancel
                          </Button>
                        )}
                      </div>
                      {data.canSetHead && !headMissing && <p className="text-xs text-muted-foreground">It can be changed, not removed.</p>}
                    </div>
                  )}
                  {programMissing && (
                    <div className="mt-2">
                      <Input className="h-9 max-w-sm" placeholder="Name of the program, e.g. BSc in Computer Science & Engineering" value={program} onChange={(e) => setProgram(e.target.value)} />
                    </div>
                  )}
                </div>

                {firstChanges.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        {firstChanges.length === 1 ? '1 grade change needs a form' : `${firstChanges.length} grade changes need a form`}
                      </p>
                      {firstChanges.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => openForms(firstChanges)} disabled={!!busy}>
                            <FileText className="mr-1.5 h-4 w-4" /> All forms (PDF)
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => markSent(firstChanges)} disabled={!!busy}>
                            <Send className="mr-1.5 h-4 w-4" /> All sent
                          </Button>
                        </div>
                      )}
                    </div>
                    <ul className="divide-y rounded-lg border">
                      {firstChanges.map((c) => (
                        <li key={c.studentRecordId} className="space-y-2 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                <span className="font-mono text-sm text-muted-foreground">{c.studentId}</span> {c.name}
                              </p>
                              <p className="text-sm">
                                <span className="font-semibold">{c.oldGrade}</span>
                                <span className="text-muted-foreground"> ({c.oldTotal.toFixed(2)}) → </span>
                                <span className="font-semibold text-amber-700 dark:text-amber-400">{c.newGrade}</span>
                                <span className="text-muted-foreground"> ({c.newTotal.toFixed(2)})</span>
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => openForms([c])} disabled={!!busy}>
                                <FileText className="mr-1.5 h-4 w-4" /> Form
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => markSent([c])} disabled={!!busy}>
                                <Send className="mr-1.5 h-4 w-4" /> Sent
                              </Button>
                            </div>
                          </div>
                          <Textarea
                            rows={2}
                            maxLength={1000}
                            placeholder="Reason(s) for change - printed on the form, e.g. Final exam script re-checked; marks of Q3 were not added."
                            value={reasonOf(c)}
                            onChange={(e) => setReasons((r) => ({ ...r, [c.studentRecordId]: e.target.value }))}
                            onBlur={() => saveReason(c)}
                          />
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      Print the form, sign it and have the department head sign it, then mark it <strong>Sent</strong>: the new grade becomes the official one and the change is kept on record.
                    </p>
                  </div>
                )}

                {repeatChanges.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-amber-500/40 p-3">
                    <p className="text-sm font-semibold">Changed again after a grade change</p>
                    <p className="text-xs text-muted-foreground">These students already had a grade change sent. A further change goes on the manual form, where you check every field before printing.</p>
                    <ul className="divide-y">
                      {repeatChanges.map((c) => (
                        <li key={c.studentRecordId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <span className="min-w-0 text-sm">
                            <span className="font-mono text-muted-foreground">{c.studentId}</span> {c.name} ·{' '}
                            <strong>
                              {c.oldGrade} → {c.newGrade}
                            </strong>
                          </span>
                          <Button size="sm" variant="outline" onClick={() => openEditor([c.studentRecordId])}>
                            <FilePen className="mr-1.5 h-4 w-4" /> Manual form
                          </Button>
                        </li>
                      ))}
                    </ul>
                    {repeatChanges.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => openEditor(repeatChanges.map((c) => c.studentRecordId))}>
                        All {repeatChanges.length} on one manual form
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}

            {data.history.length > 0 && (
              <div>
                <button type="button" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setShowHistory((v) => !v)}>
                  <History className="h-4 w-4" /> Grade change history ({data.history.length})
                  <ChevronDown className={cn('h-4 w-4 transition-transform', showHistory && 'rotate-180')} />
                </button>
                {showHistory && (
                  <ul className="mt-2 divide-y rounded-lg border text-sm">
                    {data.history.map((h) => (
                      <li key={h._id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                        <span className="min-w-0">
                          <span className="font-mono text-muted-foreground">{h.studentId}</span> {h.name} ·{' '}
                          <strong>
                            {h.oldGrade} → {h.newGrade}
                          </strong>
                          <span className="text-muted-foreground">
                            {' '}
                            · {h.kind === 'manual' ? 'manual form' : 'form'} sent {fmt(h.sentAt)}
                          </span>
                          {h.reason && <span className="block truncate text-xs text-muted-foreground">{h.reason}</span>}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => window.open(`/api/courses/${courseId}/grade-change-form?changes=${h._id}`, '_blank')}>
                          <FileText className="mr-1.5 h-4 w-4" /> Form
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => openEditor([])} disabled={!data}>
            <FilePen className="mr-1.5 h-4 w-4" /> Manual form…
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!busy}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
