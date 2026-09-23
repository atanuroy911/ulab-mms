'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Trash2, DownloadCloud, ExternalLink, PlugZap, LogIn, Plus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  resolveExtensionId,
  connectAndLookupStudents,
  URMS_EXTENSION_STORE_URL,
  type StudentLookupSession,
  type UrmsStudentLookupStatus,
} from '@/lib/urmsExtensionImport';

/**
 * Member entry for capstone groups, in two tabs over the same list:
 *
 *  - Form: one numbered row per student (ID, name, email) with an "Add student" button.
 *    Pasting a multi-line list into an ID box fills several rows at once.
 *  - CSV:  `id, name, email` per line, parsed as you type - no Add button, nothing pending.
 *
 * When only an ID (or ID + name) is given, the missing fields can be pulled from URMS
 * through the Faculty Companion extension, which replays the StudentRegistration lookup with
 * the user's existing URMS cookies. If that session has expired the extension says so, and
 * this offers to open URMS's login in a popup and retry on the same connection.
 *
 * The parent only ever receives complete-enough rows (those with a student ID), de-duplicated
 * by ID. Half-filled form rows stay here, flagged, rather than silently vanishing.
 */

export interface MemberRow {
  studentId: string;
  name: string;
  email: string;
}

interface Props {
  value: MemberRow[];
  onChange: (rows: MemberRow[]) => void;
  disabled?: boolean;
}

/** A form row, with a stable key so editing its student ID doesn't remount the inputs. */
interface EditRow extends MemberRow {
  key: number;
}

/**
 * Folds pasted `id, name, email` lines into existing rows. Existing rows win on conflict -
 * re-pasting a list must not wipe details already fetched for someone.
 */
export function mergeMemberText(rows: MemberRow[], text: string): { rows: MemberRow[]; rejected: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const byId = new Map(rows.map((r) => [r.studentId, r]));
  const rejected: string[] = [];
  for (const line of lines) {
    const row = parseMemberLine(line);
    if (!row) {
      rejected.push(line);
      continue;
    }
    const existing = byId.get(row.studentId);
    byId.set(row.studentId, {
      studentId: row.studentId,
      name: row.name || existing?.name || '',
      email: row.email || existing?.email || '',
    });
  }
  return { rows: [...byId.values()], rejected };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Splits one pasted line into id / name / email.
 *
 * Fields are comma-, tab- or semicolon-separated, but order is resolved by SHAPE rather than
 * position: whichever field looks like an email is the email, and a student ID is matched by
 * the ULAB pattern. That way "Name, 2021-1-60-123" and "2021-1-60-123, Name" both work,
 * which matters because people paste from wherever their list already lives.
 */
export function parseMemberLine(line: string): MemberRow | null {
  const parts = line
    .split(/[,;\t]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  let email = '';
  let studentId = '';
  const rest: string[] = [];

  for (const part of parts) {
    if (!email && EMAIL_RE.test(part)) {
      email = part.toLowerCase();
    } else if (!studentId && /^\d{4}-\d-\d{2}-\d{3,4}$/.test(part)) {
      studentId = part;
    } else {
      rest.push(part);
    }
  }

  // No ULAB-shaped ID found: fall back to the first token that contains a digit, so an
  // unusual or legacy ID format still lands in the right column instead of the name.
  if (!studentId) {
    const idx = rest.findIndex((p) => /\d/.test(p));
    if (idx >= 0) studentId = rest.splice(idx, 1)[0];
  }

  if (!studentId) return null;

  return { studentId, name: rest.join(' ').trim(), email };
}

/** Rows as the parent sees them: trimmed, with an ID, first occurrence of each ID kept. */
function cleanRows(rows: MemberRow[]): MemberRow[] {
  const seen = new Set<string>();
  const out: MemberRow[] = [];
  for (const r of rows) {
    const studentId = r.studentId.trim();
    if (!studentId || seen.has(studentId)) continue;
    seen.add(studentId);
    out.push({ studentId, name: r.name.trim(), email: r.email.trim().toLowerCase() });
  }
  return out;
}

/** Rows back to CSV text, dropping trailing empty fields so "id" alone stays "id". */
function toCsv(rows: MemberRow[]): string {
  return rows
    .filter((r) => r.studentId || r.name || r.email)
    .map((r) => [r.studentId, r.name, r.email].join(', ').replace(/(, )+$/, ''))
    .join('\n');
}

function sameRows(a: MemberRow[], b: MemberRow[]): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => r.studentId === b[i].studentId && r.name === b[i].name && r.email === b[i].email)
  );
}

