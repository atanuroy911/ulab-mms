'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Loader2, ArrowLeft, Save, ExternalLink, Link2, CheckCircle2, AlertCircle, Users, ClipboardEdit, Plus, ChevronRight, Archive, Lock,
} from 'lucide-react';
import { TeacherShell } from '@/app/components/TeacherShell';
import { Tip } from '@/app/components/Tip';
import { JournalReminderButton } from '../../components/JournalReminderButton';
import { JournalReviewPanel } from './JournalReviewPanel';
import { EvaluatorChoicePanel } from './EvaluatorChoicePanel';
import { MarkPicker } from '../../components/MarkPicker';
import { SessionStatusPill } from '../../components/SessionStatusPill';
import { isPastSession, isRunning } from '@/lib/capstoneStatus';
import { clearPageCache, readPageCache, writePageCache } from '@/lib/pageCache';

// Heavier pieces that only some visits need load on demand, keeping the first load small.
const StudentDetailDialog = dynamic(() => import('../../components/StudentDetailDialog').then((m) => m.StudentDetailDialog), { ssr: false });
const PresentationRubricGrid = dynamic(() => import('../../components/PresentationRubricGrid').then((m) => m.PresentationRubricGrid), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-lg bg-muted" />,
});
import { toast } from 'sonner';
import {
  REPORT_RUBRICS,
  PRESENTATION_MAX,
  sumRubricScores,
  isPresentationComplete,
} from '@/lib/capstoneRubrics';

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
  chosenEvaluators?: { presentation: string[]; report: string[]; poster?: string[] };
  evaluatorTopK?: { presentation?: number | null; report?: number | null; poster?: number | null };
  /** Average ('mean', default) or best ('max') of the chosen evaluators, per component. */
  chosenAggregate?: { presentation?: 'mean' | 'max'; report?: 'mean' | 'max'; poster?: 'mean' | 'max' };
  reportUrl?: string | null;
  lastJournalReminderAt?: string | null;
  /** Who marks what, read from the track's active grading scheme (lib/capstoneMarkingPlan.ts). */
  markingPlan?: MarkingPlan;
  /** The session's workflow status (draft/open/grading/closed). */
  sessionStatus?: string;
  semesterName?: string | null;
  /** Decided by the server: coordinator of this group's department, or admin. */
  canManage?: boolean;
  /** A manager who doesn't grade this group - graders never choose whose marks count. */
  canChooseEvaluators?: boolean;
  groupNumber?: number;
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
    key: 'poster' as const,
    label: 'Poster',
    hint: 'Evaluators who marked the group’s poster (4098C).',
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

/**
 * Where the group view sits: the full page (sidebar, header) or, for coordinators working
 * through a session, inside a modal with a slim header of its own.
 */
