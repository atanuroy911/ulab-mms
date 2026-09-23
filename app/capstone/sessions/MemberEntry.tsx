'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Trash2,
  DownloadCloud,
  ExternalLink,
  PlugZap,
  LogIn,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  resolveExtensionId,
  connectAndLookupStudents,
  URMS_EXTENSION_STORE_URL,
  type StudentLookupSession,
  type UrmsStudentLookupStatus,
} from '@/lib/urmsExtensionImport';

/**
 * Member entry for capstone groups.
 *
 * The preferred input is `id, name, email` per line - paste that and nothing else is needed.
 * When only an ID (or ID + name) is given, the missing fields can be pulled from URMS
 * through the Faculty Companion extension, which replays the StudentRegistration lookup with
 * the user's existing URMS cookies. If that session has expired the extension says so, and
 * this offers to open URMS's login in a popup and retry on the same connection.
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

export function MemberEntry({ value, onChange, disabled }: Props) {
  const [raw, setRaw] = useState('');
  const [lookupState, setLookupState] = useState<'idle' | 'checking' | 'running' | 'login'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [extensionMissing, setExtensionMissing] = useState(false);
  const sessionRef = useRef<StudentLookupSession | null>(null);

  // The extension port listener is registered once, at connect time, so anything it calls
  // would otherwise close over the rows as they were then. A fetch takes seconds per
  // student and the user can keep typing during it, so read the live rows through a ref.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const incomplete = useMemo(
    () => value.filter((r) => !r.name || !r.email).map((r) => r.studentId),
    [value]
  );

  const addFromText = () => {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const parsed: MemberRow[] = [];
    const rejected: string[] = [];
    for (const line of lines) {
      const row = parseMemberLine(line);
      if (row) parsed.push(row);
      else rejected.push(line);
    }

    // Existing rows win on conflict - re-pasting a list must not wipe details already
    // fetched for someone.
    const byId = new Map(value.map((r) => [r.studentId, r]));
    for (const row of parsed) {
      const existing = byId.get(row.studentId);
      byId.set(row.studentId, {
        studentId: row.studentId,
        name: row.name || existing?.name || '',
        email: row.email || existing?.email || '',
      });
    }

    onChange([...byId.values()]);
    setRaw('');

    if (rejected.length > 0) {
      toast.warning(
        `Skipped ${rejected.length} line${rejected.length === 1 ? '' : 's'} with no recognisable student ID`
      );
    }
  };

  const updateRow = (studentId: string, patch: Partial<MemberRow>) => {
    onChange(value.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)));
  };

  const removeRow = (studentId: string) => {
    onChange(value.filter((r) => r.studentId !== studentId));
  };

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
        onChangeRef.current(
          valueRef.current.map((row) => {
            const match = found.get(row.studentId);
            if (!match) return row;
            const next = {
              ...row,
              // Only fills blanks - anything typed by hand is treated as deliberate and
              // left alone.
              name: row.name || match.name || '',
              email: row.email || match.email || '',
            };
            if (next.name !== row.name || next.email !== row.email) filled += 1;
            return next;
          })
        );

        setLookupState('idle');
        sessionRef.current?.disconnect();
        sessionRef.current = null;

        const missing = status.notFound?.length || 0;
        if (filled > 0) {
          toast.success(
            `Filled ${filled} student${filled === 1 ? '' : 's'} from URMS` +
              (missing ? ` · ${missing} not found` : '')
          );
        } else {
          toast.info(missing ? `${missing} student ID(s) not found on URMS` : 'Nothing to fill');
        }
      }
    },
    []
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

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="member-paste">Members</Label>
        <Textarea
          id="member-paste"
          rows={3}
          disabled={disabled}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter adds without reaching for the mouse, which matters when
            // entering several groups in a row.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              addFromText();
            }
          }}
          placeholder={'2021-1-60-123, Jane Doe, jane.doe@ulab.edu.bd\n2021-1-60-124, John Smith, john.smith@ulab.edu.bd'}
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            One per line: <strong>ID, name, email</strong>. Name and email are optional — you can
            fetch them from URMS below.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={addFromText} disabled={disabled || !raw.trim()}>
            Add
          </Button>
        </div>
      </div>

      {value.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium">
              {value.length} member{value.length === 1 ? '' : 's'}
              {incomplete.length > 0 && (
                <span className="ml-1.5 text-muted-foreground">
                  · {incomplete.length} missing details
                </span>
              )}
            </span>

            {incomplete.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || lookupState === 'running' || lookupState === 'checking'}
                onClick={() => runLookup(incomplete)}
              >
                {lookupState === 'running' || lookupState === 'checking' ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <DownloadCloud className="mr-1.5 h-3.5 w-3.5" />
                )}
                {lookupState === 'running'
                  ? `Fetching ${progress.done}/${progress.total}…`
                  : 'Fetch from URMS'}
              </Button>
            )}
          </div>

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

          <div className="space-y-1.5">
            {value.map((row) => {
              const complete = Boolean(row.name && row.email);
              return (
                <div
                  key={row.studentId}
                  className="grid grid-cols-1 items-center gap-1.5 rounded-lg border p-2 sm:grid-cols-[auto_9rem_1fr_1fr_auto]"
                >
                  {complete ? (
                    <CheckCircle2 className="hidden h-3.5 w-3.5 shrink-0 text-emerald-500 sm:block" />
                  ) : (
                    <AlertCircle className="hidden h-3.5 w-3.5 shrink-0 text-amber-500 sm:block" />
                  )}

                  <Badge variant="outline" className="justify-center font-mono text-[11px]">
                    {row.studentId}
                  </Badge>

                  <Input
                    className="h-8 text-xs"
                    placeholder="Name"
                    disabled={disabled}
                    value={row.name}
                    onChange={(e) => updateRow(row.studentId, { name: e.target.value })}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Email"
                    type="email"
                    disabled={disabled}
                    value={row.email}
                    onChange={(e) => updateRow(row.studentId, { email: e.target.value.toLowerCase() })}
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 justify-self-end"
                    disabled={disabled}
                    onClick={() => removeRow(row.studentId)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
