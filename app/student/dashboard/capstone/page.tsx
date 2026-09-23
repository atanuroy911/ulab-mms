'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, Pencil, CheckCircle2, Circle, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { AppHeader } from '@/app/components/AppHeader';

interface Member {
  _id: string;
  studentAccountId: { _id: string; studentId: string; name: string } | string;
  studentIdText: string;
  removedAt?: string | null;
}

interface Group {
  _id: string;
  track: 'A' | 'B' | 'C';
  groupNumber: number;
  projectTitle: string;
  members: Member[];
  supervisorId: { _id: string; name: string; email: string };
}

interface CapstoneSessionInfo {
  _id: string;
  department: string;
  status: 'draft' | 'open' | 'grading' | 'closed';
  journalWeekCount: number;
}

interface JournalEntry {
  _id: string;
  weekNumber: number;
  workDone: string;
  submittedAt?: string | null;
  supervisorComment?: string;
  supervisorReviewedAt?: string | null;
}

interface CapstoneResult {
  group: Group;
  session: CapstoneSessionInfo;
  journalEntries: JournalEntry[];
}

export default function StudentCapstonePage() {
  const [results, setResults] = useState<CapstoneResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTitleEdit, setShowTitleEdit] = useState<Group | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [showJournalEntry, setShowJournalEntry] = useState<{ group: Group; session: CapstoneSessionInfo; week: number; existing: JournalEntry | null } | null>(null);
  const [workDoneInput, setWorkDoneInput] = useState('');
  const [savingEntry, setSavingEntry] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/student/capstone');
      const data = await res.json();
      if (res.ok) {
        setResults(data);
      } else {
        toast.error(data.error || 'Failed to load capstone info');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load capstone info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openTitleEdit = (group: Group) => {
    setTitleInput(group.projectTitle);
    setShowTitleEdit(group);
  };

  const saveTitle = async () => {
    if (!showTitleEdit) return;
    setSavingTitle(true);
    try {
      const res = await fetch('/api/student/capstone/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: showTitleEdit._id, projectTitle: titleInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update title');
      toast.success('Project title updated');
      setShowTitleEdit(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update title');
    } finally {
      setSavingTitle(false);
    }
  };

  const openJournalEntry = (group: Group, session: CapstoneSessionInfo, week: number, existing: JournalEntry | null) => {
    setWorkDoneInput(existing?.workDone || '');
    setShowJournalEntry({ group, session, week, existing });
  };

  const saveJournalEntry = async () => {
    if (!showJournalEntry) return;
    if (!workDoneInput.trim()) {
      toast.error('Please describe the work done this week');
      return;
    }
    setSavingEntry(true);
    try {
      const res = await fetch('/api/student/capstone/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: showJournalEntry.group._id,
          weekNumber: showJournalEntry.week,
          workDone: workDoneInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save entry');
      toast.success(`Week ${showJournalEntry.week} saved`);
      setShowJournalEntry(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save entry');
    } finally {
      setSavingEntry(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title="Capstone"
        subtitle="Your group and weekly journal"
        logoHref="/student/dashboard"
        actions={[
          { key: 'back', label: 'Back', icon: ArrowLeft, href: '/student/dashboard', variant: 'outline', alwaysShowLabel: true },
        ]}
      />

      <div className="max-w-4xl mx-auto p-4 pt-8 space-y-6">
        {results.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              You are not currently a member of any capstone group.
            </CardContent>
          </Card>
        )}

        {results.map(({ group, session, journalEntries }) => {
          const entryByWeek = new Map(journalEntries.map((e) => [e.weekNumber, e]));
          const activeMembers = group.members.filter((m) => !m.removedAt);

          return (
            <Card key={group._id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>{group.projectTitle || 'Untitled Project'}</CardTitle>
                      <Badge variant="outline">Track {group.track}</Badge>
                      <Badge variant="secondary" className="capitalize">{session.status}</Badge>
                    </div>
                    <CardDescription className="mt-1">
                      Supervisor: {group.supervisorId?.name} ({group.supervisorId?.email})
                    </CardDescription>
                  </div>
                  {group.track === 'A' && session.status === 'open' && (
                    <Button variant="outline" size="sm" onClick={() => openTitleEdit(group)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit Title
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1.5">Members</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeMembers.map((m) => (
                      <Badge key={m._id || m.studentIdText} variant="outline">
                        {typeof m.studentAccountId === 'object' ? m.studentAccountId.name : m.studentIdText}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Weekly Journal ({journalEntries.filter((e) => e.submittedAt).length} / {session.journalWeekCount} submitted)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Array.from({ length: session.journalWeekCount }, (_, i) => i + 1).map((week) => {
                      const entry = entryByWeek.get(week) || null;
                      const hasComment = !!entry?.supervisorComment;
                      return (
                        <button
                          key={week}
                          type="button"
                          onClick={() => openJournalEntry(group, session, week, entry)}
                          disabled={session.status !== 'open'}
                          className="flex items-center justify-between rounded-lg border p-2.5 text-left text-sm hover:bg-muted/50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            {entry?.submittedAt ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            Week {week}
                          </span>
                          {hasComment && <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Edit title */}
      <Dialog open={showTitleEdit !== null} onOpenChange={(open) => !open && !savingTitle && setShowTitleEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Project Title</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="project-title">Project Title</Label>
            <Input id="project-title" value={titleInput} onChange={(e) => setTitleInput(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTitleEdit(null)} disabled={savingTitle}>
              Cancel
            </Button>
            <Button onClick={saveTitle} disabled={savingTitle || !titleInput.trim()}>
              {savingTitle ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>) : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Journal entry */}
      <Dialog open={showJournalEntry !== null} onOpenChange={(open) => !open && !savingEntry && setShowJournalEntry(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Week {showJournalEntry?.week} Journal</DialogTitle>
            <DialogDescription>Describe the work you did this week. Your supervisor will review and comment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="work-done">Work Done</Label>
              <Textarea
                id="work-done"
                rows={5}
                value={workDoneInput}
                onChange={(e) => setWorkDoneInput(e.target.value)}
                placeholder="What did you work on this week?"
              />
            </div>
            {showJournalEntry?.existing?.supervisorComment && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Supervisor Comment
                </p>
                <p className="text-sm">{showJournalEntry.existing.supervisorComment}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowJournalEntry(null)} disabled={savingEntry}>
              Cancel
            </Button>
            <Button onClick={saveJournalEntry} disabled={savingEntry || !workDoneInput.trim()}>
              {savingEntry ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>) : 'Save Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