function Frame({
  embedded,
  title,
  subtitle,
  meta,
  actions,
  children,
}: {
  embedded: boolean;
  title: string;
  subtitle?: string;
  /** Badges shown under the title in the modal header (the page shows them in the body). */
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  if (!embedded) {
    return (
      <TeacherShell title={title} subtitle={subtitle} actions={actions}>
        {children}
      </TeacherShell>
    );
  }
  // Header fixed, body scrolls; min-w-0 everywhere so a long title can never widen the modal.
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="flex shrink-0 flex-col gap-3 border-b bg-muted/30 px-4 py-4 pr-12 sm:flex-row sm:items-start sm:px-6">
        <div className="min-w-0 flex-1">
          {subtitle && <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{subtitle}</p>}
          <h2 className="mt-0.5 line-clamp-2 text-base leading-snug font-semibold break-words sm:text-lg" title={title}>
            {title}
          </h2>
          {meta && <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</div>
    </div>
  );
}

/**
 * One capstone group: journal, marks, report and (for coordinators) the Manage tab. Used by
 * the group page, and embedded in a modal from the session screen (`embedded`) - there the
 * tab isn't mirrored in the URL and there's no "Back to My Groups".
 */
export function GroupDetailView({ id, embedded = false, initialTab }: { id: string; embedded?: boolean; initialTab?: string }) {
  const { data: session } = useSession();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  // Per-student journal progress, reported by the journal panel.
  const [journalByStudent, setJournalByStudent] = useState<Map<string, { closed: number; reviewed: number; total: number }>>(new Map());
  const [journalAwaiting, setJournalAwaiting] = useState(0);
  const [marks, setMarks] = useState<MarkSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [marksLoaded, setMarksLoaded] = useState(false);
  // Per-student scores for components without a rubric screen (journal, peer, poster, ...):
  // component -> studentAccountId -> typed value.
  const [numericMarks, setNumericMarks] = useState<Record<string, Record<string, string>>>({});
  // What the server has, to show which cards have unsaved changes.
  const [savedNumericMarks, setSavedNumericMarks] = useState<Record<string, Record<string, string>>>({});
  // Components just submitted - their fresh server values replace the local ones on refresh.
  const justSaved = useRef<Set<string>>(new Set());

  // What the server kept, and - by name - any mark it refused and why.
  const reportSaved = (data: { saved: number; rejected?: Array<{ studentAccountId: string; reason: string }> }) => {
    const rejected = data.rejected || [];
    if (data.saved) toast.success(`Saved ${data.saved} mark${data.saved === 1 ? '' : 's'}`);
    if (rejected.length) {
      const nameOf = (sid: string) => {
        const m = group?.members.find((x) => (typeof x.studentAccountId === 'object' ? x.studentAccountId._id : x.studentAccountId) === sid);
        return m ? (typeof m.studentAccountId === 'object' ? m.studentAccountId.name : m.studentIdText) : 'A student';
      };
      toast.error(`Not saved: ${rejected.map((r) => `${nameOf(r.studentAccountId)} (${r.reason})`).join('; ')}`, { duration: 10000 });
    } else if (!data.saved) {
      toast.info('Nothing to save');
    }
  };
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
  const [chosenEvaluators, setChosenEvaluators] = useState<{ presentation: string[]; report: string[]; poster: string[] }>({
    presentation: [],
    report: [],
    poster: [],
  });
  const [savingChosen, setSavingChosen] = useState(false);
  const [chosenAggregate, setChosenAggregate] = useState<{ presentation: 'mean' | 'max'; report: 'mean' | 'max'; poster: 'mean' | 'max' }>({
    presentation: 'mean',
    report: 'mean',
    poster: 'mean',
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
  // Bumped when marks change here, so step 2 reloads the evaluators' marks.
  const [choiceKey, setChoiceKey] = useState(0);
  // Export
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  // Active tab mirrored in the URL (?tab=report), so links, refresh and search land on it.
  const [tab, setTab] = useState(initialTab || 'journal');
  useEffect(() => {
    if (embedded) return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('tab');
    if (requested) setTab(requested);
    // ?student=<studentAccountId> (from the global search) opens that student's details.
    const student = params.get('student');
    if (student) setOpenStudentId(student);
  }, [embedded]);
  const changeTab = (next: string) => {
    setTab(next);
    if (embedded) return;
    const url = new URL(window.location.href);
    if (next === 'journal') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
  };

  const myId = session?.user?.id;
  const myRoles: string[] = (session?.user as any)?.roles || [];
  const isAdmin = myRoles.includes('admin');
  const isCoordinator = myRoles.includes('coordinator');
  // The server's answer once the group is loaded (a coordinator of another department doesn't
  // manage this group); the roles only until then.
  const canManage = group?.canManage ?? (isAdmin || isCoordinator);
  const canChooseEvaluators = !!group?.canChooseEvaluators;

  const isSupervisor = group
    ? String(typeof group.supervisorId === 'object' ? group.supervisorId._id : group.supervisorId) === myId
    : false;

  const isEvaluator = group
    ? group.evaluators.some(
        (e) => !e.unassignedAt && String(typeof e.evaluatorId === 'object' ? e.evaluatorId._id : e.evaluatorId) === myId
      )
    : false;

  // The journal tab loads its own data; start that request now, in parallel with the page's
  // own, rather than after the page has rendered.
  const [journalPrefetch] = useState(() =>
    typeof window === 'undefined'
      ? null
      : fetch(`/api/capstone/groups/${id}/journal`).then(async (r) => (r.ok ? r.json() : null)).catch(() => null)
  );

  // Only the first load shows the full-page spinner; refreshes after an action (saving
  // marks, a review) update in place.
  // The group and this grader's marks load independently: the page appears as soon as the
  // group does, and only the marking tabs wait for the marks.
  const applyGroup = (groupData: GroupDetail) => {
    setGroup(groupData);
    setReportUrl(groupData.reportUrl || '');
    setChosenEvaluators({
      presentation: groupData.chosenEvaluators?.presentation?.map(String) || [],
      report: groupData.chosenEvaluators?.report?.map(String) || [],
      poster: groupData.chosenEvaluators?.poster?.map(String) || [],
    });
    setChosenAggregate({
      presentation: groupData.chosenAggregate?.presentation === 'max' ? 'max' : 'mean',
      report: groupData.chosenAggregate?.report === 'max' ? 'max' : 'mean',
      poster: groupData.chosenAggregate?.poster === 'max' ? 'max' : 'mean',
    });
  };

  const fetchGroup = async () => {
    try {
      const res = await fetch(`/api/capstone/groups/${id}`);
      const groupData = await res.json();
      if (res.ok && groupData) {
        applyGroup(groupData);
        writePageCache(`capstone-group:${id}`, groupData);
      } else if (res.status === 403 || res.status === 404) {
        // Access removed or group deleted: drop the cached copy shown on first paint.
        clearPageCache(`capstone-group:${id}`);
        clearPageCache(`capstone-journal:${id}`);
        setGroup(null);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load group');
    } finally {
      setLoading(false);
    }
  };

  const fetchMarks = async () => {
    try {
      const res = await fetch(`/api/capstone/groups/${id}/marks`);
      const marksData = await res.json();
      if (!res.ok) return;
      setMarks(marksData);
      const numeric: Record<string, Record<string, string>> = {};
      const rScores: Record<string, number> = {};
      const presScores: Record<string, Record<string, number>> = {};
      // This endpoint returns only the signed-in grader's own marks, so there is no need to
      // filter by submitter (doing so depended on the sign-in session having loaded first).
      for (const m of marksData) {
        if (!RUBRIC_COMPONENTS.includes(m.component)) {
          numeric[m.component] = { ...(numeric[m.component] || {}), [m.studentAccountId]: String(m.rawScore) };
        }
        if (m.component === 'report' && m.rubricScores) Object.assign(rScores, m.rubricScores);
        if (m.component === 'presentation' && m.rubricScores) presScores[m.studentAccountId] = { ...m.rubricScores };
      }
      // Keep unsaved edits on other cards: saving journal marks mustn't wipe peer marks
      // still being entered. A card whose values match what was saved takes the fresh ones.
      setNumericMarks((prev) => {
        const next = { ...numeric };
        for (const [component, vals] of Object.entries(prev)) {
          if (JSON.stringify(vals) !== JSON.stringify(savedNumericMarks[component] || {}) && !justSaved.current.has(component)) {
            next[component] = vals;
          }
        }
        justSaved.current.clear();
        return next;
      });
      setSavedNumericMarks(numeric);
      setReportScores(rScores);
      setPresentationScores(presScores);
    } catch (err) {
      console.error(err);
    } finally {
      setMarksLoaded(true);
    }
  };

  const fetchAll = async () => {
    await Promise.all([fetchGroup(), fetchMarks()]);
  };

  useEffect(() => {
    // Show what this tab last saw of the group straight away, then refresh it.
    const cached = readPageCache<GroupDetail>(`capstone-group:${id}`);
    if (cached) {
      applyGroup(cached);
      setLoading(false);
    }
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);


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
      reportSaved(data);
      justSaved.current.add(component);
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
      if (data.rejected?.length) reportSaved(data);
      else
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
      setChoiceKey((k) => k + 1);
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
      if (data.rejected?.length) reportSaved(data);
      else toast.success(`Saved presentation marks for ${data.saved} student${data.saved === 1 ? '' : 's'}`);
      setChoiceKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save marks');
    } finally {
      setProxySaving(false);
    }
  };

  const saveChosenEvaluators = async (next = chosenEvaluators) => {
    const activeCount = group?.evaluators.filter((e) => !e.unassignedAt).length || 0;
    const minimum = Math.min(2, activeCount);
    const short = (['presentation', 'report'] as const).filter(
      (k) => next[k].length > 0 && next[k].length < minimum
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
        body: JSON.stringify({ chosenEvaluators: next, chosenAggregate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setChosenEvaluators(next);
      toast.success('Chosen evaluators updated');
      fetchAll();
      setChoiceKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingChosen(false);
    }
  };


  // Keep the page frame while loading so the sidebar and header don't flash away.
  if (loading) {
    return (
      <Frame embedded={embedded} title="Capstone Group">
        <div className="mx-auto w-full max-w-5xl animate-pulse space-y-4 p-4 sm:p-6" aria-busy="true" aria-label="Loading group">
          <div className="h-7 w-2/3 rounded-md bg-muted" />
          <div className="h-4 w-1/3 rounded-md bg-muted" />
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-6 w-32 rounded-full bg-muted" />
            ))}
          </div>
          <div className="h-10 w-96 max-w-full rounded-lg bg-muted" />
          <div className="h-28 rounded-xl bg-muted" />
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="h-64 rounded-xl bg-muted" />
            <div className="h-64 rounded-xl bg-muted" />
          </div>
        </div>
      </Frame>
    );
  }
  if (!group) {
    return (
      <Frame embedded={embedded} title="Capstone Group">
        <div className="flex items-center justify-center py-24 text-muted-foreground">Group not found or access denied.</div>
      </Frame>
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
  const sessionPast = isPastSession(group.sessionStatus);
  // Marks can be given only while the session is running (the server enforces this too) - say
  // so up front rather than let people fill in a form that can't be saved.
  const marksOpen = !group.sessionStatus || isRunning(group.sessionStatus);
  const reportCriteria = reportRubric(group.track);
  const reportMax = reportCriteria.length * 3;
  const reportCurrentScore = Object.values(reportScores).reduce((a, b) => a + (b || 0), 0);

  return (
    <Frame
      embedded={embedded}
      title={group.projectTitle || 'Untitled Project'}
      subtitle={embedded ? `Track ${group.track}${group.groupNumber ? ` · Group ${group.groupNumber}` : ''}${group.semesterName ? ` · ${group.semesterName}` : ''}` : `Track ${group.track}`}
      meta={
        embedded ? (
          <>
            {group.sessionStatus && <SessionStatusPill status={group.sessionStatus} />}
            {isSupervisor && <Badge>Supervisor</Badge>}
            {isEvaluator && <Badge variant="secondary">Evaluator</Badge>}
            {canManage && <Badge variant="secondary">Coordinator/Admin</Badge>}
          </>
        ) : undefined
      }
      actions={
        <>
          {(isSupervisor || canManage) && (
            <JournalReminderButton
              groupId={id}
              lastSentAt={group.lastJournalReminderAt}
              onSent={(at) => setGroup((g) => (g ? { ...g, lastJournalReminderAt: at } : g))}
            />
          )}
          {embedded ? (
            <Tip label="Open this group as its own page">
              <Button asChild variant="outline" size="sm">
                <Link href={`/capstone/groups/${id}${tab === 'journal' ? '' : `?tab=${tab}`}`}>
                  <ExternalLink className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Full page</span>
                </Link>
              </Button>
            </Tip>
          ) : (
            <Tip label="Back to My Groups">
              <Button asChild variant="outline" size="sm">
                <Link href="/capstone">
                  <ArrowLeft className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Back</span>
                </Link>
              </Button>
            </Tip>
          )}
        </>
      }
    >
      <div className={embedded ? 'w-full min-w-0 px-4 py-4 sm:px-6' : 'mx-auto max-w-4xl p-4 pt-8'}>
        {/* A finished semester, or one past marking, says so before anything else. */}
        {sessionPast ? (
          <div className="mb-4 flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
            <Archive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Past semester{group.semesterName ? ` · ${group.semesterName}` : ''}</p>
              <p className="text-muted-foreground">This semester is finished. Everything is kept for reference and is read-only.</p>
            </div>
          </div>
        ) : !marksOpen && group.sessionStatus ? (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              This session is still being set up - marks can be entered once the coordinator opens it.
            </p>
          </div>
        ) : null}

        {/* Group info (in the modal it sits in the header) */}
        <div className={embedded ? 'hidden' : 'flex flex-wrap gap-2 mb-4'}>
          <Badge variant="outline">Track {group.track}</Badge>
          {group.sessionStatus && <SessionStatusPill status={group.sessionStatus} />}
          {isSupervisor && <Badge>Supervisor</Badge>}
          {isEvaluator && <Badge variant="secondary">Evaluator</Badge>}
          {canManage && <Badge variant="secondary">Coordinator/Admin</Badge>}
        </div>

        {/* Students - one compact row; click a name for their marks, grade and journal. */}
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Students
          </span>
          {activeMembers.map((m) => {
            const name = memberName(m).replace(/\s*\(\d+\)\s*$/, '');
            return (
              <Tip key={memberId(m)} label={`${m.studentIdText} - open ${name.split(' ')[0]}'s details (marks, grade, journal)`}>
                <button
                  type="button"
                  onClick={() => setOpenStudentId(memberId(m))}
                  className="flex max-w-full items-center gap-1.5 rounded-full border bg-card py-0.5 pr-2.5 pl-0.5 text-xs transition-colors hover:bg-muted"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
                    {name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0]?.toUpperCase())
                      .join('')}
                  </span>
                  <span className="truncate font-medium">{name}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              </Tip>
            );
          })}
        </div>
        {/* Loaded on first open - most visits never open it. */}
        {openStudentId && (
          <StudentDetailDialog
            groupId={openStudentId ? id : null}
            studentAccountId={openStudentId}
            onClose={() => setOpenStudentId(null)}
            onUpdated={() => fetchAll()}
            showJournalLink={false}
          />
        )}

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
            <TabsTrigger value="journal" className="gap-1.5">
              Weekly Journal
              {(isSupervisor || canManage) && journalAwaiting > 0 && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white"
                  aria-label={`${journalAwaiting} waiting for review`}
                  title={`${journalAwaiting} waiting for review`}
                >
                  {journalAwaiting}
                </span>
              )}
            </TabsTrigger>
            {numericTasks.length > 0 && (
              <TabsTrigger value="supervisor-marks">{isSupervisor ? 'Supervisor Marks' : 'Marks'}</TabsTrigger>
            )}
            {hasTask('report') && <TabsTrigger value="report">Report</TabsTrigger>}
            {hasTask('presentation') && <TabsTrigger value="presentation">Presentation</TabsTrigger>}
            {canManage && <TabsTrigger value="manage">Manage</TabsTrigger>}
          </TabsList>

          {/* ── Journal Tab ── */}
          <TabsContent value="journal" className="space-y-4 mt-4">
            <JournalReviewPanel
              groupId={id}
              canReview={isSupervisor || canManage}
              initialData={journalPrefetch}
              onStatus={(status) => {
                setJournalAwaiting(status?.awaitingReview || 0);
                setJournalByStudent(
                  new Map((status?.members || []).map((m) => [m.studentAccountId, { closed: m.reviewed + m.missed, reviewed: m.reviewed, total: status!.weekCount }]))
                );
              }}
              onGoToMarks={numericTasks.length > 0 ? () => changeTab('supervisor-marks') : undefined}
            />
          </TabsContent>

          {/* ── Per-student marks the scheme asks this grader for (journal, peer, poster, ...) ── */}
          {numericTasks.length > 0 && (
            <TabsContent value="supervisor-marks" className="space-y-4 mt-4">
              {!marksLoaded ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (<>
              {numericTasks.map(({ component, max }) => {
                const info = COMPONENT_INFO[component] || { label: component, description: '' };
                const values = numericMarks[component] || {};
                const saved = savedNumericMarks[component] || {};
                const dirty = activeMembers.some((m) => (values[memberId(m)] ?? '') !== (saved[memberId(m)] ?? ''));
                const entered = activeMembers.filter((m) => (values[memberId(m)] ?? '') !== '').length;
                return (
                  <Card key={component}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">
                            {info.label} <span className="font-normal text-muted-foreground">out of {max}</span>
                          </CardTitle>
                          {info.description && <CardDescription>{info.description}</CardDescription>}
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${dirty ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground'}`}>
                          {dirty ? 'Unsaved changes' : `${entered}/${activeMembers.length} entered`}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {activeMembers.map((member) => {
                        const sid = memberId(member);
                        const typed = values[sid] ?? '';
                        const journal = component === 'weeklyJournal' ? journalByStudent.get(sid) : undefined;
                        // A starting point, not a rule: the share of weeks reviewed (missed weeks count as 0).
                        const suggested = journal && journal.total ? Math.round((journal.reviewed / journal.total) * max * 2) / 2 : null;
                        return (
                          <div key={sid} className="flex flex-col gap-2 rounded-lg px-2 py-2.5 hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <Label id={`mark-${component}-${sid}`} className="block truncate text-sm font-medium">
                                {memberName(member)}
                              </Label>
                              {journal && suggested !== null && (
                                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                  {journal.reviewed}/{journal.total} weeks reviewed · suggested {suggested}
                                  {typed !== String(suggested) && (
                                    <button
                                      type="button"
                                      onClick={() => setNumericMarks((prev) => ({ ...prev, [component]: { ...(prev[component] || {}), [sid]: String(suggested) } }))}
                                      className="font-medium text-primary hover:underline"
                                    >
                                      Use
                                    </button>
                                  )}
                                </span>
                              )}
                            </div>
                            <MarkPicker
                              id={`mark-${component}-${sid}`}
                              value={typed}
                              max={max}
                              onChange={(v) => setNumericMarks((prev) => ({ ...prev, [component]: { ...(prev[component] || {}), [sid]: v } }))}
                            />
                          </div>
                        );
                      })}
                      <div className="flex justify-end pt-3">
                        <Tip label={`Save each student's own ${info.label.toLowerCase()} (0-${max}). You can change them while the session is open.`}>
                          <Button onClick={() => submitFinalMarks(component)} disabled={savingMarks || !dirty || !marksOpen} size="lg">
                            {savingMarks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : !marksOpen ? <Lock className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            {!marksOpen ? 'Marking closed' : dirty ? `Save ${info.label}s` : 'Saved'}
                          </Button>
                        </Tip>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </>)}
            </TabsContent>
          )}

          {/* ── Report Tab ── */}
          {hasTask('report') && (
            <TabsContent value="report" className="space-y-4 mt-4">
              {!marksLoaded ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (<>
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
                    <Button onClick={() => submitRubricMarks('report')} disabled={savingMarks || !marksOpen} size="sm" className="mt-2" title={marksOpen ? undefined : 'Marking has closed for this session'}>
                      {savingMarks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Submit Report Marks ({reportCurrentScore}/{reportMax})
                    </Button>
                  </Tip>
                </CardContent>
              </Card>
            </>)}
            </TabsContent>
          )}

          {/* ── Presentation Tab ── */}
          {hasTask('presentation') && (
            <TabsContent value="presentation" className="space-y-4 mt-4">
              {!marksLoaded ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (<>
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
                    <Button onClick={() => submitRubricMarks('presentation')} disabled={savingMarks || !marksOpen} size="sm" className="mt-2" title={marksOpen ? undefined : 'Marking has closed for this session'}>
                      {savingMarks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Submit Presentation Marks
                    </Button>
                  </Tip>
                </CardContent>
              </Card>
            </>)}
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
                    Step 1 · Enter presentation marks from paper sheets
                  </CardTitle>
                  <CardDescription>
                    Copy each evaluator&apos;s (and the supervisor&apos;s) printed marking sheet in. The marks are saved as
                    theirs - exactly as if they had entered them - and recorded as entered by you. Then choose in step 2
                    whose marks count.
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
                    // Mirrors countedEvaluators: the coordinator's choice, or every evaluator when none is made.
                    const countsFor = (graderId: string, role: string) =>
                      role === 'Supervisor'
                        ? true
                        : chosenEvaluators.presentation.length > 0
                          ? chosenEvaluators.presentation.includes(graderId)
                          : true;
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
                            <optgroup label="Counted toward the grade">
                              {graders.filter((g) => countsFor(g.id, g.role)).map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name} ({g.role})
                                </option>
                              ))}
                            </optgroup>
                            {graders.some((g) => !countsFor(g.id, g.role)) && (
                              <optgroup label="Not counted">
                                {graders.filter((g) => !countsFor(g.id, g.role)).map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.name} ({g.role})
                                  </option>
                                ))}
                              </optgroup>
                            )}
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
                                <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                                  <span className="min-w-0 flex-1">
                                    This evaluator isn&apos;t counted for the presentation grade right now - the marks are recorded but won&apos;t count
                                    {canChooseEvaluators ? '.' : ' unless another coordinator counts them.'}
                                  </span>
                                  {canChooseEvaluators && <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7"
                                    disabled={savingChosen}
                                    onClick={() => saveChosenEvaluators({ ...chosenEvaluators, presentation: [...chosenEvaluators.presentation, g.id] })}
                                  >
                                    Count them
                                  </Button>}
                                </div>
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
                    Step 2 · Choose which evaluators count
                  </CardTitle>
                  <CardDescription>
                    Once the marks are in, decide how the evaluators&apos; marks count - all of them, each
                    student&apos;s top K, or the evaluators you pick - separately for presentation and report.
                    Every student&apos;s grade is previewed before you save. Marks that don&apos;t count are still kept.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {!canChooseEvaluators ? (
                    // Someone who grades this group never picks whose marks count - read-only here.
                    <div className="space-y-3">
                      <p className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        You {isSupervisor ? 'supervise' : 'evaluate'} this group, so another coordinator chooses whose marks count.
                      </p>
                      {CHOOSABLE_COMPONENTS.filter(({ key }) => plan.evaluator.some((t) => t.component === key)).map(({ key, label }) => {
                        const selected = chosenEvaluators[key];
                        const counted = activeEvaluators.filter((ev) => {
                          const evId = typeof ev.evaluatorId === 'object' ? ev.evaluatorId._id : String(ev.evaluatorId);
                          return selected.length === 0 || selected.includes(evId);
                        });
                        return (
                          <div key={key} className="flex flex-wrap items-center gap-1.5 text-sm">
                            <span className="w-28 shrink-0 font-medium">{label}</span>
                            {counted.length === 0 ? (
                              <span className="text-muted-foreground">No evaluators</span>
                            ) : (
                              counted.map((ev) => (
                                <Badge key={typeof ev.evaluatorId === 'object' ? ev.evaluatorId._id : String(ev.evaluatorId)} variant="secondary">
                                  {typeof ev.evaluatorId === 'object' ? ev.evaluatorId.name : String(ev.evaluatorId)}
                                </Badge>
                              ))
                            )}
                            <span className="text-xs text-muted-foreground">
                              {group.evaluatorTopK?.[key]
                                ? `· each student's top ${group.evaluatorTopK[key]}, averaged`
                                : selected.length === 0
                                  ? '· all count'
                                  : `· ${chosenAggregate[key] === 'max' ? 'best' : 'average'}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EvaluatorChoicePanel key={choiceKey} groupId={id} onSaved={fetchAll} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Frame>
  );
}
