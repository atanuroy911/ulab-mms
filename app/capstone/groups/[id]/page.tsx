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
import { toast } from 'sonner';

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

// Rubric criterion for presentation (5 criteria, 0/3/6/9 scale)
const PRESENTATION_CRITERIA = [
  'Presentation Skills (Eye contact, Language, Visual aid)',
  'Organization of Presentation Material',
  'Contents',
  'Question & Answer',
  'Time Management',
];

// Report criteria by track
const REPORT_CRITERIA: Record<string, string[]> = {
  A: [
    'Abstract', 'Background Literature [CO1]', 'Problem Statement [CO1]',
    'Objective & Significance [CO1]', 'Scope & Limitation [CO1]', 'Tools [CO1]',
    'Literature Review & Analysis [CO2]', 'Requirements, Task Distribution & Budgets [CO3]',
    'Conclusion', 'References & Citations', 'Communication (Spelling, Grammar, Punctuation, Plagiarism)',
  ],
  B: [
    'Abstract, Background, Problem Statement, Objective, Scope',
    'Literature Review [CO1]', 'Performance Evaluation Criterion [CO1]',
    'Literature Analysis [CO2]', 'Project Management & Financial Activity [CO3]',
    'Usage of Modern Tools [CO4]', 'Design the Solution [CO5]',
    'Implement the Solution [CO6]', 'Investigate Experimental Result [CO6]',
    'Societal, Health, Safety, Legal & Cultural Aspects [CO7]',
    'Environment & Sustainability [CO8]', 'Ethical & Professional Principles [CO9]',
    'Conclusion', 'References, Spelling, Grammar, Punctuation & Plagiarism',
  ],
  C: [], // same as B
};
REPORT_CRITERIA.C = REPORT_CRITERIA.B;

const REPORT_MAX: Record<string, number> = { A: 33, B: 42, C: 42 };

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
  const [presentationScores, setPresentationScores] = useState<Record<string, number>>({});
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
        const presScores: Record<string, number> = {};
        for (const m of marksData) {
          if (m.component === 'weeklyJournal') jMarks[m.studentAccountId] = String(m.rawScore);
          if (m.component === 'peer') pMarks[m.studentAccountId] = String(m.rawScore);
          if (m.component === 'report' && m.submitterId === myId) {
            if (m.rubricScores) Object.assign(rScores, m.rubricScores);
          }
          if (m.component === 'presentation' && m.submitterId === myId) {
            if (m.rubricScores) Object.assign(presScores, m.rubricScores);
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
    const scores = component === 'report' ? reportScores : presentationScores;
    const criteria = component === 'report' ? REPORT_CRITERIA[group.track] : PRESENTATION_CRITERIA;
    const max = component === 'report' ? REPORT_MAX[group.track] : 45;
    const rawScore = Object.values(scores).reduce((a, b) => a + (b || 0), 0);

    // Report is group-wise — one submission per group; use all active members as targets
    const activeMembers = group.members.filter((m) => !m.removedAt);
    if (activeMembers.length === 0) { toast.error('No active members in this group'); return; }

    setSavingMarks(true);
    try {
      // Submit same rubric score for each active member (report is group-level)
      const marksPayload = activeMembers.map((m) => {
        const sid = typeof m.studentAccountId === 'object' ? m.studentAccountId._id : m.studentAccountId;
        return { studentAccountId: sid, rawScore, rubricScores: scores };
      });
      const res = await fetch(`/api/capstone/groups/${id}/marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component, marks: marksPayload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save marks');
      toast.success(`${component === 'report' ? 'Report' : 'Presentation'} marks saved (${rawScore}/${max})`);
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

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!group) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Group not found or access denied.</div>;

  const activeMembers = group.members.filter((m) => !m.removedAt);
  const activeEvaluators = group.evaluators.filter((e) => !e.unassignedAt);
  const reportCriteria = REPORT_CRITERIA[group.track] || REPORT_CRITERIA.B;
  const reportMax = REPORT_MAX[group.track] || 42;
  const reportCurrentScore = Object.values(reportScores).reduce((a, b) => a + (b || 0), 0);
  const presCurrentScore = Object.values(presentationScores).reduce((a, b) => a + (b || 0), 0);

  return (
    <TeacherShell
      title={group.projectTitle || 'Untitled Project'}
      subtitle={`Track ${group.track}`}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/capstone">
            <ArrowLeft className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Back</span>
          </Link>
        </Button>
      }
    >
      <div className="mx-auto max-w-4xl p-4 pt-8">
        {/* Group info */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Badge variant="outline">Track {group.track}</Badge>
          {isSupervisor && <Badge>Supervisor</Badge>}
          {isEvaluator && <Badge variant="secondary">Evaluator</Badge>}
          {canManage && <Badge variant="secondary">Coordinator/Admin</Badge>}
          {activeMembers.map((m) => (
            <Badge key={typeof m.studentAccountId === 'object' ? m.studentAccountId._id : m.studentIdText} variant="outline">
              {typeof m.studentAccountId === 'object' ? m.studentAccountId.name : m.studentIdText}
            </Badge>
          ))}
        </div>

        <Tabs defaultValue="journal">
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
              <Button variant="outline" size="sm" onClick={exportJournal} disabled={exportingJournal}>
                {exportingJournal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="ml-1.5">Export CSV</span>
              </Button>
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
                  <Button onClick={() => submitFinalMarks('weeklyJournal')} disabled={savingMarks} size="sm">
                    {savingMarks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Journal Marks
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Peer Mark (0–5)</CardTitle>
                  <CardDescription>Contribution to the group, as assessed by the supervisor.</CardDescription>
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
                  <Button onClick={() => submitFinalMarks('peer')} disabled={savingMarks} size="sm">
                    {savingMarks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Peer Marks
                  </Button>
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
                      <Button size="sm" onClick={saveReportUrl} disabled={savingReportUrl}>
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
                    <div key={idx} className="flex items-center justify-between gap-3">
                      <Label className="flex-1 text-sm">{idx + 1}. {criterion}</Label>
                      <div className="flex gap-1.5 shrink-0">
                        {[0, 1, 2, 3].map((score) => (
                          <button
                            key={score}
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
                  <Button onClick={() => submitRubricMarks('report')} disabled={savingMarks} size="sm" className="mt-2">
                    {savingMarks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Submit Report Marks ({reportCurrentScore}/{reportMax})
                  </Button>
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
                    Score each criterion 0/3/6/9. Max: 45.
                    Current total: <strong>{presCurrentScore}/45</strong>
                    &nbsp;— group-level mark applied to all members.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {PRESENTATION_CRITERIA.map((criterion, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-3">
                      <Label className="flex-1 text-sm">{idx + 1}. {criterion}</Label>
                      <div className="flex gap-1.5 shrink-0">
                        {[0, 3, 6, 9].map((score) => (
                          <button
                            key={score}
                            onClick={() => setPresentationScores((prev) => ({ ...prev, [`c${idx}`]: score }))}
                            className={`h-8 w-8 rounded-md border text-sm font-medium transition-colors ${
                              presentationScores[`c${idx}`] === score
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
                  <Button onClick={() => submitRubricMarks('presentation')} disabled={savingMarks} size="sm" className="mt-2">
                    {savingMarks ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Submit Presentation Marks ({presCurrentScore}/45)
                  </Button>
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

                      <Button size="sm" onClick={saveChosenEvaluators} disabled={savingChosen}>
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
