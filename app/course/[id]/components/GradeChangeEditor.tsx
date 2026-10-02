'use client';

import { useMemo, useState } from 'react';
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { openPrintTab, printManualForms, type GradeChangeDetails, type GradeStatus, type GradeStatusApi } from './useGradeStatus';

// The manual grade change form: every field editable, any students of the course. For a
// second grade change, or anything the automatic one doesn't cover (lib/gradeChange.ts).

const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F', 'W', 'I'];

interface Row {
  studentRecordId: string;
  studentId: string;
  studentName: string;
  oldGrade: string;
  newGrade: string;
  reason: string;
}

const DETAIL_FIELDS: Array<[keyof GradeChangeDetails, string]> = [
  ['program', 'Name of the program'],
  ['term', 'Term'],
  ['courseCode', 'Course code'],
  ['courseTitle', 'Course title'],
  ['section', 'Section'],
  ['teacherName', 'Name of the teacher'],
  ['headName', 'Name of the head of the dept.'],
];

const headKey = (code?: string) => `grade-form-head:${code || 'none'}`;
const remembered = (key: string) => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

/** A row for one student, pre-filled from what the course knows. */
export function rowFor(data: GradeStatus, studentRecordId: string): Row | null {
  const g = data.grades.find((x) => x.studentRecordId === studentRecordId);
  if (!g) return null;
  const pending = data.changes.find((c) => c.studentRecordId === studentRecordId);
  const finished = data.status === 'finished';
  return {
    studentRecordId,
    studentId: g.studentId,
    studentName: g.name,
    // Finished: from the official grade to what the marks give now. Running: the grade now, new grade to fill in.
    oldGrade: finished ? g.official || g.current : g.current,
    newGrade: finished && g.official !== g.current ? g.current : '',
    reason: pending?.reason || '',
  };
}

