'use client';

import { useEffect, useState, use as usePromise } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Loader2, ArrowLeft, MessageSquare, Save, ExternalLink, Link2, CheckCircle2, AlertCircle, Users, Download,
} from 'lucide-react';
import { TeacherShell } from '@/app/components/TeacherShell';
import { Tip } from '@/app/components/Tip';
import { StudentDetailDialog } from '../../components/StudentDetailDialog';
import { JournalReminderButton } from '../../components/JournalReminderButton';
import { toast } from 'sonner';
import { REPORT_RUBRICS } from '@/lib/capstoneRubrics';

interface StudentAccountRef { _id: string; studentId: string; name: string; }
interface EvaluatorRef { evaluatorId: { _id: string; name: string; email: string } | string; unassignedAt?: string | null; }
interface Member { studentAccountId: StudentAccountRef | string; studentIdText: string; removedAt?: string | null; }

interface GroupDetail {
  _id: string;
  track: 'A' | 'B' | 'C';
  projectTitle: string;
  projectAbstract?: string;
  members: Member[];
  supervisorId: { _id: string; name: string } | string;
  evaluators: EvaluatorRef[];
  chosenEvaluators?: { presentation: string[]; report: string[] };
  reportUrl?: string | null;
  lastJournalReminderAt?: string | null;
}

interface JournalEntry {
  _id: string;
  studentAccountId: string;
  weekNumber: number;
  workDone: string;
  submittedAt?: string | null;
  supervisorComment: string;
  supervisorReviewedAt?: string | null;
}

interface MarkSubmission {
  _id: string;
  studentAccountId: string;
  component: string;
  rawScore: number;
  submitterId: string;
}

// Rubric criterion for presentation (5 criteria, 0/3/6/9 scale), scored per student to
// match the department's printed "Assessment Rubrics for Term Final Presentation" sheet.
// Keys stay c0..c4 so rubricScores saved before per-student scoring still load.
const PRESENTATION_CRITERIA = [
  'Presentation Skills (Eye contact, Language, Visual aid)',
  'Organization of the Presentation Material [CO5: A1]',
  'Contents',
  'Question Answer',
  'Time Management',
];
const PRESENTATION_LEVELS = [
  { value: 0, label: 'No or Wrong Answer' },
  { value: 3, label: 'Poor' },
  { value: 6, label: 'Satisfactory' },
  { value: 9, label: 'Excellent' },
];
const PRESENTATION_MAX = PRESENTATION_CRITERIA.length * 9;

// Report criteria by track, with the level wording from the department's rubric docs.
const REPORT_LEVEL_NAMES = ['No / wrong answer', 'Poor', 'Satisfactory', 'Excellent'];
function reportRubric(track: string) {
  return REPORT_RUBRICS[(track as 'A' | 'B' | 'C')] || REPORT_RUBRICS.B;
}

const CHOOSABLE_COMPONENTS = [
  {
    key: 'presentation' as const,
    label: 'Presentation',
    hint: 'Evaluators who sat in on the group’s presentation.',
  },
  {
    key: 'report' as const,
    label: 'Report',
    hint: 'Evaluators who read and graded the submitted report.',
  },
];

function memberId(m: Member): string {
  return typeof m.studentAccountId === 'object' ? m.studentAccountId._id : m.studentAccountId;
}

function memberName(m: Member): string {
  return typeof m.studentAccountId === 'object' ? m.studentAccountId.name : m.studentIdText;
}

function sumScores(scores: Record<string, number> | undefined): number {
  return Object.values(scores || {}).reduce((a, b) => a + (b || 0), 0);
}

