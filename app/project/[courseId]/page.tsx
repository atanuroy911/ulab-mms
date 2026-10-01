'use client';
import { signInStudentWithGoogle } from '@/lib/studentGoogleSignIn';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Users,
  UserPlus,
  Plus,
  LogOut,
  Pencil,
  Check,
  X,
  RefreshCw,
  Lock,
  ShieldCheck,
  ChromeIcon,
  Loader2,
  CircleAlert,
  Search,
  UserMinus,
  ChevronDown,
  Sparkles,
  ArrowDown,
  ArrowLeft,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface StudentInfo {
  _id: string;
  name: string;
  studentId: string;
}

interface GroupEntry {
  _id: string;
  groupNumber: number;
  projectTitle: string;
  studentIds: StudentInfo[];
}

interface CourseInfo {
  _id: string;
  name: string;
  code: string;
  semester: string;
  year: number;
}

/** What a destructive click is waiting on before it happens. */
type Pending = { kind: 'leave'; group: GroupEntry } | { kind: 'remove'; group: GroupEntry; student: StudentInfo };

const TITLE_MAX = 150;

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  );
}

const matches = (s: StudentInfo, q: string) => s.name.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q);

export default function ProjectCheckinPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { data: session, status } = useSession();

  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [groups, setGroups] = useState<GroupEntry[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [maxMembers, setMaxMembers] = useState(4);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  // Identity is resolved server-side from the signed-in Google account, never chosen by the
  // client - `me` is null if the session's Google name couldn't be matched to exactly one
  // student on this course's roster.
  const [me, setMe] = useState<StudentInfo | null>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [teammateQuery, setTeammateQuery] = useState('');
  const [query, setQuery] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(false);

  const isGoogleVerified = status === 'authenticated' && !!session?.user?.email?.toLowerCase().endsWith('@ulab.edu.bd');

  // `silent` keeps the page on screen: the 15s auto-refresh and the refresh button update in place.
  const fetchData = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      try {
        const res = await fetch(`/api/project/${courseId}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to load');
          return;
        }
        setCourse(data.course);
        setStudents(data.students || []);
        setGroups(data.groups || []);
        setIsActive(data.isActive);
        setMaxMembers(data.maxMembersPerGroup ?? 4);
        setMe(data.me || null);
        setUpdatedAt(Date.now());
      } catch {
        if (!silent) setError('Failed to connect to server');
      } finally {
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    },
    [courseId]
  );

  // Viewing groups and titles is public; only joining, leaving and editing need sign-in.
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // While open, others are forming groups too - refresh quietly every 15s.
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => fetchData(true), 15000);
    return () => clearInterval(interval);
  }, [isActive, fetchData]);

  // Drives "updated 5s ago".
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const myGroup = me ? groups.find((g) => g.studentIds.some((s) => s._id === me._id)) || null : null;
  const assignedIds = useMemo(() => new Set(groups.flatMap((g) => g.studentIds.map((s) => s._id))), [groups]);
  const unassigned = useMemo(() => students.filter((s) => !assignedIds.has(s._id)), [students, assignedIds]);
  const openGroups = groups.filter((g) => g.studentIds.length < maxMembers);
  const openSeats = openGroups.reduce((n, g) => n + (maxMembers - g.studentIds.length), 0);
  const placedPct = students.length ? Math.round((assignedIds.size / students.length) * 100) : 0;

  const q = query.trim().toLowerCase();
  const visibleGroups = groups
    .filter((g) => !onlyOpen || g.studentIds.length < maxMembers)
    .filter((g) => !q || `group ${g.groupNumber}`.includes(q) || g.projectTitle.toLowerCase().includes(q) || g.studentIds.some((s) => matches(s, q)))
    // Yours first, then by number.
    .sort((a, b) => Number(b._id === myGroup?._id) - Number(a._id === myGroup?._id) || a.groupNumber - b.groupNumber);
  const visibleUnassigned = unassigned.filter((s) => !q || matches(s, q));

  const tq = teammateQuery.trim().toLowerCase();
  const teammateMatches = tq ? unassigned.filter((s) => s._id !== me?._id && matches(s, tq)).slice(0, 6) : [];

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    await signInStudentWithGoogle('google-project', window.location.href);
  };

  const doAction = async (key: string, action: string, extra: object, success: string) => {
    setBusy(key);
    try {
      const res = await fetch(`/api/project/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'That didn’t work - please try again');
        // Someone else may have changed things since the last refresh.
        fetchData(true);
        return false;
      }
      setGroups(data.groups || []);
      setUpdatedAt(Date.now());
      toast.success(success);
      return true;
    } catch {
      toast.error('Network error. Please try again.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveTitle = async () => {
    if (!myGroup) return;
    const title = titleInput.trim().replace(/\s+/g, ' ');
    if (await doAction('title', 'setTitle', { groupId: myGroup._id, projectTitle: title }, title ? 'Project title saved' : 'Project title cleared')) setEditingTitle(false);
  };

  const confirmPending = async () => {
    if (!pending) return;
    const ok =
      pending.kind === 'leave'
        ? await doAction('leave', 'leave', { groupId: pending.group._id }, `You left Group ${pending.group.groupNumber}`)
        : await doAction('remove', 'leave', { groupId: pending.group._id, studentId: pending.student._id }, `${pending.student.name} removed from your group`);
    if (ok) setPending(null);
  };

  const ago = updatedAt && now ? Math.max(0, Math.round((now - updatedAt) / 1000)) : 0;

  // ─── Loading / error ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-dvh bg-muted/30">
        <div className="h-16 border-b bg-background" />
        <div className="mx-auto max-w-4xl animate-pulse space-y-4 px-4 py-8" aria-busy="true" aria-label="Loading">
          <div className="h-40 rounded-2xl bg-muted" />
          <div className="h-16 rounded-xl bg-muted" />
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
        <div role="alert" className="w-full max-w-sm space-y-3 rounded-2xl border bg-card p-8 text-center">
          <CircleAlert className="mx-auto h-10 w-10 text-destructive" />
          <p className="font-medium">This page couldn&apos;t be loaded</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-muted/30 pb-12">
      {/* Header */}
      <nav className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* Signed in to the student portal: a way back to the course there. */}
            {(session?.user as { studentSession?: boolean } | undefined)?.studentSession && (
              <Link
                href={`/student/dashboard/courses/${courseId}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Back to the course in your student portal"
                title="Back to My Courses"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            )}
            <Image src="/ulab.svg" alt="ULAB" width={36} height={36} className="shrink-0" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold leading-tight sm:text-base">{course?.name}</h1>
              <p className="truncate text-xs text-muted-foreground">
                {course?.code} · {course?.semester} {course?.year} · Project groups
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                isActive ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', isActive ? 'bg-emerald-500 motion-safe:animate-pulse' : 'bg-muted-foreground')} />
              {isActive ? 'Open' : 'Closed'}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
        {/* ── Where you stand, and the one next step ── */}
        <section aria-label="Your group" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          {!isActive && (
            <div className="flex items-center gap-2 border-b bg-amber-500/10 px-5 py-2.5 text-sm text-amber-800 dark:text-amber-200">
              <Lock className="h-4 w-4 shrink-0" />
              Group forming is closed right now - groups are shown read-only. Your instructor opens it.
            </div>
          )}

          {!me && !isGoogleVerified && (
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">Form your project group</h2>
                <p className="text-sm text-muted-foreground">
                  Sign in with your ULAB Google account to start a group or join one. Only one teammate needs to sign in - they can add the others.
                </p>
              </div>
              <Button size="lg" onClick={handleGoogleSignIn} disabled={signingIn} className="h-11 shrink-0">
                {signingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChromeIcon className="h-4 w-4" />}
                Sign in with Google
              </Button>
            </div>
          )}

          {!me && isGoogleVerified && (
            <div className="flex items-start gap-3 p-5 sm:p-6">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-sm">
                <p className="font-semibold">We couldn&apos;t find you on this course&apos;s list</p>
                <p className="mt-1 text-muted-foreground">
                  You&apos;re signed in as {session?.user?.name}. Ask your instructor to check your name and ID, or make sure your Google display name includes
                  your student ID in parentheses. A teammate who is on the list can also add you to their group.
                </p>
              </div>
            </div>
          )}

          {me && (
            <>
              <div className="flex items-center justify-between gap-3 border-b px-5 py-3 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials(me.name)}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{me.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{me.studentId}</p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Signed in
                </span>
              </div>

              {myGroup ? (
                <MyGroupPanel
                  group={myGroup}
                  me={me}
                  maxMembers={maxMembers}
                  isActive={isActive}
                  busy={busy}
                  editingTitle={editingTitle}
                  titleInput={titleInput}
                  setTitleInput={setTitleInput}
                  startEdit={() => {
                    setTitleInput(myGroup.projectTitle || '');
                    setEditingTitle(true);
                  }}
                  cancelEdit={() => setEditingTitle(false)}
                  saveTitle={saveTitle}
                  teammateQuery={teammateQuery}
                  setTeammateQuery={setTeammateQuery}
                  teammateMatches={teammateMatches}
                  unassignedCount={unassigned.length}
                  addTeammate={async (s) => {
                    if (await doAction(`add:${s._id}`, 'join', { groupId: myGroup._id, studentId: s._id }, `${s.name} added to your group`)) setTeammateQuery('');
                  }}
                  askRemove={(s) => setPending({ kind: 'remove', group: myGroup, student: s })}
                  askLeave={() => setPending({ kind: 'leave', group: myGroup })}
                />
              ) : isActive ? (
                <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
                  <p className="text-sm text-muted-foreground sm:col-span-2">You&apos;re not in a group yet. Pick one:</p>
                  <button
                    type="button"
                    onClick={() => doAction('create', 'createGroup', {}, 'Group created - now add your teammates')}
                    disabled={!!busy}
                    className="group flex cursor-pointer items-start gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:border-primary disabled:opacity-60"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      {busy === 'create' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                    </span>
                    <span>
                      <span className="block font-semibold">Start a new group</span>
                      <span className="block text-sm text-muted-foreground">You&apos;ll be its first member, then add your teammates.</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOnlyOpen(true);
                      document.getElementById('all-groups')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    disabled={openGroups.length === 0}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <ArrowDown className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block font-semibold">Join an existing group</span>
                      <span className="block text-sm text-muted-foreground">
                        {openGroups.length === 0
                          ? 'No group has space right now.'
                          : `${openGroups.length} ${openGroups.length === 1 ? 'group has' : 'groups have'} space - ${openSeats} ${openSeats === 1 ? 'seat' : 'seats'} left.`}
                      </span>
                    </span>
                  </button>
                </div>
              ) : (
                <p className="p-5 text-sm text-muted-foreground sm:p-6">You&apos;re not in a group. You can join one when your instructor opens group forming.</p>
              )}
            </>
          )}
        </section>

        {/* ── How the class is doing ── */}
        <section aria-label="Class progress" className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <p className="text-sm font-medium">
                {assignedIds.size} of {students.length} students are in a group
              </p>
              <p className="text-xs text-muted-foreground">
                {groups.length} {groups.length === 1 ? 'group' : 'groups'} · up to {maxMembers} each · {openSeats} open {openSeats === 1 ? 'seat' : 'seats'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              {refreshing ? 'Updating…' : ago < 5 ? 'Up to date' : `Updated ${ago < 60 ? `${ago}s` : `${Math.round(ago / 60)} min`} ago`}
            </button>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={placedPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Students in a group"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${placedPct}%` }} />
          </div>
        </section>

        {/* ── All groups ── */}
        <section id="all-groups" className="scroll-mt-20 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-base font-semibold">All groups</h2>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, ID or title" className="h-9 pl-8" aria-label="Search groups and students" />
            </div>
            <div className="flex rounded-lg border bg-background p-0.5" role="tablist" aria-label="Filter groups">
              {(
                [
                  [false, `All (${groups.length})`],
                  [true, `Has space (${openGroups.length})`],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={onlyOpen === v}
                  onClick={() => setOnlyOpen(v)}
                  className={cn('min-h-8 cursor-pointer rounded-md px-3 text-sm transition-colors', onlyOpen === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card p-10 text-center">
              <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{isActive && me ? 'No groups yet - start the first one above.' : 'No groups yet.'}</p>
            </div>
          ) : visibleGroups.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">No group matches.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleGroups.map((group) => {
                const size = group.studentIds.length;
                const isFull = size >= maxMembers;
                const isMine = myGroup?._id === group._id;
                const canJoin = isActive && !!me && !myGroup && !isFull;
                return (
                  <article key={group._id} className={cn('flex flex-col rounded-xl border bg-card p-4', isMine && 'border-primary/50 ring-1 ring-primary/30')}>
                    <div className="flex items-start gap-3">
                      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold', isMine ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                        {group.groupNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                          Group {group.groupNumber}
                          {isMine && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Yours</span>}
                        </p>
                        <p className={cn('mt-0.5 line-clamp-2 text-sm', group.projectTitle ? '' : 'italic text-muted-foreground')}>{group.projectTitle || 'No title yet'}</p>
                      </div>
                      <Seats size={size} max={maxMembers} />
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {size === 0 ? (
                        <li className="text-xs italic text-muted-foreground">No members</li>
                      ) : (
                        group.studentIds.map((s) => (
                          <li
                            key={s._id}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs',
                              s._id === me?._id ? 'border border-primary/30 bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                              q && matches(s, q) && 'ring-1 ring-amber-500'
                            )}
                          >
                            <span className="font-medium">{s.name}</span>
                            <span className="opacity-60">{s.studentId}</span>
                          </li>
                        ))
                      )}
                    </ul>
                    {canJoin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 h-9 w-full"
                        onClick={() => doAction(`join:${group._id}`, 'join', { groupId: group._id }, `You joined Group ${group.groupNumber}`)}
                        disabled={!!busy}
                      >
                        {busy === `join:${group._id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                        Join Group {group.groupNumber}
                      </Button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Still looking ── */}
        {unassigned.length > 0 ? (
          <section className="rounded-xl border bg-card">
            <button
              type="button"
              onClick={() => setShowUnassigned((v) => !v)}
              aria-expanded={showUnassigned || !!q}
              className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
            >
              Not in a group yet
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal tabular-nums">{unassigned.length}</span>
              <span className="ml-auto text-xs font-normal text-muted-foreground">{q ? `${visibleUnassigned.length} match` : showUnassigned ? 'Hide' : 'Show'}</span>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', (showUnassigned || q) && 'rotate-180')} />
            </button>
            {(showUnassigned || q) && (
              <ul className="flex flex-wrap gap-1.5 border-t px-4 py-3">
                {visibleUnassigned.length === 0 && <li className="text-xs text-muted-foreground">No one matches.</li>}
                {visibleUnassigned.map((s) => (
                  <li
                    key={s._id}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs',
                      s._id === me?._id ? 'border-primary/30 bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'
                    )}
                  >
                    {s.name}
                    <span className="opacity-60">{s.studentId}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          groups.length > 0 && (
            <p className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
              <Sparkles className="h-4 w-4" /> Everyone is in a group - all {students.length} students.
            </p>
          )
        )}
      </main>

      <Dialog open={!!pending} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.kind === 'leave' ? `Leave Group ${pending.group.groupNumber}?` : `Remove ${pending?.kind === 'remove' ? pending.student.name : ''}?`}</DialogTitle>
            <DialogDescription>
              {pending?.kind === 'leave'
                ? pending.group.studentIds.length === 1
                  ? "You're the only member, so the group will be left empty."
                  : 'Your teammates stay in the group. You can join another group afterwards.'
                : 'They will be out of your group and can join another one.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={!!busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmPending} disabled={!!busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : pending?.kind === 'leave' ? <LogOut className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}
              {pending?.kind === 'leave' ? 'Leave group' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Filled and empty seats - size reads at a glance, with the count for screen readers. */
function Seats({ size, max }: { size: number; max: number }) {
  return (
    <span className="flex shrink-0 flex-col items-end gap-1" aria-label={`${size} of ${max} members`}>
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={cn('h-2 w-2 rounded-full', i < size ? 'bg-primary' : 'bg-muted-foreground/25')} />
        ))}
      </span>
      <span className={cn('text-xs tabular-nums', size >= max ? 'font-medium text-muted-foreground' : 'text-muted-foreground')}>{size >= max ? 'Full' : `${size}/${max}`}</span>
    </span>
  );
}

function MyGroupPanel(props: {
  group: GroupEntry;
  me: StudentInfo;
  maxMembers: number;
  isActive: boolean;
  busy: string | null;
  editingTitle: boolean;
  titleInput: string;
  setTitleInput: (v: string) => void;
  startEdit: () => void;
  cancelEdit: () => void;
  saveTitle: () => void;
  teammateQuery: string;
  setTeammateQuery: (v: string) => void;
  teammateMatches: StudentInfo[];
  unassignedCount: number;
  addTeammate: (s: StudentInfo) => void;
  askRemove: (s: StudentInfo) => void;
  askLeave: () => void;
}) {
  const { group, me, maxMembers, isActive, busy, editingTitle, titleInput, setTitleInput, startEdit, cancelEdit, saveTitle } = props;
  const size = group.studentIds.length;
  const full = size >= maxMembers;
  // What's still missing, so the group knows when it's done.
  const todo = [!group.projectTitle && 'add your project title', size < 2 && 'add your teammates'].filter(Boolean) as string[];

  return (
    <div className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your group</p>
          <h2 className="text-2xl font-bold">Group {group.groupNumber}</h2>
        </div>
        <Seats size={size} max={maxMembers} />
      </div>

      {isActive && todo.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <CircleAlert className="h-4 w-4 shrink-0" /> Still to do: {todo.join(' and ')}.
        </p>
      )}
      {isActive && todo.length === 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          <Check className="h-4 w-4 shrink-0" /> Your group is set{full ? ' and full' : ''}.
        </p>
      )}

      {/* Project title */}
      <div>
        <p className="mb-1.5 text-sm font-medium">Project title</p>
        {editingTitle ? (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Input
                value={titleInput}
                maxLength={TITLE_MAX}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') cancelEdit();
                }}
                placeholder="e.g. Smart attendance using face recognition"
                autoFocus
                className="h-10 flex-1"
                aria-label="Project title"
              />
              <Button className="h-10" onClick={saveTitle} disabled={busy === 'title'}>
                {busy === 'title' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save
              </Button>
              <Button size="icon" variant="ghost" className="h-10 w-10" onClick={cancelEdit} aria-label="Cancel">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-right text-xs tabular-nums text-muted-foreground">
              {titleInput.length}/{TITLE_MAX}
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
            <p className={cn('min-w-0 flex-1 text-sm', group.projectTitle ? 'font-medium' : 'italic text-muted-foreground')}>{group.projectTitle || 'No title yet'}</p>
            {isActive && (
              <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5" />
                {group.projectTitle ? 'Edit' : 'Add title'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Members */}
      <div>
        <p className="mb-1.5 text-sm font-medium">
          Members <span className="font-normal text-muted-foreground">({size} of {maxMembers})</span>
        </p>
        <ul className="divide-y rounded-lg border">
          {group.studentIds.map((s) => (
            <li key={s._id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{initials(s.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{s.studentId}</span>
              </span>
              {s._id === me._id ? (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">You</span>
              ) : (
                isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                    onClick={() => props.askRemove(s)}
                    disabled={!!busy}
                    aria-label={`Remove ${s.name}`}
                  >
                    <UserMinus className="h-4 w-4" />
                    <span className="hidden sm:inline">Remove</span>
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Add a teammate - search instead of a wall of names */}
      {isActive && !full && props.unassignedCount > 0 && (
        <div>
          <label htmlFor="teammate" className="mb-1.5 block text-sm font-medium">
            Add a teammate <span className="font-normal text-muted-foreground">- they don&apos;t need to sign in</span>
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="teammate"
              value={props.teammateQuery}
              onChange={(e) => props.setTeammateQuery(e.target.value)}
              placeholder="Type a name or student ID"
              className="h-10 pl-8"
              autoComplete="off"
            />
          </div>
          {props.teammateQuery.trim() && (
            <ul className="mt-1.5 divide-y overflow-hidden rounded-lg border">
              {props.teammateMatches.length === 0 && <li className="px-3 py-2.5 text-sm text-muted-foreground">No one without a group matches.</li>}
              {props.teammateMatches.map((s) => (
                <li key={s._id}>
                  <button
                    type="button"
                    onClick={() => props.addTeammate(s)}
                    disabled={!!busy}
                    className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold">{initials(s.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{s.studentId}</span>
                    </span>
                    {busy === `add:${s._id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="flex items-center gap-1 text-xs font-medium text-primary"><Plus className="h-3.5 w-3.5" /> Add</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isActive && (
        <div className="border-t pt-4">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={props.askLeave} disabled={!!busy}>
            <LogOut className="h-4 w-4" /> Leave this group
          </Button>
        </div>
      )}
    </div>
  );
}