export function GradeChangeEditor({
  open,
  onOpenChange,
  courseId,
  gs,
  initialStudentIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  gs: GradeStatusApi;
  initialStudentIds: string[];
}) {
  const data = gs.data;
  const [details, setDetails] = useState<GradeChangeDetails>(() => {
    const d = data?.form || { program: '', headName: '', teacherName: '', term: '', courseCode: '', courseTitle: '', section: '' };
    return { ...d, headName: d.headName || remembered(headKey(data?.department?.code)) };
  });
  const [rows, setRows] = useState<Row[]>(() => (data ? initialStudentIds.map((id) => rowFor(data, id)).filter((r): r is Row => !!r) : []));
  const [record, setRecord] = useState(data?.status === 'finished');
  const [busy, setBusy] = useState(false);

  const available = useMemo(() => (data?.grades || []).filter((g) => !rows.some((r) => r.studentRecordId === g.studentRecordId)), [data, rows]);

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (!data) return;
    if (rows.length === 0) return toast.error('Add at least one student');
    const missing = rows.find((r) => !r.oldGrade.trim() || !r.newGrade.trim());
    if (missing) return toast.error(`Fill in the previous and new grade for ${missing.studentId}`);
    const same = rows.find((r) => r.oldGrade.trim().toUpperCase() === r.newGrade.trim().toUpperCase());
    if (same && !confirm(`${same.studentId}: the previous and new grade are both ${same.newGrade}. Print anyway?`)) return;
    if (!details.headName.trim() && !confirm('The head of the department is empty - it will print blank, to be written by hand. Continue?')) return;
    try {
      if (details.headName.trim() && !data.department?.headName) localStorage.setItem(headKey(data.department?.code), details.headName.trim());
    } catch {
      /* storage unavailable */
    }
    const tab = openPrintTab();
    setBusy(true);
    try {
      if (record) {
        const res = await fetch(`/api/courses/${courseId}/grade-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'record', details, rows }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to record');
        gs.apply(json);
        toast.success(rows.length === 1 ? 'Grade change recorded' : `${rows.length} grade changes recorded`);
      }
      printManualForms(courseId, details, rows, tab);
      onOpenChange(false);
    } catch (err) {
      tab?.close();
      toast.error(err instanceof Error ? err.message : 'Failed to record');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Grade change form</DialogTitle>
          <DialogDescription>
            Every field can be changed. Use it for a second grade change, or any change the automatic form doesn&apos;t cover. One page per student.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Form details</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {DETAIL_FIELDS.map(([key, label]) => (
                  <div key={key} className={key === 'program' || key === 'courseTitle' ? 'space-y-1 sm:col-span-2' : 'space-y-1'}>
                    <Label htmlFor={`gc-${key}`} className="text-xs">
                      {label}
                    </Label>
                    <Input id={`gc-${key}`} value={details[key]} onChange={(e) => setDetails((d) => ({ ...d, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              {!data.department?.headName && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  No department head is set. Ask your coordinator to set the department head - until then, type the name here.
                </p>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Students ({rows.length})</h3>
                <select
                  className="h-9 max-w-xs rounded-md border bg-background px-2 text-sm"
                  value=""
                  onChange={(e) => {
                    const r = rowFor(data, e.target.value);
                    if (r) setRows((rs) => [...rs, r]);
                  }}
                  aria-label="Add a student"
                >
                  <option value="">+ Add a student…</option>
                  {available.map((g) => (
                    <option key={g.studentRecordId} value={g.studentRecordId}>
                      {g.studentId} - {g.name} ({data.status === 'finished' ? g.official || g.current : g.current})
                    </option>
                  ))}
                </select>
              </div>

              {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <Plus className="mx-auto mb-1 h-5 w-5" /> Add the students who need a form.
                </p>
              ) : (
                <ul className="space-y-3">
                  {rows.map((r, i) => {
                    const g = data.grades.find((x) => x.studentRecordId === r.studentRecordId);
                    return (
                      <li key={r.studentRecordId} className="space-y-2 rounded-lg border p-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="w-32 space-y-1">
                            <Label className="text-xs">Student ID</Label>
                            <Input value={r.studentId} onChange={(e) => setRow(i, { studentId: e.target.value })} />
                          </div>
                          <div className="min-w-40 flex-1 space-y-1">
                            <Label className="text-xs">Student name</Label>
                            <Input value={r.studentName} onChange={(e) => setRow(i, { studentName: e.target.value })} />
                          </div>
                          <div className="w-24 space-y-1">
                            <Label className="text-xs">Previous grade</Label>
                            <Input list="gc-grades" value={r.oldGrade} onChange={(e) => setRow(i, { oldGrade: e.target.value.toUpperCase() })} />
                          </div>
                          <div className="w-24 space-y-1">
                            <Label className="text-xs">New grade</Label>
                            <Input list="gc-grades" value={r.newGrade} onChange={(e) => setRow(i, { newGrade: e.target.value.toUpperCase() })} />
                          </div>
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {g && (
                          <p className="text-xs text-muted-foreground">
                            Marks now give <strong>{g.current}</strong> ({g.currentTotal.toFixed(2)})
                            {g.original ? ` · grade when finished ${g.original}` : ''}
                            {g.official && g.official !== g.original ? ` · official now ${g.official}` : ''}
                            {g.changes ? ` · ${g.changes} grade change${g.changes === 1 ? '' : 's'} before` : ''}
                          </p>
                        )}
                        <Textarea rows={2} maxLength={1000} placeholder="Reason(s) for change" value={r.reason} onChange={(e) => setRow(i, { reason: e.target.value })} />
                      </li>
                    );
                  })}
                </ul>
              )}
              <datalist id="gc-grades">
                {GRADES.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </section>

            <label className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <Checkbox checked={record} onCheckedChange={(v) => setRecord(v === true)} className="mt-0.5" />
              <span>
                <span className="font-medium">Record in the grade history</span>
                <span className="block text-xs text-muted-foreground">
                  Keeps this change on record{data.status === 'finished' ? ' and makes the new grade the official one' : ''}. Leave it off to just print.
                </span>
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !data || rows.length === 0}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            {record ? 'Record & print' : 'Print'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
