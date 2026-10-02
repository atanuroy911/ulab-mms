'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// The course's status and grade changes (GET /api/courses/[id]/grade-status), loaded once for
// the whole course page and re-checked whenever marks change - see lib/gradeChange.ts.

export interface GradeChangeDetails {
  program: string;
  headName: string;
  teacherName: string;
  term: string;
  courseCode: string;
  courseTitle: string;
  section: string;
}

export interface PendingGradeChange {
  studentRecordId: string;
  studentId: string;
  name: string;
  oldGrade: string;
  newGrade: string;
  oldTotal: number;
  newTotal: number;
  /** Already had a grade change sent: this one goes on the manual form. */
  repeat: boolean;
  reason: string;
}

export interface SentGradeChange {
  _id: string;
  studentRecordId: string;
  studentId: string;
  name: string;
  oldGrade: string;
  newGrade: string;
  reason: string;
  kind: 'auto' | 'manual';
  sentAt: string;
}

export interface StudentGrade {
  studentRecordId: string;
  studentId: string;
  name: string;
  withdrawn: boolean;
  /** What the marks give now. */
  current: string;
  currentTotal: number;
  /** Finished courses: the official grade now (moves with each change sent)... */
  official: string | null;
  /** ...and the grade when the course was finished. */
  original: string | null;
  /** Grade changes sent for this student. */
  changes: number;
}

export interface GradeStatus {
  status: 'running' | 'finished';
  finishedAt: string | null;
  grades: StudentGrade[];
  changes: PendingGradeChange[];
  history: SentGradeChange[];
  form: GradeChangeDetails;
  department: { code: string; program: string; headName: string } | null;
  canSetHead: boolean;
}

export interface GradeStatusApi {
  data: GradeStatus | null;
  apply: (d: GradeStatus) => void;
  patch: (fn: (d: GradeStatus) => GradeStatus) => void;
  reload: () => Promise<void>;
  /** The automatic change waiting for this student, if any. */
  changeFor: (studentRecordId: string) => PendingGradeChange | undefined;
}

export function useGradeStatus(courseId: string | undefined, marksKey: string, onStatus?: (s: 'running' | 'finished') => void): GradeStatusApi {
  const [data, setData] = useState<GradeStatus | null>(null);
  const onStatusRef = useRef(onStatus);
  useEffect(() => {
    onStatusRef.current = onStatus;
  });
  // Students already announced, so a re-check only toasts about new grade changes.
  const announced = useRef<Set<string> | null>(null);

  const apply = useCallback((d: GradeStatus) => {
    const key = (c: PendingGradeChange) => `${c.studentRecordId}:${c.newGrade}`;
    if (announced.current) {
      const fresh = d.changes.filter((c) => !announced.current!.has(key(c)));
      if (d.status === 'finished' && fresh.length > 0) {
        const c = fresh[0];
        toast.warning(
          fresh.length === 1
            ? `${c.studentId}'s grade changed: ${c.oldGrade} → ${c.newGrade}. The course is finished, so this needs a grade change form.`
            : `${fresh.length} students' grades changed. The course is finished, so each needs a grade change form.`,
          { duration: 8000 }
        );
      }
    }
    announced.current = new Set(d.changes.map(key));
    setData(d);
    onStatusRef.current?.(d.status);
  }, []);

  const reload = useCallback(async () => {
    if (!courseId) return;
    try {
      const res = await fetch(`/api/courses/${courseId}/grade-status`);
      if (res.ok) apply(await res.json());
    } catch {
      /* keep what we have */
    }
  }, [apply, courseId]);

  // Re-check after marks change (debounced: bulk entry changes them many times a second).
  const loaded = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(reload, loaded.current ? 700 : 0);
    loaded.current = true;
    return () => window.clearTimeout(t);
  }, [reload, marksKey]);

  const patch = useCallback((fn: (d: GradeStatus) => GradeStatus) => setData((d) => (d ? fn(d) : d)), []);
  const changeFor = useCallback((sid: string) => data?.changes.find((c) => c.studentRecordId === sid), [data]);

  return { data, apply, patch, reload, changeFor };
}

/**
 * A tab for a print view, opened right away - inside the click - so the browser doesn't block
 * it as a pop-up when the address only arrives after a save.
 */
export function openPrintTab(): Window | null {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font:14px Arial,sans-serif;padding:24px;color:#555">Preparing the grade change form…</p>');
  return w;
}

/** Shows the manual form, exactly as filled in, in `tab` (a form post, so nothing is recorded). */
export function printManualForms(
  courseId: string,
  details: GradeChangeDetails,
  rows: Array<{ studentId: string; studentName: string; oldGrade: string; newGrade: string; reason: string }>,
  tab: Window | null
) {
  const name = `grade-change-${Date.now()}`;
  if (tab) tab.name = name;
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `/api/courses/${courseId}/grade-change-form`;
  form.target = tab ? name : '_blank';
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'payload';
  input.value = JSON.stringify({ details, rows });
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}
