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
  Loader2, ArrowLeft, MessageSquare, Save, ExternalLink, Link2, CheckCircle2, AlertCircle, Users, Download, ClipboardEdit, Plus,
} from 'lucide-react';
import { TeacherShell } from '@/app/components/TeacherShell';
import { Tip } from '@/app/components/Tip';
import { StudentDetailDialog } from '../../components/StudentDetailDialog';
import { JournalReminderButton } from '../../components/JournalReminderButton';
import { toast } from 'sonner';
import {
  REPORT_RUBRICS,
  PRESENTATION_MAX,
  sumRubricScores,
  isPresentationComplete,
} from '@/lib/capstoneRubrics';
import { PresentationRubricGrid } from '../../components/PresentationRubricGrid';

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
  /** Average ('mean', default) or best ('max') of the chosen evaluators, per component. */
  chosenAggregate?: { presentation?: 'mean' | 'max'; report?: 'mean' | 'max' };
  reportUrl?: string | null;
  lastJournalReminderAt?: string | null;
  /** Who marks what, read from the track's active grading scheme (lib/capstoneMarkingPlan.ts). */
  markingPlan?: MarkingPlan;
}

interface MarkingPlan {
  source: 'scheme' | 'default';
  schemeName?: string;
  schemeVersion?: number;
  supervisor: Array<{ component: string; max: number }>;
  evaluator: Array<{ component: string; max: number }>;
}

/** Before the plan loads (or from an older server): the department's default split. */
const FALLBACK_PLAN: MarkingPlan = {
  source: 'default',
  supervisor: [
    { component: 'report', max: 0 },
    { component: 'presentation', max: 45 },
    { component: 'peer', max: 5 },
    { component: 'weeklyJournal', max: 10 },
  ],
  evaluator: [
    { component: 'report', max: 0 },
    { component: 'presentation', max: 45 },
  ],
};

/** Components with their own rubric screen; every other component gets a score per student. */
const RUBRIC_COMPONENTS = ['report', 'presentation'];

const COMPONENT_INFO: Record<string, { label: string; description: string }> = {
  weeklyJournal: { label: 'Weekly Journal Mark', description: "Each student's own journal mark, based on their weekly submissions." },
  peer: { label: 'Peer Mark', description: "Each member's own contribution to the group." },
  poster: { label: 'Poster Mark', description: "Each student's poster mark." },
  report: { label: 'Report', description: '' },
  presentation: { label: 'Presentation', description: '' },
};

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

// Presentation rubric (5 criteria x 0/3/6/9, per student) lives in lib/capstoneRubrics.ts.

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

