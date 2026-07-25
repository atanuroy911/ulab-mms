'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import Image from 'next/image';
import {
  Users, Plus, LogOut, Pencil, Check, X, RefreshCw, Lock,
  ShieldCheck, ChromeIcon, Loader2, FolderOpen, CircleAlert, PartyPopper,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ui/theme-toggle';

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

function initials(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export default function ProjectCheckinPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { data: session, status } = useSession();

  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [groups, setGroups] = useState<GroupEntry[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [maxMembers, setMaxMembers] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  // Identity is resolved server-side from the signed-in Google account, never chosen by the
  // client - `me` is null if the session's Google name couldn't be matched to exactly one
  // student on this course's roster.
  const [me, setMe] = useState<StudentInfo | null>(null);

  // Title editing
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');

  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const isGoogleVerified = status === 'authenticated' && !!session?.user?.email?.toLowerCase().endsWith('@ulab.edu.bd');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/project/${courseId}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to load'); return; }
      setCourse(data.course);
      setStudents(data.students || []);
      setGroups(data.groups || []);
      setIsActive(data.isActive);
      setMaxMembers(data.maxMembersPerGroup ?? 4);
      setMe(data.me || null);
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (!isGoogleVerified) return;
    fetchData();
  }, [isGoogleVerified, fetchData]);

  // Auto-refresh every 15s when active
  useEffect(() => {
    if (!isActive || !isGoogleVerified) return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isActive, isGoogleVerified, fetchData]);

  const myGroup = me
    ? groups.find(g => g.studentIds.some(s => s._id === me._id))
    : null;

  const assignedStudentIds = new Set(groups.flatMap(g => g.studentIds.map(s => s._id)));
  const unassignedStudents = students.filter(s => !assignedStudentIds.has(s._id));

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    await signIn('google-project', { callbackUrl: window.location.href });
  };

  const doAction = async (action: string, extra?: object) => {
    setActionLoading(true);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await fetch(`/api/project/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error || 'Action failed'); return; }
      setGroups(data.groups || []);
      if (action === 'createGroup') setActionSuccess('Group created! You\'ve been added as the first member.');
      if (action === 'join') setActionSuccess('Successfully joined the group!');
      if (action === 'leave') setActionSuccess('Updated your group.');
      if (action === 'setTitle') { setActionSuccess('Project title updated!'); setEditingGroupId(null); }
    } catch {
      setActionError('Network error. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (status === 'loading' || (loading && isGoogleVerified)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // ─── Sign-in gate ──────────────────────────────────────────────────────────
  if (!isGoogleVerified) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="fixed top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <Image src="/ulab.svg" alt="ULAB Logo" width={56} height={56} className="mb-2 drop-shadow" />
            <CardTitle>Sign in to Join a Group</CardTitle>
            <CardDescription>
              Sign in with your ULAB Google account so we can confirm it&apos;s really you before joining a project group.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleGoogleSignIn} disabled={signingIn} className="w-full">
              {signingIn ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirecting to Google...
                </>
              ) : (
                <>
                  <ChromeIcon className="h-4 w-4" />
                  Sign in with Google
                </>
              )}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground text-center">
              Once you&apos;re in, you can add teammates yourself — they don&apos;t need to sign in too.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center space-y-3">
            <CircleAlert className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* Header */}
      <nav className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Image src="/ulab.svg" alt="ULAB Logo" width={36} height={36} className="shrink-0 drop-shadow" />
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-tight truncate">{course?.name}</h1>
              <p className="text-xs text-muted-foreground truncate">
                {course?.code} • {course?.semester} {course?.year}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={isActive ? 'default' : 'secondary'} className="gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-muted-foreground'}`} />
              {isActive ? 'Open' : 'Closed'}
            </Badge>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {/* Session closed banner */}
        {!isActive && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-6 text-center">
              <Lock className="h-8 w-8 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
              <p className="font-medium text-amber-700 dark:text-amber-300">Project session is not active</p>
              <p className="text-sm text-muted-foreground mt-0.5">Wait for your instructor to open the session.</p>
            </CardContent>
          </Card>
        )}

        {/* Identity strip */}
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
          {me ? (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                  {initials(me.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{me.name}</p>
                  <p className="text-xs text-muted-foreground">{me.studentId}</p>
                </div>
              </div>
              <Badge variant="outline" className="gap-1 text-xs shrink-0">
                <ShieldCheck className="h-3 w-3" />
                Verified
              </Badge>
            </>
          ) : (
            <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
              <CircleAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                We couldn&apos;t match your Google account ({session?.user?.name}) to this course&apos;s roster.
                Ask your instructor to check your name/ID, or make sure your Google display name includes your student ID in parentheses.
              </span>
            </div>
          )}
        </div>

        {/* Your group */}
        {me && isActive && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Your Group
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {actionError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                  <Check className="h-4 w-4" /> {actionSuccess}
                </div>
              )}

              {myGroup ? (
                <div className="space-y-4">
                  <div className="rounded-lg border bg-primary/5 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-lg">Group {myGroup.groupNumber}</span>
                      <Badge variant="secondary">{myGroup.studentIds.length}/{maxMembers} members</Badge>
                    </div>

                    {/* Project title */}
                    {editingGroupId === myGroup._id ? (
                      <div className="flex gap-2">
                        <Input
                          value={titleInput}
                          onChange={e => setTitleInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && doAction('setTitle', { groupId: myGroup._id, projectTitle: titleInput })}
                          placeholder="Enter project title..."
                          autoFocus
                          className="flex-1"
                        />
                        <Button
                          size="icon"
                          onClick={() => doAction('setTitle', { groupId: myGroup._id, projectTitle: titleInput })}
                          disabled={actionLoading}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => setEditingGroupId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm flex-1 min-w-0">
                          {myGroup.projectTitle ? (
                            <span className="font-medium flex items-center gap-1.5">
                              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{myGroup.projectTitle}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">No project title yet</span>
                          )}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => { setEditingGroupId(myGroup._id); setTitleInput(myGroup.projectTitle || ''); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {myGroup.projectTitle ? 'Edit' : 'Set Title'}
                        </Button>
                      </div>
                    )}

                    <Separator />

                    {/* Members */}
                    <div className="space-y-1.5">
                      {myGroup.studentIds.map(s => (
                        <div key={s._id} className="flex items-center gap-2.5 rounded-md bg-background px-3 py-2">
                          <div className="h-7 w-7 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {initials(s.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.studentId}</p>
                          </div>
                          {s._id === me._id ? (
                            <Badge variant="secondary" className="shrink-0">You</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="shrink-0 h-7 px-2 text-destructive hover:text-destructive"
                              onClick={() => doAction('leave', { groupId: myGroup._id, studentId: s._id })}
                              disabled={actionLoading}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Add teammate — only the person who signed in needs to; teammates are
                        added without them logging in themselves. */}
                    {unassignedStudents.length > 0 && myGroup.studentIds.length < maxMembers && (
                      <div className="pt-1 space-y-2">
                        <p className="text-xs text-muted-foreground">Add a teammate (they don&apos;t need to sign in):</p>
                        <div className="flex flex-wrap gap-1.5">
                          {unassignedStudents.map(s => (
                            <button
                              key={s._id}
                              onClick={() => doAction('join', { groupId: myGroup._id, studentId: s._id })}
                              disabled={actionLoading}
                              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                            >
                              <Plus className="h-3 w-3" />
                              {s.name} <span className="opacity-60">({s.studentId})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => doAction('leave', { groupId: myGroup._id })}
                    disabled={actionLoading}
                  >
                    <LogOut className="h-4 w-4" />
                    {actionLoading ? 'Processing...' : 'Leave Group'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    You are not in a group yet. Create a new one or join an existing group below.
                  </p>
                  <Button className="w-full" onClick={() => doAction('createGroup')} disabled={actionLoading}>
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Create a New Group
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">— or scroll down to join an existing group —</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Groups list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              All Groups
              <span className="font-normal text-muted-foreground">
                ({groups.length} group{groups.length !== 1 ? 's' : ''} • max {maxMembers}/group)
              </span>
            </h2>
            <Button size="sm" variant="ghost" onClick={fetchData} className="h-7 px-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          {groups.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center">
                <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {isActive && me ? 'No groups yet — be the first to create one!' : 'No groups yet.'}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {groups.map(group => {
              const isFull = group.studentIds.length >= maxMembers;
              const isMine = myGroup?._id === group._id;
              const canJoin = isActive && me && !myGroup && !isFull;

              return (
                <Card key={group._id} className={isMine ? 'border-primary/50 bg-primary/5' : ''}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center font-bold text-sm ${
                          isMine ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                        }`}>
                          {group.groupNumber}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm">Group {group.groupNumber}</span>
                            {isMine && <Badge className="text-xs">Yours</Badge>}
                            {isFull && <Badge variant="secondary" className="text-xs">Full</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {group.projectTitle || <span className="italic">No title</span>}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {group.studentIds.length}/{maxMembers}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {group.studentIds.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">No members</span>
                      ) : (
                        group.studentIds.map(s => (
                          <span
                            key={s._id}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                              s._id === me?._id
                                ? 'bg-primary/15 text-primary border border-primary/30'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            <span className="font-medium">{s.name}</span>
                            <span className="opacity-60">({s.studentId})</span>
                          </span>
                        ))
                      )}
                    </div>

                    {canJoin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => doAction('join', { groupId: group._id })}
                        disabled={actionLoading}
                      >
                        {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Join Group {group.groupNumber}
                      </Button>
                    )}
                    {isActive && me && !myGroup && isFull && (
                      <div className="text-center text-xs text-muted-foreground py-1.5 rounded-md bg-muted">
                        Group is full
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Unassigned students */}
        {unassignedStudents.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2.5">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                Not yet in a group
                <span className="font-normal">({unassignedStudents.length})</span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {unassignedStudents.map(s => (
                  <span
                    key={s._id}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                      s._id === me?._id
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    {s.name}
                    <span className="opacity-60">({s.studentId})</span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {unassignedStudents.length === 0 && groups.length > 0 && (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-700 dark:text-green-400">
            <PartyPopper className="h-4 w-4" />
            All {students.length} students are in groups!
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground/60 pb-2">
          Auto-refreshes every 15 seconds • {course?.code}
        </p>
      </div>
    </div>
  );
}
