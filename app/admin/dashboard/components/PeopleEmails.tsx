'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Loader2, MailPlus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Person {
  studentId: string;
  name: string;
  email: string | null;
  courses: number;
  capstone: boolean;
}
interface Data {
  students: Person[];
  staff: Array<{ name: string; email: string; roles: string[] }>;
  summary: { students: number; studentsWithEmail: number; staff: number };
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
function download(name: string, rows: unknown[][]) {
  const blob = new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** "233014089 name@ulab.edu.bd" per line - spaces, commas or tabs between, either order. */
function parseEntries(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const email = line.match(/[^\s,;<>"]+@[^\s,;<>"]+/)?.[0];
      const id = line.replace(email || '', '').match(/\b\d{6,12}\b/)?.[0];
      return email && id ? { studentId: id, email } : null;
    })
    .filter((x): x is { studentId: string; email: string } => !!x);
}

/**
 * Who the system can email. Students' addresses come from their own sign-ins and imported
 * lists; those missing one still get every notification in their portal.
 */
export default function PeopleEmails() {
  const [data, setData] = useState<Data | null>(null);
  const [query, setQuery] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [paste, setPaste] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewId, setViewId] = useState('');

  // Read-only look at one student's portal, in a new tab (lib/studentViewAs.ts).
  const viewPortal = async (studentId: string) => {
    const r = await fetch('/api/admin/view-as', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(d.error || 'Could not open the student portal');
    window.open(d.href || '/student/dashboard', '_blank');
  };

  const load = () =>
    fetch('/api/admin/people-emails')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed to load');
        setData(d);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load'));
  useEffect(() => {
    load();
  }, []);

  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      (data?.students || [])
        .filter((p) => !onlyMissing || !p.email)
        .filter((p) => !q || p.studentId.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q)),
    [data, onlyMissing, q]
  );
  const entries = parseEntries(paste);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/people-emails', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      toast.success(`${d.updated} students now have an email${d.alreadySet ? ` · ${d.alreadySet} already had one` : ''}`);
      for (const [label, ids] of [
        ['Unknown IDs', d.unknown],
        ['Invalid', d.invalid],
        ['Used by another student', d.conflicts],
      ] as const) {
        if (ids.length) toast.warning(`${label}: ${ids.slice(0, 8).join(', ')}${ids.length > 8 ? ` +${ids.length - 8}` : ''}`);
      }
      setPaste('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const s = data.summary;
  const pct = s.students ? Math.round((s.studentsWithEmail / s.students) * 100) : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">People &amp; Emails</h2>
          <p className="text-muted-foreground">Who notifications can reach by email. Everyone also gets them in their portal.</p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            download('people-and-emails.csv', [
              ['Type', 'Student ID', 'Name', 'Email', 'Courses', 'Capstone', 'Roles'],
              ...data.students.map((p) => ['Student', p.studentId, p.name, p.email || '', p.courses, p.capstone ? 'yes' : '', '']),
              ...data.staff.map((u) => ['Staff', '', u.name, u.email, '', '', u.roles.join(' ')]),
            ])
          }
        >
          <Download className="mr-2 h-4 w-4" /> Download everyone (CSV)
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums">
              {s.studentsWithEmail} <span className="text-base font-normal text-muted-foreground">/ {s.students}</span>
            </p>
            <p className="text-xs text-muted-foreground">Students with an email ({pct}%)</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{s.students - s.studentsWithEmail}</p>
            <p className="text-xs text-muted-foreground">Students without one - portal notifications only, until they sign in once or are added below</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums">{s.staff}</p>
            <p className="text-xs text-muted-foreground">Staff - all have an email (their sign-in)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4" /> View a student&apos;s portal
          </CardTitle>
          <CardDescription>See exactly what one student sees - read only, for 30 minutes. Nothing you do there changes their account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (viewId.trim()) viewPortal(viewId.trim());
            }}
          >
            <Input value={viewId} onChange={(e) => setViewId(e.target.value)} placeholder="Student ID, e.g. 233014089" className="h-10 max-w-xs" />
            <Button type="submit" disabled={!viewId.trim()} className="h-10">
              <Eye className="mr-2 h-4 w-4" /> View portal
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MailPlus className="h-4 w-4" /> Add student emails
          </CardTitle>
          <CardDescription>
            Paste one student per line - the ID and the email, in any order (straight from URMS or a spreadsheet). Emails a student signed in with are never replaced.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} placeholder={'233014089  mehedi.hasan.cse@ulab.edu.bd\n232014094, tasmia.zaman.cse@ulab.edu.bd'} className="font-mono text-sm" />
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving || entries.length === 0}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save {entries.length || ''} {entries.length === 1 ? 'email' : 'emails'}
            </Button>
            {paste.trim() && entries.length === 0 && <span className="text-sm text-muted-foreground">No “ID email” lines found yet.</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-auto text-base">Students</CardTitle>
            <div className="flex rounded-lg border p-0.5" role="tablist">
              {(
                [
                  [true, `Missing email (${s.students - s.studentsWithEmail})`],
                  [false, `Everyone (${s.students})`],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={onlyMissing === v}
                  onClick={() => setOnlyMissing(v)}
                  className={cn('rounded-md px-3 py-1 text-sm', onlyMissing === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID, name or email" className="h-9 pl-8" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Student ID</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 text-right font-medium">Courses</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.slice(0, 200).map((p) => (
                  <tr key={p.studentId}>
                    <td className="px-3 py-1.5 font-mono text-xs">{p.studentId}</td>
                    <td className="px-3 py-1.5">{p.name}</td>
                    <td className={cn('px-3 py-1.5', !p.email && 'text-muted-foreground italic')}>{p.email || 'none'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {p.courses}
                      {p.capstone ? ' + capstone' : ''}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => viewPortal(p.studentId)} title="See this student's portal, read only">
                        <Eye className="mr-1 h-3.5 w-3.5" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      {onlyMissing && !q ? 'Every student has an email.' : 'No one matches.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {list.length > 200 && <p className="mt-2 text-xs text-muted-foreground">Showing 200 of {list.length} - search to narrow, or download the CSV for everyone.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