let nextKey = 1;
const blankRow = (): EditRow => ({ key: nextKey++, studentId: '', name: '', email: '' });
const withKeys = (rows: MemberRow[]): EditRow[] => rows.map((r) => ({ ...r, key: nextKey++ }));

export function MemberEntry({ value, onChange, disabled }: Props) {
  const [tab, setTab] = useState<'form' | 'csv'>('form');
  // The form rows are the source of truth; the parent gets their cleaned form.
  const [rows, setRows] = useState<EditRow[]>(() => (value.length > 0 ? withKeys(value) : [blankRow()]));
  const [csvText, setCsvText] = useState(() => toCsv(value));
  const [csvRejected, setCsvRejected] = useState<string[]>([]);

  const [lookupState, setLookupState] = useState<'idle' | 'checking' | 'running' | 'login'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [extensionMissing, setExtensionMissing] = useState(false);
  const sessionRef = useRef<StudentLookupSession | null>(null);

  // What this component last handed to the parent. When `value` arrives different from it,
  // the parent changed the list itself (e.g. cleared it after creating a group) - resync.
  const lastEmitted = useRef<MemberRow[]>(value);
  // The extension port listener is registered once, at connect time, so read live rows and
  // tab through refs rather than the values captured then.
  const rowsRef = useRef(rows);
  const tabRef = useRef(tab);
  useEffect(() => {
    rowsRef.current = rows;
    tabRef.current = tab;
  });

  const commit = useCallback(
    (next: EditRow[]) => {
      setRows(next);
      rowsRef.current = next;
      const clean = cleanRows(next);
      if (!sameRows(clean, lastEmitted.current)) {
        lastEmitted.current = clean;
        onChange(clean);
      }
    },
    [onChange]
  );

  useEffect(() => {
    if (value === lastEmitted.current || sameRows(value, lastEmitted.current)) return;
    lastEmitted.current = value;
    const next = value.length > 0 ? withKeys(value) : [blankRow()];
    setRows(next);
    setCsvText(toCsv(value));
    setCsvRejected([]);
  }, [value]);

  const members = useMemo(() => cleanRows(rows), [rows]);
  const incomplete = useMemo(() => members.filter((r) => !r.name || !r.email).map((r) => r.studentId), [members]);

  // Form rows with details but no ID would otherwise be dropped without a word.
  const missingId = rows.filter((r) => !r.studentId.trim() && (r.name.trim() || r.email.trim())).length;
  const duplicateIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const id = r.studentId.trim();
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return new Set([...counts].filter(([, n]) => n > 1).map(([id]) => id));
  }, [rows]);

  // ── Form tab ────────────────────────────────────────────────────────────────────────────
  const updateRow = (key: number, patch: Partial<MemberRow>) =>
    commit(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: number) => {
    const next = rows.filter((r) => r.key !== key);
    commit(next.length > 0 ? next : [blankRow()]);
  };

  const addRow = () => commit([...rows, blankRow()]);

  /** A multi-line or delimited paste into an ID box fills this row and inserts the rest. */
  const pasteIntoRow = (key: number, text: string): boolean => {
    if (!/[\n,;\t]/.test(text.trim())) return false;
    const { rows: parsed, rejected } = mergeMemberText([], text);
    if (parsed.length === 0) return false;
    const index = rows.findIndex((r) => r.key === key);
    const current = rows[index];
    const replacement = withKeys(parsed);
    replacement[0] = { ...replacement[0], key: current.key };
    // The row pasted into becomes the first parsed student (keeping its key, so focus stays),
    // and the rest are inserted after it - pasting into a fresh form leaves no blank row.
    commit([...rows.slice(0, index), ...replacement, ...rows.slice(index + 1)]);
    if (rejected.length > 0) {
      toast.warning(`Skipped ${rejected.length} line${rejected.length === 1 ? '' : 's'} with no recognisable student ID`);
    }
    return true;
  };

  // ── CSV tab ─────────────────────────────────────────────────────────────────────────────
  const onCsvChange = (text: string) => {
    setCsvText(text);
    // Parsed as typed: whatever is in the box IS the list. Details the form or URMS already
    // filled for an ID are kept when the CSV line leaves them blank.
    const known = new Map(cleanRows(rows).map((r) => [r.studentId, r]));
    const { rows: parsed, rejected } = mergeMemberText([], text);
    setCsvRejected(rejected);
    const next = parsed.map((r) => ({
      ...r,
      name: r.name || known.get(r.studentId)?.name || '',
      email: r.email || known.get(r.studentId)?.email || '',
    }));
    commit(next.length > 0 ? withKeys(next) : [blankRow()]);
  };

  const switchTab = (next: string) => {
    // Entering CSV shows the current list as text; the form already reflects any CSV edits.
    if (next === 'csv') {
      setCsvText(toCsv(rows));
      setCsvRejected([]);
    }
    setTab(next as 'form' | 'csv');
  };

  // ── URMS lookup ─────────────────────────────────────────────────────────────────────────
  const handleStatus = useCallback(
    (status: UrmsStudentLookupStatus) => {
      if (status.type === 'STUDENT_LOOKUP_PROGRESS') {
        setProgress({ done: status.done, total: status.total });
        return;
      }

      if (status.type === 'URMS_LOGIN_REQUIRED') {
        setLookupState('login');
        return;
      }

      if (status.type === 'STUDENT_LOOKUP_ERROR') {
        setLookupState('idle');
        toast.error(status.error);
        return;
      }

      if (status.type === 'STUDENT_DETAILS') {
        const found = new Map(status.students.map((s) => [s.studentId, s]));
        let filled = 0;
        const next = rowsRef.current.map((row) => {
          const match = found.get(row.studentId.trim());
          if (!match) return row;
          const updated = {
            ...row,
            // Only fills blanks - anything typed by hand is treated as deliberate and
            // left alone.
            name: row.name || match.name || '',
            email: row.email || match.email || '',
          };
          if (updated.name !== row.name || updated.email !== row.email) filled += 1;
          return updated;
        });
        commit(next);
        if (tabRef.current === 'csv') setCsvText(toCsv(next));

        setLookupState('idle');
        sessionRef.current?.disconnect();
        sessionRef.current = null;

        const missing = status.notFound?.length || 0;
        if (filled > 0) {
          toast.success(
            `Filled ${filled} student${filled === 1 ? '' : 's'} from URMS` + (missing ? ` · ${missing} not found` : '')
          );
        } else {
          toast.info(missing ? `${missing} student ID(s) not found on URMS` : 'Nothing to fill');
        }
      }
    },
    [commit]
  );

  const runLookup = async (ids: string[]) => {
    if (ids.length === 0) {
      toast.info('Every student already has a name and email');
      return;
    }

    // Reuse an open connection when retrying after login, so the extension's service worker
    // doesn't have to spin up again.
    if (sessionRef.current) {
      setLookupState('running');
      setProgress({ done: 0, total: ids.length });
      sessionRef.current.retry(ids);
      return;
    }

    setLookupState('checking');
    setExtensionMissing(false);

    const extensionId = await resolveExtensionId();
    if (!extensionId) {
      setExtensionMissing(true);
      setLookupState('idle');
      return;
    }

    setLookupState('running');
    setProgress({ done: 0, total: ids.length });

    const session = connectAndLookupStudents(extensionId, ids, handleStatus, () => {
      sessionRef.current = null;
      // A disconnect mid-run means the service worker went idle; leaving the spinner up
      // would look like a hang.
      setLookupState((s) => (s === 'running' ? 'idle' : s));
    });

    if (!session) {
      setExtensionMissing(true);
      setLookupState('idle');
      return;
    }
    sessionRef.current = session;
  };

  const busy = lookupState === 'running' || lookupState === 'checking';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Members</Label>
        <span className="text-xs text-muted-foreground">
          {members.length} student{members.length === 1 ? '' : 's'}
          {incomplete.length > 0 && ` · ${incomplete.length} missing name or email`}
        </span>
      </div>

      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="form">Form</TabsTrigger>
          <TabsTrigger value="csv">CSV</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="mt-3 space-y-2">
          {rows.map((row, i) => {
            const id = row.studentId.trim();
            const needsId = !id && (row.name.trim() || row.email.trim());
            const duplicate = id && duplicateIds.has(id);
            return (
              <div key={row.key} className="rounded-lg border p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Student {i + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={disabled}
                    onClick={() => removeRow(row.key)}
                    aria-label={`Remove student ${i + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[9.5rem_1fr_1fr]">
                  <Input
                    className={`h-8 font-mono text-xs ${needsId || duplicate ? 'border-destructive' : ''}`}
                    placeholder="Student ID"
                    disabled={disabled}
                    value={row.studentId}
                    onChange={(e) => updateRow(row.key, { studentId: e.target.value })}
                    onPaste={(e) => {
                      if (pasteIntoRow(row.key, e.clipboardData.getData('text'))) e.preventDefault();
                    }}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Name"
                    disabled={disabled}
                    value={row.name}
                    onChange={(e) => updateRow(row.key, { name: e.target.value })}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Email"
                    type="email"
                    disabled={disabled}
                    value={row.email}
                    onChange={(e) => updateRow(row.key, { email: e.target.value })}
                  />
                </div>
                {needsId && <p className="mt-1 text-[11px] text-destructive">A student ID is required.</p>}
                {duplicate && <p className="mt-1 text-[11px] text-destructive">This ID is already listed above.</p>}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" size="sm" variant="outline" onClick={addRow} disabled={disabled}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add student
            </Button>
            <p className="text-[11px] text-muted-foreground">Tip: paste a whole list into an ID box.</p>
          </div>
          {missingId > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {missingId} row{missingId === 1 ? ' has' : 's have'} no student ID and won&apos;t be added.
            </p>
          )}
        </TabsContent>

        <TabsContent value="csv" className="mt-3 space-y-1.5">
          <Textarea
            rows={6}
            disabled={disabled}
            value={csvText}
            onChange={(e) => onCsvChange(e.target.value)}
            placeholder={'2021-1-60-123, Jane Doe, jane.doe@ulab.edu.bd\n2021-1-60-124, John Smith, john.smith@ulab.edu.bd'}
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            One student per line: <strong>ID, name, email</strong> (commas, tabs or semicolons, any order).
            Updated as you type - switch to Form to check each row.
          </p>
          {csvRejected.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                No student ID found on {csvRejected.length} line{csvRejected.length === 1 ? '' : 's'}:{' '}
                <span className="font-mono">{csvRejected.slice(0, 3).join(' | ')}</span>
                {csvRejected.length > 3 && ` +${csvRejected.length - 3} more`}
              </span>
            </p>
          )}
        </TabsContent>
      </Tabs>

      {incomplete.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-2">
          <span className="text-xs text-muted-foreground">
            Name and email are optional - fetch the missing ones from URMS.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || busy}
            onClick={() => runLookup(incomplete)}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <DownloadCloud className="mr-1.5 h-3.5 w-3.5" />}
            {lookupState === 'running' ? `Fetching ${progress.done}/${progress.total}…` : 'Fetch from URMS'}
          </Button>
        </div>
      )}

      {extensionMissing && (
        <Alert>
          <PlugZap className="h-4 w-4" />
          <AlertDescription className="flex flex-wrap items-center gap-2 text-xs">
            The ULAB Faculty Companion extension isn&apos;t installed or didn&apos;t respond.
            <a
              href={URMS_EXTENSION_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Get it <ExternalLink className="h-3 w-3" />
            </a>
          </AlertDescription>
        </Alert>
      )}

      {lookupState === 'login' && (
        <Alert>
          <LogIn className="h-4 w-4" />
          <AlertDescription className="flex flex-wrap items-center gap-2 text-xs">
            Your URMS session has expired. Log in, then fetch again.
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => {
                sessionRef.current?.openLogin();
                setLookupState('idle');
              }}
            >
              Open URMS login
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