const sumScores = sumRubricScores;

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const { data: session } = useSession();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [marks, setMarks] = useState<MarkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [savingComment, setSavingComment] = useState<string | null>(null);
  // Per-student scores for components without a rubric screen (journal, peer, poster, ...):
  // component -> studentAccountId -> typed value.
  const [numericMarks, setNumericMarks] = useState<Record<string, Record<string, string>>>({});
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
  const [chosenAggregate, setChosenAggregate] = useState<{ presentation: 'mean' | 'max'; report: 'mean' | 'max' }>({
    presentation: 'mean',
    report: 'mean',
  });
  // Adding an evaluator from the paper-sheet card (someone who sat in but wasn't assigned).
  const [staff, setStaff] = useState<Array<{ _id: string; name: string; email: string }>>([]);
  const [evaluatorToAdd, setEvaluatorToAdd] = useState('');
  const [addingEvaluator, setAddingEvaluator] = useState(false);
  // Coordinator entering a grader's presentation marks from their paper sheet.
  const [proxyGrader, setProxyGrader] = useState('');
  const [proxyScores, setProxyScores] = useState<Record<string, Record<string, number>>>({});
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxySaving, setProxySaving] = useState(false);
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
        setChosenAggregate({
          presentation: groupData.chosenAggregate?.presentation === 'max' ? 'max' : 'mean',
          report: groupData.chosenAggregate?.report === 'max' ? 'max' : 'mean',
        });
      }

      if (marksRes.ok) {
        setMarks(marksData);
        const numeric: Record<string, Record<string, string>> = {};
        const rScores: Record<string, number> = {};
        const presScores: Record<string, Record<string, number>> = {};
        for (const m of marksData) {
          if (!RUBRIC_COMPONENTS.includes(m.component)) {
            numeric[m.component] = { ...(numeric[m.component] || {}), [m.studentAccountId]: String(m.rawScore) };
          }
          if (m.component === 'report' && m.submitterId === myId) {
            if (m.rubricScores) Object.assign(rScores, m.rubricScores);
          }
          if (m.component === 'presentation' && m.submitterId === myId) {
            if (m.rubricScores) presScores[m.studentAccountId] = { ...m.rubricScores };
          }
        }
        setNumericMarks(numeric);
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

  const submitFinalMarks = async (component: string) => {
    if (!group) return;
    const source = numericMarks[component] || {};
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

  /** Assigns another evaluator (who sat in on the presentation) and opens their sheet for entry. */
  const addEvaluatorAndSelect = async () => {
    if (!evaluatorToAdd) return;
    setAddingEvaluator(true);
    try {
      const res = await fetch(`/api/capstone/groups/${id}/evaluators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluatorId: evaluatorToAdd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add evaluator');
      toast.success('Evaluator added to this group');
      const added = evaluatorToAdd;
      setEvaluatorToAdd('');
      await fetchAll();
      loadProxyGrader(added);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add evaluator');
    } finally {
      setAddingEvaluator(false);
    }
  };

  // The staff list for "add evaluator" - only coordinators need it, and only once.
  useEffect(() => {
    if (!canManage || staff.length > 0) return;
    fetch('/api/auth/users')
      .then((res) => (res.ok ? res.json() : []))
      .then((users) => setStaff(Array.isArray(users) ? users : []))
      .catch(() => {});
  }, [canManage, staff.length]);

  /** Loads the chosen grader's existing presentation marks so the sheet can be completed or corrected. */
  const loadProxyGrader = async (graderId: string) => {
    setProxyGrader(graderId);
    setProxyScores({});
    if (!graderId) return;
    setProxyLoading(true);
    try {
      const res = await fetch(`/api/capstone/groups/${id}/marks?submitterId=${graderId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load marks');
      const next: Record<string, Record<string, number>> = {};
      for (const m of data as Array<{ component: string; studentAccountId: string; rubricScores?: Record<string, number> | null }>) {
        if (m.component === 'presentation' && m.rubricScores) next[String(m.studentAccountId)] = { ...m.rubricScores };
      }
      setProxyScores(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load marks');
    } finally {
      setProxyLoading(false);
    }
  };

  const saveProxyMarks = async () => {
    if (!group || !proxyGrader) return;
    const active = group.members.filter((m) => !m.removedAt);
    const partial = active.filter((m) => {
      const sc = proxyScores[memberId(m)];
      return sc && Object.keys(sc).length > 0 && !isPresentationComplete(sc);
    });
    if (partial.length > 0) {
      toast.error(`Finish every criterion for ${partial.map(memberName).join(', ')} first`);
      return;
    }
    const complete = active.filter((m) => isPresentationComplete(proxyScores[memberId(m)]));
    if (complete.length === 0) {
      toast.error('Score at least one student first');
      return;
    }
    setProxySaving(true);
    try {
      const res = await fetch(`/api/capstone/groups/${id}/marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          component: 'presentation',
          onBehalfOf: proxyGrader,
          marks: complete.map((m) => {
            const scores = proxyScores[memberId(m)];
            return { studentAccountId: memberId(m), rawScore: sumScores(scores), rubricScores: scores };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save marks');
      toast.success(`Saved presentation marks for ${data.saved} student${data.saved === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save marks');
    } finally {
      setProxySaving(false);
    }
  };

  const saveChosenEvaluators = async () => {
    const activeCount = group?.evaluators.filter((e) => !e.unassignedAt).length || 0;
    const minimum = Math.min(2, activeCount);
    const short = (['presentation', 'report'] as const).filter(
      (k) => chosenEvaluators[k].length > 0 && chosenEvaluators[k].length < minimum
    );
    if (short.length > 0) {
      toast.error(`Choose at least ${minimum} evaluators for ${short.join(' and ')} (or none)`);
      return;
    }
    setSavingChosen(true);
    try {
      const res = await fetch(`/api/capstone/groups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chosenEvaluators, chosenAggregate }),
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
  // What this viewer marks here comes from the track's active grading scheme.
  const plan = group.markingPlan || FALLBACK_PLAN;
  const myTasks = isSupervisor ? plan.supervisor : isEvaluator ? plan.evaluator : [];
  const hasTask = (component: string) => myTasks.some((t) => t.component === component);
  const numericTasks = myTasks.filter((t) => !RUBRIC_COMPONENTS.includes(t.component));
  // Who the scheme reads presentation marks from - the paper-sheet card offers only them.
  const presentationFromSupervisor = plan.supervisor.some((t) => t.component === 'presentation');
  const presentationFromEvaluators = plan.evaluator.some((t) => t.component === 'presentation');
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

        <p className="mb-3 text-xs text-muted-foreground">
          {plan.source === 'scheme'
            ? `Marking follows the ${plan.schemeName}${plan.schemeVersion ? ` (v${plan.schemeVersion})` : ''} grading scheme for this track.`
            : 'No grading scheme is pinned to this track yet - marking follows the department default.'}
        </p>
        <Tabs
          value={
            // A tab this viewer can't see (e.g. from a shared link) falls back to the journal.
            ({
              journal: true,
              'supervisor-marks': numericTasks.length > 0,
              report: hasTask('report'),
              presentation: hasTask('presentation'),
              manage: canManage,
            } as Record<string, boolean>)[tab]
              ? tab
              : 'journal'
          }
          onValueChange={changeTab}
        >
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="journal">Weekly Journal</TabsTrigger>
            {numericTasks.length > 0 && (
              <TabsTrigger value="supervisor-marks">{isSupervisor ? 'Supervisor Marks' : 'Marks'}</TabsTrigger>
            )}
            {hasTask('report') && <TabsTrigger value="report">Report</TabsTrigger>}
            {hasTask('presentation') && <TabsTrigger value="presentation">Presentation</TabsTrigger>}
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

          {/* ── Per-student marks the scheme asks this grader for (journal, peer, poster, ...) ── */}
          {numericTasks.length > 0 && (
            <TabsContent value="supervisor-marks" className="space-y-4 mt-4">
              {numericTasks.map(({ component, max }) => {
                const info = COMPONENT_INFO[component] || { label: component, description: '' };
                const values = numericMarks[component] || {};
                return (
                  <Card key={component}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {info.label} (0–{max})
                      </CardTitle>
                      {info.description && <CardDescription>{info.description}</CardDescription>}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {activeMembers.map((member) => {
                        const sid = memberId(member);
                        const typed = values[sid];
                        const outOfRange = typed !== undefined && typed !== '' && (Number(typed) < 0 || Number(typed) > max);
                        return (
                          <div key={sid} className="flex items-center justify-between gap-3">
                            <Label className="flex-1" htmlFor={`mark-${component}-${sid}`}>{memberName(member)}</Label>
                            <Input
                              id={`mark-${component}-${sid}`}
                              type="number"
                              min={0}
                              max={max}
                              step={0.5}
                              className={`w-28 ${outOfRange ? 'border-destructive' : ''}`}
                              value={typed ?? ''}
                              onChange={(e) =>
                                setNumericMarks((prev) => ({ ...prev, [component]: { ...(prev[component] || {}), [sid]: e.target.value } }))
                              }
                            />
                          </div>
                        );
                      })}
                      <Tip label={`Save each student's own ${info.label.toLowerCase()} (0-${max}). You can change them while the session is open.`}>
                        <Button onClick={() => submitFinalMarks(component)} disabled={savingMarks} size="sm">
                          {savingMarks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                          Save {info.label}s
                        </Button>
                      </Tip>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>
          )}

          {/* ── Report Tab ── */}
          {hasTask('report') && (
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
          {hasTask('presentation') && (
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
                  <PresentationRubricGrid
                    students={activeMembers.map((m) => ({ id: memberId(m), name: memberName(m), studentId: m.studentIdText }))}
                    scores={presentationScores}
                    onScore={(sid, key, value) =>
                      setPresentationScores((prev) => ({ ...prev, [sid]: { ...prev[sid], [key]: value } }))
                    }
                  />
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
              {/* Enter a grader's presentation marks from their paper sheet */}
              {(presentationFromSupervisor || presentationFromEvaluators) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardEdit className="h-4 w-4" />
                    Enter Presentation Marks from Paper Sheets
                  </CardTitle>
                  <CardDescription>
                    Copy an evaluator&apos;s (or the supervisor&apos;s) printed marking sheet in. The marks are saved as
                    theirs - counted exactly as if they had entered them - and recorded as entered by you.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(() => {
                    const supervisor = typeof group.supervisorId === 'object' ? group.supervisorId : null;
                    const graders = [
                      ...(supervisor && presentationFromSupervisor ? [{ id: supervisor._id, name: supervisor.name, role: 'Supervisor' }] : []),
                      ...(presentationFromEvaluators ? activeEvaluators : []).map((ev) => ({
                        id: typeof ev.evaluatorId === 'object' ? ev.evaluatorId._id : String(ev.evaluatorId),
                        name: typeof ev.evaluatorId === 'object' ? ev.evaluatorId.name : String(ev.evaluatorId),
                        role: 'Evaluator',
                      })),
                    ];
                    // Mirrors countedEvaluators: the choice, or everyone when there are only 1-2.
                    const countsFor = (graderId: string, role: string) =>
                      role === 'Supervisor'
                        ? true
                        : chosenEvaluators.presentation.length > 0
                          ? chosenEvaluators.presentation.includes(graderId)
                          : activeEvaluators.length <= 2;
                    return (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <Label htmlFor="proxy-grader" className="shrink-0">Marks from</Label>
                          <select
                            id="proxy-grader"
                            value={proxyGrader}
                            onChange={(e) => loadProxyGrader(e.target.value)}
                            className="h-9 min-w-56 rounded-md border bg-background px-3 text-sm"
                            disabled={proxySaving}
                          >
                            <option value="">Choose whose sheet this is…</option>
                            {graders.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name} ({g.role}){countsFor(g.id, g.role) ? '' : ' - not counted'}
                              </option>
                            ))}
                          </select>
                          {proxyLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        </div>
                        {presentationFromEvaluators && (
                          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2">
                            <Label htmlFor="add-sheet-evaluator" className="shrink-0 text-xs text-muted-foreground">
                              Sheet from someone not listed?
                            </Label>
                            <select
                              id="add-sheet-evaluator"
                              value={evaluatorToAdd}
                              onChange={(e) => setEvaluatorToAdd(e.target.value)}
                              className="h-8 min-w-48 flex-1 rounded-md border bg-background px-2 text-xs"
                              disabled={addingEvaluator}
                            >
                              <option value="">Choose an evaluator to add…</option>
                              {staff
                                .filter(
                                  (u) =>
                                    u._id !== supervisor?._id &&
                                    !activeEvaluators.some(
                                      (ev) => (typeof ev.evaluatorId === 'object' ? ev.evaluatorId._id : String(ev.evaluatorId)) === u._id
                                    )
                                )
                                .map((u) => (
                                  <option key={u._id} value={u._id}>
                                    {u.name} ({u.email})
                                  </option>
                                ))}
                            </select>
                            <Tip label="Assign this person as an evaluator of the group and open their sheet for entry">
                              <Button size="sm" variant="outline" className="h-8" onClick={addEvaluatorAndSelect} disabled={!evaluatorToAdd || addingEvaluator}>
                                {addingEvaluator ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                                Add evaluator
                              </Button>
                            </Tip>
                          </div>
                        )}
                        {proxyGrader && !proxyLoading && (
                          <>
                            {(() => {
                              const g = graders.find((x) => x.id === proxyGrader);
                              return g && !countsFor(g.id, g.role) ? (
                                <p className="text-xs text-amber-700 dark:text-amber-300">
                                  This evaluator isn&apos;t currently counted for the presentation grade - tick them under
                                  &quot;Choose Evaluators for Final Grade&quot; below if their marks should count.
                                </p>
                              ) : null;
                            })()}
                            <PresentationRubricGrid
                              students={activeMembers.map((m) => ({ id: memberId(m), name: memberName(m), studentId: m.studentIdText }))}
                              scores={proxyScores}
                              onScore={(sid, key, value) =>
                                setProxyScores((prev) => ({ ...prev, [sid]: { ...prev[sid], [key]: value } }))
                              }
                              disabled={proxySaving}
                            />
                            <Tip label="Save these marks as this grader's presentation marks. Students left blank are skipped.">
                              <Button size="sm" onClick={saveProxyMarks} disabled={proxySaving}>
                                {proxySaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                Save marks for {graders.find((x) => x.id === proxyGrader)?.name || 'grader'}
                              </Button>
                            </Tip>
                          </>
                        )}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              )}

              {/* Choose evaluators — one panel per component */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Choose Evaluators for Final Grade
                  </CardTitle>
                  <CardDescription>
                    Presentation and report are graded by different panels, so pick each
                    separately. Choose two or more evaluators per component - their marks are
                    averaged. Everyone else&apos;s marks are still recorded, just not counted. With
                    only one or two evaluators, all of them count automatically.
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
                                {selected.length === 0
                                  ? activeEvaluators.length <= 2
                                    ? 'All count automatically'
                                    : 'None chosen yet'
                                  : `${selected.length} chosen${selected.length < Math.min(2, activeEvaluators.length) ? ' - pick at least 2' : ''}`}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">{hint}</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-muted-foreground">Combine the counted evaluators by</span>
                              <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label={`How to combine ${label} evaluators`}>
                                {([
                                  ['mean', 'Average', 'Use the average of the counted evaluators (default)'],
                                  ['max', 'Best', 'Use the highest mark among the counted evaluators'],
                                ] as const).map(([value, text, tip]) => (
                                  <button
                                    key={value}
                                    type="button"
                                    role="radio"
                                    aria-checked={chosenAggregate[key] === value}
                                    title={tip}
                                    onClick={() => setChosenAggregate((prev) => ({ ...prev, [key]: value }))}
                                    className={`rounded px-2.5 py-0.5 text-xs font-medium transition-colors ${
                                      chosenAggregate[key] === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                  >
                                    {text}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-2">
                              {activeEvaluators.map((ev) => {
                                const evId = typeof ev.evaluatorId === 'object' ? ev.evaluatorId._id : String(ev.evaluatorId);
                                const evName = typeof ev.evaluatorId === 'object' ? ev.evaluatorId.name : evId;
                                const evEmail = typeof ev.evaluatorId === 'object' ? ev.evaluatorId.email : '';
                                const isChosen = selected.includes(evId);
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
                                      title={isChosen ? "Stop counting this evaluator's marks" : "Count this evaluator's marks toward the grade"}
                                      aria-pressed={isChosen}
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
                                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                      }`}
                                    >
                                      {isChosen ? (
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                      ) : (
                                        <AlertCircle className="h-3.5 w-3.5" />
                                      )}
                                      {isChosen ? 'Counted' : 'Count'}
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