function isPresentationComplete(scores: Record<string, number> | undefined): boolean {
  return !!scores && PRESENTATION_CRITERIA.every((_, idx) => typeof scores[`c${idx}`] === 'number');
}

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const { data: session } = useSession();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [marks, setMarks] = useState<MarkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [savingComment, setSavingComment] = useState<string | null>(null);
  const [journalMarks, setJournalMarks] = useState<Record<string, string>>({});
  const [peerMarks, setPeerMarks] = useState<Record<string, string>>({});
  // Rubric scores: component -> studentId or 'group' -> criterionIndex -> score
  const [reportScores, setReportScores] = useState<Record<string, number>>({});
  // Presentation is scored per student: studentAccountId -> criterion key -> score
  const [presentationScores, setPresentationScores] = useState<Record<string, Record<string, number>>>({});
  const [savingMarks, setSavingMarks] = useState(false);
  const [reportUrl, setReportUrl] = useState('');
  const [savingReportUrl, setSavingReportUrl] = useState(false);
  // Chosen evaluator picker
  // Presentation and report panels are chosen independently - a group can be presented to
  // by one pair of evaluators and have its report read by another.
  const [chosenEvaluators, setChosenEvaluators] = useState<{ presentation: string[]; report: string[] }>({
    presentation: [],
    report: [],
  });
  const [savingChosen, setSavingChosen] = useState(false);
  // Export
  const [exportingJournal, setExportingJournal] = useState(false);
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  // Active tab mirrored in the URL (?tab=report), so links, refresh and search land on it.
  const [tab, setTab] = useState('journal');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('tab');
    if (requested) setTab(requested);
    // ?student=<studentAccountId> (from the global search) opens that student's details.
    const student = params.get('student');
    if (student) setOpenStudentId(student);
  }, []);
  const changeTab = (next: string) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'journal') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
  };

  const myId = session?.user?.id;
  const myRoles: string[] = (session?.user as any)?.roles || [];
  const isAdmin = myRoles.includes('admin');
  const isCoordinator = myRoles.includes('coordinator');
  const canManage = isAdmin || isCoordinator;

  const isSupervisor = group
    ? String(typeof group.supervisorId === 'object' ? group.supervisorId._id : group.supervisorId) === myId
    : false;

  const isEvaluator = group
    ? group.evaluators.some(
        (e) => !e.unassignedAt && String(typeof e.evaluatorId === 'object' ? e.evaluatorId._id : e.evaluatorId) === myId
      )
    : false;

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [journalRes, marksRes, groupRes] = await Promise.all([
        fetch(`/api/capstone/groups/${id}/journal`),
        fetch(`/api/capstone/groups/${id}/marks`),
        fetch(`/api/capstone/groups/${id}`),
      ]);
      const journalData = await journalRes.json();
      const marksData = await marksRes.json();
      const groupData = await groupRes.json();

      if (journalRes.ok) {
        setGroup(journalData.group);
        setEntries(journalData.entries);
        const drafts: Record<string, string> = {};
        for (const e of journalData.entries) drafts[e._id] = e.supervisorComment || '';
        setCommentDrafts(drafts);
      }

      if (groupRes.ok && groupData) {
        setGroup(groupData);
        setReportUrl(groupData.reportUrl || '');
        setChosenEvaluators({
          presentation: groupData.chosenEvaluators?.presentation?.map(String) || [],
          report: groupData.chosenEvaluators?.report?.map(String) || [],
        });
      }

      if (marksRes.ok) {
        setMarks(marksData);
        const jMarks: Record<string, string> = {};
        const pMarks: Record<string, string> = {};
        const rScores: Record<string, number> = {};
        const presScores: Record<string, Record<string, number>> = {};
        for (const m of marksData) {
          if (m.component === 'weeklyJournal') jMarks[m.studentAccountId] = String(m.rawScore);
          if (m.component === 'peer') pMarks[m.studentAccountId] = String(m.rawScore);
          if (m.component === 'report' && m.submitterId === myId) {
            if (m.rubricScores) Object.assign(rScores, m.rubricScores);
          }
          if (m.component === 'presentation' && m.submitterId === myId) {
            if (m.rubricScores) presScores[m.studentAccountId] = { ...m.rubricScores };
          }
        }
        setJournalMarks(jMarks);
        setPeerMarks(pMarks);
        setReportScores(rScores);
        setPresentationScores(presScores);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load group');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [id]);

  const saveComment = async (entryId: string) => {
    setSavingComment(entryId);
    try {
      const res = await fetch(`/api/capstone/groups/${id}/journal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, comment: commentDrafts[entryId] || '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save comment');
      toast.success('Comment saved');
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save comment');
    } finally {
      setSavingComment(null);
    }
  };

  const submitFinalMarks = async (component: 'weeklyJournal' | 'peer') => {
    if (!group) return;
    const source = component === 'weeklyJournal' ? journalMarks : peerMarks;
    const activeMembers = group.members.filter((m) => !m.removedAt);
    const marksPayload = activeMembers
      .map((m) => {
        const sid = typeof m.studentAccountId === 'object' ? m.studentAccountId._id : m.studentAccountId;
        const raw = source[sid];
        return raw !== undefined && raw !== '' ? { studentAccountId: sid, rawScore: Number(raw) } : null;
      })
      .filter(Boolean);
    if (marksPayload.length === 0) { toast.error('Enter at least one mark'); return; }
    setSavingMarks(true);
    try {
      const res = await fetch(`/api/capstone/groups/${id}/marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component, marks: marksPayload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save marks');
      toast.success(`Saved ${data.saved} mark(s)`);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save marks');
    } finally {
      setSavingMarks(false);
    }
  };

  const submitRubricMarks = async (component: 'report' | 'presentation') => {
    if (!group) return;
    const max = component === 'report' ? reportRubric(group.track).length * 3 : PRESENTATION_MAX;

    const activeMembers = group.members.filter((m) => !m.removedAt);
    if (activeMembers.length === 0) { toast.error('No active members in this group'); return; }

    // Report is group-level: the same rubric applies to every member. Presentation is
    // per student, and a student must have every criterion scored before it is sent - a
    // half-filled row would otherwise be saved as a low total instead of "not graded yet".
    let marksPayload: Array<{ studentAccountId: string; rawScore: number; rubricScores: Record<string, number> }>;
    if (component === 'report') {
      const unscored = reportRubric(group.track).filter((_, idx) => typeof reportScores[`c${idx}`] !== 'number');
      if (unscored.length > 0) {
        toast.error(`Score every criterion first (${unscored.length} left)`);
        return;
      }
      const rawScore = sumScores(reportScores);
      marksPayload = activeMembers.map((m) => ({ studentAccountId: memberId(m), rawScore, rubricScores: reportScores }));
    } else {
      const partial = activeMembers.filter((m) => {
        const scores = presentationScores[memberId(m)];
        return scores && Object.keys(scores).length > 0 && !isPresentationComplete(scores);
      });
      if (partial.length > 0) {
        toast.error(`Finish every criterion for ${partial.map(memberName).join(', ')} first`);
        return;
      }
      const complete = activeMembers.filter((m) => isPresentationComplete(presentationScores[memberId(m)]));
      if (complete.length === 0) { toast.error('Score at least one student first'); return; }
      marksPayload = complete.map((m) => {
        const scores = presentationScores[memberId(m)];
        return { studentAccountId: memberId(m), rawScore: sumScores(scores), rubricScores: scores };
      });
    }

    setSavingMarks(true);
    try {
      const res = await fetch(`/api/capstone/groups/${id}/marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component, marks: marksPayload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save marks');
      toast.success(
        component === 'report'
          ? `Report marks saved (${marksPayload[0].rawScore}/${max})`
          : `Presentation marks saved for ${data.saved} student${data.saved === 1 ? '' : 's'}`
      );
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save marks');
    } finally {
      setSavingMarks(false);
    }
  };

  const saveReportUrl = async () => {
    setSavingReportUrl(true);
    try {
      const res = await fetch(`/api/capstone/groups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast.success('Report link saved');
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingReportUrl(false);
    }
  };

  const saveChosenEvaluators = async () => {
    setSavingChosen(true);
    try {
      const res = await fetch(`/api/capstone/groups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chosenEvaluators }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      toast.success('Chosen evaluators updated');
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingChosen(false);
    }
  };

  const exportJournal = async () => {
    setExportingJournal(true);
    try {
      const res = await fetch(`/api/capstone/groups/${id}/journal/export`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `journal-${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setExportingJournal(false);
    }
  };

  // Keep the page frame while loading so the sidebar and header don't flash away.
  if (loading) return <TeacherShell title="Capstone Group"><div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></TeacherShell>;
  if (!group) {
    return (
      <TeacherShell title="Capstone Group">
        <div className="flex items-center justify-center py-24 text-muted-foreground">Group not found or access denied.</div>
      </TeacherShell>
    );
  }

  const activeMembers = group.members.filter((m) => !m.removedAt);
  const activeEvaluators = group.evaluators.filter((e) => !e.unassignedAt);
  const reportCriteria = reportRubric(group.track);
  const reportMax = reportCriteria.length * 3;
  const reportCurrentScore = Object.values(reportScores).reduce((a, b) => a + (b || 0), 0);

  return (
    <TeacherShell
      title={group.projectTitle || 'Untitled Project'}
      subtitle={`Track ${group.track}`}
      actions={
        <>
          {(isSupervisor || canManage) && (
            <JournalReminderButton
              groupId={id}
              lastSentAt={group.lastJournalReminderAt}
              onSent={(at) => setGroup((g) => (g ? { ...g, lastJournalReminderAt: at } : g))}
            />
          )}
          <Tip label="Back to My Groups">
            <Button asChild variant="outline" size="sm">
              <Link href="/capstone">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Back</span>
              </Link>
            </Button>
          </Tip>
        </>
      }
    >
      <div className="mx-auto max-w-4xl p-4 pt-8">
        {/* Group info */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant="outline">Track {group.track}</Badge>
          {isSupervisor && <Badge>Supervisor</Badge>}
          {isEvaluator && <Badge variant="secondary">Evaluator</Badge>}
          {canManage && <Badge variant="secondary">Coordinator/Admin</Badge>}
        </div>

        {/* Students - click one for their marks, grade and journal. */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" /> Students
            </CardTitle>
            <CardDescription>Click a student to see their marks, grade and weekly journal progress.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {activeMembers.map((m) => (
              <Tip key={memberId(m)} label="View marks, grade and journal">
                <button
                  type="button"
                  onClick={() => setOpenStudentId(memberId(m))}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{memberName(m)}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{m.studentIdText}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entries.filter((e) => e.studentAccountId === memberId(m) && e.submittedAt).length} journal
                  </span>
                </button>
              </Tip>
            ))}
          </CardContent>
        </Card>
        <StudentDetailDialog
          groupId={openStudentId ? id : null}
          studentAccountId={openStudentId}
          onClose={() => setOpenStudentId(null)}
          onUpdated={() => fetchAll()}
        />

        <Tabs
          value={
            // A tab this viewer can't see (e.g. from a shared link) falls back to the journal.
            ({
              journal: true,
              'supervisor-marks': isSupervisor,
              report: isSupervisor || isEvaluator,
              presentation: isSupervisor || isEvaluator,
              manage: canManage,
            } as Record<string, boolean>)[tab]
              ? tab
              : 'journal'
          }
          onValueChange={changeTab}
        >
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="journal">Weekly Journal</TabsTrigger>
            {isSupervisor && <TabsTrigger value="supervisor-marks">Supervisor Marks</TabsTrigger>}
            {(isSupervisor || isEvaluator) && <TabsTrigger value="report">Report</TabsTrigger>}
            {(isSupervisor || isEvaluator) && <TabsTrigger value="presentation">Presentation</TabsTrigger>}
            {canManage && <TabsTrigger value="manage">Manage</TabsTrigger>}
          </TabsList>

          {/* ── Journal Tab ── */}
          <TabsContent value="journal" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Tip label="Download every student's journal entries and your comments as a spreadsheet">
                <Button variant="outline" size="sm" onClick={exportJournal} disabled={exportingJournal}>
                  {exportingJournal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  <span className="ml-1.5">Export CSV</span>
                </Button>
              </Tip>
            </div>
            {activeMembers.map((member) => {
              const sid = typeof member.studentAccountId === 'object' ? member.studentAccountId._id : member.studentAccountId;
              const name = typeof member.studentAccountId === 'object' ? member.studentAccountId.name : member.studentIdText;
              const memberEntries = entries.filter((e) => e.studentAccountId === sid).sort((a, b) => a.weekNumber - b.weekNumber);
              return (
                <Card key={sid}>
                  <CardHeader>
                    <CardTitle className="text-base">{name}</CardTitle>
                    <CardDescription>{memberEntries.filter(e => e.submittedAt).length} entries submitted</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {memberEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No journal entries yet.</p>
                    ) : (
                      memberEntries.map((entry) => (
                        <div key={entry._id} className="rounded-lg border p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">Week {entry.weekNumber}</Badge>
                            {entry.supervisorReviewedAt && (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{entry.workDone}</p>
                          {isSupervisor && (
                            <div className="flex gap-2 items-start pt-1">
                              <Textarea
                                rows={2}
                                placeholder="Add a comment..."
                                value={commentDrafts[entry._id] ?? ''}
                                onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [entry._id]: e.target.value }))}
                                className="flex-1"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => saveComment(entry._id)}
                                disabled={savingComment === entry._id}
                              >
                                {savingComment === entry._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                              </Button>
                            </div>
                          )}
                          {!isSupervisor && entry.supervisorComment && (
                            <p className="text-sm text-muted-foreground italic border-l-2 border-primary/30 pl-2">
                              {entry.supervisorComment}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* ── Supervisor Marks Tab ── */}
          {isSupervisor && (
            <TabsContent value="supervisor-marks" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Weekly Journal Mark (0–10)</CardTitle>
                  <CardDescription>Final journal mark per student, based on their weekly submissions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeMembers.map((member) => {
                    const sid = typeof member.studentAccountId === 'object' ? member.studentAccountId._id : member.studentAccountId;
                    const name = typeof member.studentAccountId === 'object' ? member.studentAccountId.name : member.studentIdText;
                    return (
                      <div key={sid} className="flex items-center justify-between gap-3">
                        <Label className="flex-1">{name}</Label>
                        <Input type="number" min={0} max={10} step={0.5} className="w-28"
                          value={journalMarks[sid] ?? ''}
                          onChange={(e) => setJournalMarks((prev) => ({ ...prev, [sid]: e.target.value }))} />
                      </div>
                    );
                  })}
                  <Tip label="Save each student's own journal mark (0-10). You can change them while the session is open.">
                    <Button onClick={() => submitFinalMarks('weeklyJournal')} disabled={savingMarks} size="sm">
                      {savingMarks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Save Journal Marks
                    </Button>
                  </Tip>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Peer Mark (0–5)</CardTitle>
                  <CardDescription>Per student: each member&apos;s own contribution to the group, as assessed by the supervisor.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeMembers.map((member) => {
                    const sid = typeof member.studentAccountId === 'object' ? member.studentAccountId._id : member.studentAccountId;
                    const name = typeof member.studentAccountId === 'object' ? member.studentAccountId.name : member.studentIdText;
                    return (
                      <div key={sid} className="flex items-center justify-between gap-3">
                        <Label className="flex-1">{name}</Label>
                        <Input type="number" min={0} max={5} step={0.5} className="w-28"
                          value={peerMarks[sid] ?? ''}
                          onChange={(e) => setPeerMarks((prev) => ({ ...prev, [sid]: e.target.value }))} />
                      </div>
                    );
                  })}
                  <Tip label="Save each student's own peer mark (0-5) - their individual contribution to the group.">
                    <Button onClick={() => submitFinalMarks('peer')} disabled={savingMarks} size="sm">
                      {savingMarks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Save Peer Marks
                    </Button>
                  </Tip>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ── Report Tab ── */}
          {(isSupervisor || isEvaluator) && (
            <TabsContent value="report" className="space-y-4 mt-4">
              {/* Report link section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Report Submission Link
                  </CardTitle>
                  <CardDescription>Google Drive or external link to the group's submitted report.</CardDescription>
                </CardHeader>
                <CardContent>
                  {group.reportUrl ? (
                    <a href={group.reportUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                      <ExternalLink className="h-4 w-4" />
                      Open Report
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">No report link set yet.</p>
                  )}
                  {(isSupervisor || canManage) && (
                    <div className="flex gap-2 mt-3">
                      <Input placeholder="https://drive.google.com/..." value={reportUrl}
                        onChange={(e) => setReportUrl(e.target.value)} className="flex-1" />
                      <Button size="sm" onClick={saveReportUrl} disabled={savingReportUrl} title="Save the report link">
                        {savingReportUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Rubric input */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Report Evaluation Rubric</CardTitle>
                  <CardDescription>
                    Score each criterion 0–3 (0=No/Wrong, 1=Poor, 2=Satisfactory, 3=Excellent). Max: {reportMax}.
                    Current total: <strong>{reportCurrentScore}/{reportMax}</strong>
                    &nbsp;— this is a <strong>group-level</strong> mark applied to all members.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {reportCriteria.map((criterion, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-3 border-b pb-3 last:border-b-0">
                      <div className="flex-1">
                        <Label className="text-sm">{idx + 1}. {criterion.label}</Label>
                        {typeof reportScores[`c${idx}`] === 'number' && reportScores[`c${idx}`] > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {criterion.levels[reportScores[`c${idx}`] - 1]}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {[0, 1, 2, 3].map((score) => (
                          <button
                            key={score}
                            type="button"
                            title={`${REPORT_LEVEL_NAMES[score]} (${score})${score > 0 ? `: ${criterion.levels[score - 1]}` : ''}`}
                            onClick={() => setReportScores((prev) => ({ ...prev, [`c${idx}`]: score }))}
                            className={`h-8 w-8 rounded-md border text-sm font-medium transition-colors ${
                              reportScores[`c${idx}`] === score
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'hover:bg-muted'
                            }`}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <Tip label="Submit your report rubric - one mark for the whole group, applied to every member. Every criterion must be scored.">
                    <Button onClick={() => submitRubricMarks('report')} disabled={savingMarks} size="sm" className="mt-2">
                      {savingMarks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Submit Report Marks ({reportCurrentScore}/{reportMax})
                    </Button>
                  </Tip>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ── Presentation Tab ── */}
          {(isSupervisor || isEvaluator) && (
            <TabsContent value="presentation" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Presentation Evaluation Rubric</CardTitle>
                  <CardDescription>
                    Score each student on every criterion: No or Wrong Answer (0), Poor (3),
                    Satisfactory (6), Excellent (9). Max {PRESENTATION_MAX} per student.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs">
                        <tr>
                          <th className="p-2 text-left font-medium">Student</th>
                          {PRESENTATION_CRITERIA.map((criterion, idx) => (
                            <th key={idx} className="p-2 text-center font-medium min-w-[9rem]">{criterion}</th>
                          ))}
                          <th className="p-2 text-center font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeMembers.map((member) => {
                          const sid = memberId(member);
                          const scores = presentationScores[sid] || {};
                          const filled = Object.keys(scores).length;
                          return (
                            <tr key={sid} className="border-t">
                              <td className="p-2 align-middle">
                                <div className="font-medium">{memberName(member)}</div>
                                <div className="text-xs text-muted-foreground">{member.studentIdText}</div>
                              </td>
                              {PRESENTATION_CRITERIA.map((criterion, idx) => (
                                <td key={idx} className="p-2 text-center align-middle">
                                  <div className="inline-flex gap-1">
                                    {PRESENTATION_LEVELS.map((level) => (
                                      <button
                                        key={level.value}
                                        type="button"
                                        title={`${criterion}: ${level.label}`}
                                        onClick={() =>
                                          setPresentationScores((prev) => ({
                                            ...prev,
                                            [sid]: { ...prev[sid], [`c${idx}`]: level.value },
                                          }))
                                        }
                                        className={`h-7 w-7 rounded-md border text-xs font-medium transition-colors ${
                                          scores[`c${idx}`] === level.value
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'hover:bg-muted'
                                        }`}
                                      >
                                        {level.value}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              ))}
                              <td className="p-2 text-center align-middle whitespace-nowrap">
                                <strong>{sumScores(scores)}</strong>/{PRESENTATION_MAX}
                                {filled > 0 && filled < PRESENTATION_CRITERIA.length && (
                                  <div className="text-[11px] text-amber-600">{PRESENTATION_CRITERIA.length - filled} left</div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <Tip label="Submit presentation marks for every student whose five criteria are all scored.">
                    <Button onClick={() => submitRubricMarks('presentation')} disabled={savingMarks} size="sm" className="mt-2">
                      {savingMarks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Submit Presentation Marks
                    </Button>
                  </Tip>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ── Manage Tab (Coordinator/Admin) ── */}
          {canManage && (
            <TabsContent value="manage" className="space-y-4 mt-4">
              {/* Choose evaluators — one panel per component */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Choose Evaluators for Final Grade
                  </CardTitle>
                  <CardDescription>
                    Presentation and report are graded by different panels, so pick each
                    separately. Up to 2 evaluators count per component; everyone else&apos;s
                    marks are still recorded, just not counted.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {activeEvaluators.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active evaluators assigned to this group.</p>
                  ) : (
                    <>
                      {CHOOSABLE_COMPONENTS.map(({ key, label, hint }) => {
                        const selected = chosenEvaluators[key];
                        return (
                          <div key={key} className="space-y-2.5">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <h4 className="text-sm font-semibold">{label}</h4>
                              <span className="text-xs text-muted-foreground">
                                {selected.length}/2 chosen
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">{hint}</p>

                            <div className="space-y-2">
                              {activeEvaluators.map((ev) => {
                                const evId = typeof ev.evaluatorId === 'object' ? ev.evaluatorId._id : String(ev.evaluatorId);
                                const evName = typeof ev.evaluatorId === 'object' ? ev.evaluatorId.name : evId;
                                const evEmail = typeof ev.evaluatorId === 'object' ? ev.evaluatorId.email : '';
                                const isChosen = selected.includes(evId);
                                const atLimit = !isChosen && selected.length >= 2;
                                return (
                                  <div
                                    key={evId}
                                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm truncate">{evName}</p>
                                      {evEmail && (
                                        <p className="text-xs text-muted-foreground truncate">{evEmail}</p>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      disabled={atLimit}
                                      onClick={() =>
                                        setChosenEvaluators((prev) => ({
                                          ...prev,
                                          [key]: isChosen
                                            ? prev[key].filter((cid) => cid !== evId)
                                            : [...prev[key], evId],
                                        }))
                                      }
                                      className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 transition-colors ${
                                        isChosen
                                          ? 'bg-primary text-primary-foreground'
                                          : atLimit
                                            ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                      }`}
                                    >
                                      {isChosen ? (
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                      ) : (
                                        <AlertCircle className="h-3.5 w-3.5" />
                                      )}
                                      {isChosen ? 'Counted' : atLimit ? 'Limit reached' : 'Count'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      <Button size="sm" onClick={saveChosenEvaluators} disabled={savingChosen} title="Save which evaluators' marks count toward the grade">
                        {savingChosen ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Save Selection
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </TeacherShell>
  );
}
