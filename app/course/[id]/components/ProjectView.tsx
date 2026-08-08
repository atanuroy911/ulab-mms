'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2, QrCode, RefreshCw, Trash2, Copy, Check, Users, ExternalLink, Save, Settings, Plus, ClipboardList, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { calculateProjectMark } from '@/app/utils/projectRubric';
import type { IRubricScores } from '@/app/utils/projectRubric';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StudentInfo {
  _id: string;
  name: string;
  studentId: string;
  withdrawn?: boolean;
}

interface GroupEntry {
  _id: string;
  groupNumber: number;
  projectTitle: string;
  studentIds: StudentInfo[];
  examRubricScores: { examId: string; scores: IRubricScores; markMode: 'rubric' | 'direct'; reasoning?: string; directMark?: number | null }[];
  markedAt?: string | null;
}

interface ProjectState {
  courseId?: string;
  isActive: boolean;
  maxMembersPerGroup: number;
  groups: GroupEntry[];
}

interface ProjectExam {
  _id: string;
  displayName: string;
  totalMarks: number;
  examCategory?: string;
  examType?: string;
  rubricTemplateId?: string;
}

interface RubricCriterion {
  key: 'c1' | 'c2' | 'c3' | 'c4' | 'c5';
  label: string;
  co?: string;
  descriptions: string[];
}

interface RubricTemplate {
  _id: string;
  name: string;
  slug: string;
  criteria: RubricCriterion[];
}

interface ProjectViewProps {
  courseId: string;
  students: StudentInfo[];
  exams: ProjectExam[];
  examFilter?: (e: ProjectExam) => boolean;
  title?: string;
  description?: string;
  courseType?: 'Theory' | 'Lab';
  defaultProjectWeightage?: number;
  /** Called after a section (Project exam) is created or its rubric is changed, so the parent can refresh its exam list. */
  onExamsChanged?: () => void | Promise<void>;
}

// null means "not yet selected" — different from 0 which means deliberately scored 0
type RubricDraft = { c1: number | null; c2: number | null; c3: number | null; c4: number | null; c5: number | null };
const EMPTY_RUBRIC: IRubricScores = { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 };
const EMPTY_DRAFT: RubricDraft = { c1: null, c2: null, c3: null, c4: null, c5: null };

// Convert draft (may have nulls) to saveable IRubricScores (nulls → 0)
function draftToScores(d: RubricDraft): IRubricScores {
  return { c1: d.c1 ?? 0, c2: d.c2 ?? 0, c3: d.c3 ?? 0, c4: d.c4 ?? 0, c5: d.c5 ?? 0 };
}

function buildProjectUrl(courseId: string) {
  if (typeof window === 'undefined') return `/project/${courseId}`;
  return `${window.location.origin}/project/${courseId}`;
}

// Given rubric scores for one exam, return { scores, markMode } or undefined
function getExamRubric(group: GroupEntry, examId: string) {
  return group.examRubricScores?.find(e => e.examId?.toString() === examId?.toString());
}


// ─── Detailed rubric inline display ──────────────────────────────────────────
function RubricDetail({ scores, criteria }: { scores: IRubricScores; criteria: RubricCriterion[] }) {
  const shortLabels: Record<string, string> = Object.fromEntries(
    criteria.map(c => [c.key, c.label.split(' ').slice(0, 2).join(' ')])
  );

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {criteria.map(c => {
        const v = scores[c.key] ?? 0;
        const barColor =
          v === 3 ? 'bg-green-500'
          : v === 2 ? 'bg-blue-500'
          : v === 1 ? 'bg-amber-500'
          : 'bg-muted-foreground/30';
        const textColor =
          v === 3 ? 'text-green-700 dark:text-green-300'
          : v === 2 ? 'text-blue-700 dark:text-blue-300'
          : v === 1 ? 'text-amber-700 dark:text-amber-300'
          : 'text-muted-foreground';
        return (
          <div key={c.key} className="flex items-center gap-1.5" title={c.label}>
            <span className="text-xs font-medium text-muted-foreground flex items-center">
              {c.key.toUpperCase()}
              <span className="hidden sm:inline-block ml-1 opacity-70 font-normal">({shortLabels[c.key]})</span>
            </span>
            <div className="flex gap-0.5 items-center mx-1">
              {[0, 1, 2, 3].map(pip => (
                <div
                  key={pip}
                  className={`w-3 h-2.5 rounded-sm transition-colors ${
                    pip <= v ? barColor : 'bg-muted/50 border border-border'
                  }`}
                />
              ))}
            </div>
            <span className={`text-xs font-bold ${textColor}`}>{v}/3</span>
          </div>
        );
      })}
    </div>
  );
}



// ─── Main component ───────────────────────────────────────────────────────────
export default function ProjectView({ courseId, students, exams, examFilter, title, description, courseType, defaultProjectWeightage, onExamsChanged }: ProjectViewProps) {
  const [state, setState] = useState<ProjectState>({ isActive: false, maxMembersPerGroup: 4, groups: [] });
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [maxInput, setMaxInput] = useState('4');
  const [showStartDialog, setShowStartDialog] = useState(false);

  // Per-group title editing
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');

  // Group delete
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  // Which rubric dialog is open: { groupId, examId } | null
  const [editingRubric, setEditingRubric] = useState<{ groupId: string; examId: string } | null>(null);
  // Draft rubric being edited in the dialog (null = not selected by user yet)
  const [rubricDraft, setRubricDraft] = useState<RubricDraft>(EMPTY_DRAFT);
  const [reasoningDraft, setReasoningDraft] = useState<string>('');

  // Saving state per group
  const [savingMarks, setSavingMarks] = useState<Record<string, boolean>>({});

  // Saved marks (from Mark records): { [groupId]: { [examId]: number } }
  const [savedMarks, setSavedMarks] = useState<Record<string, Record<string, number>>>({});

  // Rubric templates, keyed by _id — drives which criteria to show per exam (or none = direct marks)
  const [rubricTemplates, setRubricTemplates] = useState<Record<string, RubricTemplate>>({});

  // Direct-mark drafts for exams with no rubric assigned: { [groupId]: { [examId]: string } }
  const [directMarkDrafts, setDirectMarkDrafts] = useState<Record<string, Record<string, string>>>({});
  const [savingDirectMark, setSavingDirectMark] = useState<Record<string, boolean>>({});
  // Which direct-mark modal is open: { groupId, examId } | null
  const [editingDirectMark, setEditingDirectMark] = useState<{ groupId: string; examId: string } | null>(null);

  const projectExams = examFilter ? exams.filter(examFilter) : exams.filter(e => e.examCategory === 'Project');

  const getRubricTemplate = useCallback((exam: ProjectExam): RubricTemplate | null => {
    if (!exam.rubricTemplateId) return null;
    return rubricTemplates[exam.rubricTemplateId] || null;
  }, [rubricTemplates]);

  // ─── Sections manager (create Project exams / assign rubrics, right from this tab) ──
  const sectionLabel = courseType === 'Lab' ? 'OEL / CE section' : 'project section';
  const [showSectionsManager, setShowSectionsManager] = useState(false);
  const [hasPromptedThisSession, setHasPromptedThisSession] = useState(false);

  // Which exam's rubric is being configured (opens the rubric-picker dialog)
  const [configuringExamId, setConfiguringExamId] = useState<string | null>(null);
  const [configuringRubricChoice, setConfiguringRubricChoice] = useState<string>(''); // '' = no rubric
  const [savingRubricChoice, setSavingRubricChoice] = useState(false);

  // Add-section form
  const [showAddSection, setShowAddSection] = useState(false);
  const [addSectionForm, setAddSectionForm] = useState({ displayName: '', totalMarks: '100', rubricTemplateId: '' });
  const [savingSection, setSavingSection] = useState(false);

  const handleOpenConfigureRubric = (exam: ProjectExam) => {
    setConfiguringRubricChoice(exam.rubricTemplateId || '');
    setConfiguringExamId(exam._id);
  };

  const handleSaveRubricChoice = async () => {
    if (!configuringExamId) return;
    setSavingRubricChoice(true);
    try {
      const res = await fetch(`/api/exams/${configuringExamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rubricTemplateId: configuringRubricChoice || null }),
      });
      if (res.ok) {
        toast.success('Rubric updated for this section');
        setConfiguringExamId(null);
        await onExamsChanged?.();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to update rubric');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSavingRubricChoice(false);
    }
  };

  const handleCreateSection = async () => {
    if (!addSectionForm.displayName.trim()) { toast.error('Enter a section name'); return; }
    const totalMarks = parseFloat(addSectionForm.totalMarks);
    if (!totalMarks || totalMarks <= 0) { toast.error('Enter valid total marks'); return; }

    setSavingSection(true);
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          displayName: addSectionForm.displayName.trim(),
          totalMarks,
          weightage: defaultProjectWeightage ?? 25,
          examCategory: 'Project',
          rubricTemplateId: addSectionForm.rubricTemplateId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`"${data.exam.displayName}" added`);
        setShowAddSection(false);
        setAddSectionForm({ displayName: '', totalMarks: '100', rubricTemplateId: '' });
        await onExamsChanged?.();
      } else {
        toast.error(data.error || 'Failed to create section');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSavingSection(false);
    }
  };

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const fetchRubricTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/rubrics');
      if (res.ok) {
        const data: RubricTemplate[] = await res.json();
        setRubricTemplates(Object.fromEntries(data.map(r => [r._id, r])));
      }
    } catch { /* silent */ }
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/courses/${courseId}/project`);
      const data = await res.json();
      if (res.ok) {
        setState(data);
        setMaxInput(String(data.maxMembersPerGroup ?? 4));
      }
    } catch {
      toast.error('Failed to load project data');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  const fetchSavedMarks = useCallback(async () => {
    try {
      const res = await fetch(`/api/courses/${courseId}/project/group-marks`);
      if (res.ok) {
        const data = await res.json();
        setSavedMarks(data.marks || {});
      }
    } catch { /* silent */ }
  }, [courseId]);

  useEffect(() => { fetchState(); fetchSavedMarks(); fetchRubricTemplates(); }, [fetchState, fetchSavedMarks, fetchRubricTemplates]);

  // Auto-refresh when active
  useEffect(() => {
    if (!state.isActive) return;
    const interval = setInterval(fetchState, 15000);
    return () => clearInterval(interval);
  }, [state.isActive, fetchState]);

  // ─── Session toggle ─────────────────────────────────────────────────────────

  const handleToggle = async () => {
    if (!state.isActive) { setShowStartDialog(true); return; }
    setToggling(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/project`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) { setState(data); toast.success('Project session closed'); }
      else toast.error(data.error || 'Failed to toggle session');
    } finally { setToggling(false); }
  };

  const handleStart = async () => {
    setToggling(true);
    setShowStartDialog(false);
    try {
      const res = await fetch(`/api/courses/${courseId}/project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxMembersPerGroup: parseInt(maxInput) || 4 }),
      });
      const data = await res.json();
      if (res.ok) {
        setState(data);
        toast.success('Project session started!');
        // Walk the teacher through rubric setup (or creating a first section) right away.
        if (!hasPromptedThisSession) {
          setHasPromptedThisSession(true);
          if (projectExams.length > 0) setShowSectionsManager(true);
          else setShowAddSection(true);
        }
      } else {
        toast.error(data.error || 'Failed to start session');
      }
    } finally { setToggling(false); }
  };

  // ─── Group actions ──────────────────────────────────────────────────────────

  const [autoAssigning, setAutoAssigning] = useState(false);

  const handleAutoAssignSolo = async () => {
    setAutoAssigning(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/project/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'autoAssignSolo' }),
      });
      const data = await res.json();
      if (res.ok) {
        setState(data);
        toast.success('Each unassigned student placed into their own group');
      } else {
        toast.error(data.error || 'Failed to auto-assign students');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setAutoAssigning(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (deletingGroupId !== groupId) { setDeletingGroupId(groupId); return; }
    try {
      const res = await fetch(`/api/courses/${courseId}/project/groups`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      });
      const data = await res.json();
      if (res.ok) { setState(data); toast.success('Group removed'); setDeletingGroupId(null); }
      else toast.error(data.error || 'Failed to delete group');
    } catch { toast.error('Network error'); }
  };

  const handleSaveTitle = async (groupId: string) => {
    try {
      const res = await fetch(`/api/courses/${courseId}/project`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, projectTitle: titleDraft }),
      });
      const data = await res.json();
      if (res.ok) { setState(data); setEditingTitle(null); toast.success('Title updated'); }
      else toast.error(data.error || 'Failed to update title');
    } catch { toast.error('Network error'); }
  };

  // ─── Rubric + mode persistence ──────────────────────────────────────────────

  /** Persist rubric scores for a specific group+exam.
   *  Returns the updated ProjectState from the server so we can drive state from DB. */
  const persistExamRubric = useCallback(async (
    groupId: string,
    examId: string,
    scores: IRubricScores,
    reasoning: string
  ): Promise<ProjectState | null> => {
    try {
      const res = await fetch(`/api/courses/${courseId}/project`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, examRubricScores: { examId, scores, markMode: 'rubric', reasoning } }),
      });
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
    return null;
  }, [courseId]);

  /** Open rubric dialog — seed draft from saved scores (null for unset 0s) */
  const handleOpenRubric = (group: GroupEntry, examId: string) => {
    const entry = getExamRubric(group, examId);
    const saved = entry?.scores;
    // If all saved scores are 0 AND entry doesn't exist yet → treat as unset (null)
    const hasBeenScored = saved && (saved.c1 > 0 || saved.c2 > 0 || saved.c3 > 0 || saved.c4 > 0 || saved.c5 > 0);
    setRubricDraft(
      hasBeenScored
        ? { c1: saved!.c1, c2: saved!.c2, c3: saved!.c3, c4: saved!.c4, c5: saved!.c5 }
        : EMPTY_DRAFT
    );
    setReasoningDraft(entry?.reasoning || '');
    setEditingRubric({ groupId: group._id, examId });
  };

  /** Save rubric dialog → persist scores → update state from server response */
  const handleSaveRubric = async () => {
    if (!editingRubric) return;
    const { groupId, examId } = editingRubric;
    const scores = draftToScores(rubricDraft);
    const reasoning = reasoningDraft;

    setEditingRubric(null); // close dialog immediately

    // Persist to DB and drive state from the response (no stale optimistic data)
    const updated = await persistExamRubric(groupId, examId, scores, reasoning);
    if (updated) {
      setState(updated);
      toast.success('Rubric scores saved');
      
      const group = updated.groups.find(g => g._id === groupId);
      if (group) {
        handleSaveGroupMarks(group);
      }
    } else {
      toast.error('Failed to save rubric — please try again');
    }
  };

  /** Save a direct (no-rubric) mark for a group+exam */
  const handleSaveDirectMark = async (group: GroupEntry, exam: ProjectExam) => {
    const draftKey = `${group._id}:${exam._id}`;
    const raw = directMarkDrafts[group._id]?.[exam._id];
    const value = parseFloat(raw ?? '');
    if (raw === undefined || raw === '' || isNaN(value)) {
      toast.error('Enter a valid mark first');
      return;
    }
    if (value < 0 || value > exam.totalMarks) {
      toast.error(`Mark must be between 0 and ${exam.totalMarks}`);
      return;
    }

    setSavingDirectMark(prev => ({ ...prev, [draftKey]: true }));
    try {
      const res = await fetch(`/api/courses/${courseId}/project`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group._id,
          examRubricScores: { examId: exam._id, markMode: 'direct', directMark: value },
        }),
      });
      if (res.ok) {
        const updated: ProjectState = await res.json();
        setState(updated);
        toast.success('Mark saved');
        setEditingDirectMark(null);
        const updatedGroup = updated.groups.find(g => g._id === group._id);
        if (updatedGroup) await handleSaveGroupMarks(updatedGroup);
      } else {
        toast.error('Failed to save mark');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSavingDirectMark(prev => ({ ...prev, [draftKey]: false }));
    }
  };

  // ─── Save marks ─────────────────────────────────────────────────────────────

  const handleSaveGroupMarks = async (group: GroupEntry) => {
    if (group.studentIds.length === 0) { toast.error('No students in this group'); return; }
    setSavingMarks(prev => ({ ...prev, [group._id]: true }));
    try {
      const entries: { examId: string; rawMark: number }[] = [];

      for (const exam of projectExams) {
        const entry = getExamRubric(group, exam._id);
        const template = getRubricTemplate(exam);

        if (!template) {
          // Direct-mark mode: use the saved directMark, skip if not yet entered
          if (entry?.directMark === undefined || entry?.directMark === null) continue;
          entries.push({ examId: exam._id, rawMark: entry.directMark });
          continue;
        }

        const scores = entry?.scores ?? EMPTY_RUBRIC;
        const total = (scores.c1 ?? 0) + (scores.c2 ?? 0) + (scores.c3 ?? 0) + (scores.c4 ?? 0) + (scores.c5 ?? 0);
        if (total === 0) continue; // skip unscored
        const computed = calculateProjectMark(scores, exam.totalMarks);
        entries.push({ examId: exam._id, rawMark: computed });
      }

      if (entries.length === 0) {
        toast.error('No marks to save — score at least one exam first');
        setSavingMarks(prev => ({ ...prev, [group._id]: false }));
        return;
      }

      const res = await fetch(`/api/courses/${courseId}/project/group-marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group._id,
          studentIds: group.studentIds.map(s => s._id),
          marks: entries,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Marks saved for Group ${group.groupNumber}`);
        setSavedMarks(prev => {
          const next = { ...prev, [group._id]: { ...prev[group._id] } };
          for (const e of entries) next[group._id][e.examId] = e.rawMark;
          return next;
        });
      } else {
        toast.error(data.error || 'Failed to save marks');
      }
    } catch { toast.error('Network error'); }
    finally { setSavingMarks(prev => ({ ...prev, [group._id]: false })); }
  };

  // ─── Misc ───────────────────────────────────────────────────────────────────

  const handleUpdateMaxMembers = async () => {
    const val = parseInt(maxInput);
    if (!val || val < 1) { toast.error('Enter a valid number'); return; }
    try {
      const res = await fetch(`/api/courses/${courseId}/project`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxMembersPerGroup: val }),
      });
      const data = await res.json();
      if (res.ok) { setState(data); toast.success('Max members updated'); }
      else toast.error(data.error || 'Failed to update');
    } catch { toast.error('Network error'); }
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(buildProjectUrl(courseId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const projectUrl = buildProjectUrl(courseId);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(projectUrl)}`;
  const assignedIds = new Set(state.groups.flatMap(g => g.studentIds.map(s => s._id)));
  const unassignedStudents = students.filter(s => !s.withdrawn && !assignedIds.has(s._id));

  const activeRubricExam = editingRubric ? projectExams.find(e => e._id === editingRubric.examId) : null;
  const activeRubricGroup = editingRubric ? state.groups.find(g => g._id === editingRubric.groupId) : null;
  const activeRubricTemplate = activeRubricExam ? getRubricTemplate(activeRubricExam) : null;
  const hasPresentationRubricExam = projectExams.some(e => getRubricTemplate(e)?.slug === 'presentation');

  const activeDirectMarkExam = editingDirectMark ? projectExams.find(e => e._id === editingDirectMark.examId) : null;
  const activeDirectMarkGroup = editingDirectMark ? state.groups.find(g => g._id === editingDirectMark.groupId) : null;

  /** Open the direct-mark modal — seed the draft from the saved mark if not already drafted */
  const handleOpenDirectMarkModal = (group: GroupEntry, exam: ProjectExam) => {
    const entry = getExamRubric(group, exam._id);
    setDirectMarkDrafts(prev => ({
      ...prev,
      [group._id]: {
        ...prev[group._id],
        [exam._id]: prev[group._id]?.[exam._id] ?? (entry?.directMark !== undefined && entry?.directMark !== null ? String(entry.directMark) : ''),
      },
    }));
    setEditingDirectMark({ groupId: group._id, examId: exam._id });
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">{title || 'Project Groups'}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {description || 'Score each group\'s project using the rubric. Marks are automatically calculated and pushed to the Marks tab.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { fetchState(); fetchSavedMarks(); }} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSectionsManager(true)}>
            <ClipboardList className="w-4 h-4 mr-2" />Manage Sections
          </Button>
          {state.isActive && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowQr(true)}>
                <QrCode className="w-4 h-4 mr-2" />QR Code
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.open(projectUrl, '_blank')}>
                <ExternalLink className="w-4 h-4 mr-2" />Open URL
              </Button>
            </>
          )}
          <Button
            onClick={handleToggle}
            disabled={toggling}
            className={state.isActive ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-slate-600 hover:bg-slate-700 text-white'}
          >
            {toggling
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <span className={`w-2 h-2 rounded-full mr-2 ${state.isActive ? 'bg-green-300 animate-pulse' : 'bg-slate-400'}`} />}
            {state.isActive ? 'Close Project Session' : 'Start Project Work'}
          </Button>
        </div>
      </div>

      {/* ── Active session banner ── */}
      {state.isActive && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">Session is active — students can register</p>
            <p className="text-xs text-green-600/80 dark:text-green-400/80 mt-0.5 break-all">{projectUrl}</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleCopyUrl} className="border-green-500/40 text-green-700 dark:text-green-300 shrink-0">
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? 'Copied!' : 'Copy URL'}
          </Button>
        </div>
      )}

      {/* ── Settings row ── */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Max members per group:</label>
          <input type="number" min={1} max={20} value={maxInput} onChange={e => setMaxInput(e.target.value)}
            className="w-16 h-8 rounded-md border bg-background px-2 text-sm text-center" />
          <Button size="sm" variant="outline" onClick={handleUpdateMaxMembers}>Update</Button>
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => window.open(`/api/courses/${courseId}/project/export-pdf-simple`, '_blank')}
            className="border-emerald-500/40 hover:bg-emerald-500/10">
            🖨️ Print Simple Grid
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.open(`/api/courses/${courseId}/project/export-pdf-blank`, '_blank')}
            className="border-indigo-500/40 hover:bg-indigo-500/10">
            🖨️ Print Blank Rubrics
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.open(`/api/courses/${courseId}/project/export-pdf`, '_blank')}
            className="border-blue-500/40 hover:bg-blue-500/10">
            📄 Export PDF
          </Button>
          {hasPresentationRubricExam && (
            <Button size="sm" variant="outline" onClick={() => window.open(`/api/courses/${courseId}/project/export-pdf?rubric=presentation`, '_blank')}
              className="border-purple-500/40 hover:bg-purple-500/10">
              📄 Export Presentation Marks
            </Button>
          )}
        </div>
      </div>

      {/* ── No sections yet ── */}
      {projectExams.length === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-amber-700 dark:text-amber-400">
            ⚠️ No {sectionLabel}s yet — add one (e.g. "First Presentation", "Final Presentation", "Project Report") to start marking.
          </span>
          <Button size="sm" onClick={() => setShowAddSection(true)}>
            <Plus className="w-4 h-4 mr-2" />Add Section
          </Button>
        </div>
      )}

      {/* ── Sections needing rubric review ── */}
      {projectExams.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4 inline mr-1.5 -mt-0.5 text-primary" />
            {projectExams.length} {sectionLabel}{projectExams.length > 1 ? 's' : ''} configured — review or change how each one is marked.
          </span>
          <Button size="sm" variant="outline" onClick={() => setShowSectionsManager(true)}>
            <Settings className="w-4 h-4 mr-2" />Review Sections & Rubrics
          </Button>
        </div>
      )}

      {/* ── Groups list ── */}
      {state.groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">No groups yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Start the session and share the QR code or URL — students will create and join groups themselves.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {state.groups.map(group => {
            const groupSaved = savedMarks[group._id] ?? {};
            const allSaved = projectExams.length > 0 && projectExams.every(e => groupSaved[e._id] !== undefined);

            return (
              <div key={group._id} className="rounded-xl border bg-card shadow-sm overflow-hidden">

                {/* ─ Group header bar ─ */}
                <div className="flex items-center gap-3 px-5 py-4 border-b bg-muted/30">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary">
                    {group.groupNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingTitle === group._id ? (
                      <div className="flex items-center gap-2">
                        <input autoFocus type="text" value={titleDraft}
                          onChange={e => setTitleDraft(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSaveTitle(group._id)}
                          className="rounded-md border bg-background px-3 py-1 text-sm w-64" placeholder="Enter project title..." />
                        <Button size="sm" onClick={() => handleSaveTitle(group._id)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingTitle(null)}>✕</Button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingTitle(group._id); setTitleDraft(group.projectTitle || ''); }}
                        className="text-left hover:opacity-70 transition-opacity w-full">
                        <span className="font-semibold truncate block">
                          {group.projectTitle || <span className="text-muted-foreground/50 italic font-normal text-sm">Click to add title...</span>}
                        </span>
                      </button>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{group.studentIds.length}/{state.maxMembersPerGroup} members</span>
                      {allSaved && <Badge className="text-xs bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30">✓ All saved</Badge>}
                    </div>
                  </div>
                  <Button size="sm" variant={deletingGroupId === group._id ? 'destructive' : 'ghost'}
                    onClick={() => handleDeleteGroup(group._id)}>
                    <Trash2 className="w-4 h-4" />
                    {deletingGroupId === group._id ? <span className="ml-1 text-xs">Confirm</span> : null}
                  </Button>
                </div>

                {/* ─ Members ─ */}
                <div className="px-5 py-3 flex flex-wrap gap-2 border-b bg-background">
                  {group.studentIds.length === 0 ? (
                    <span className="text-sm text-muted-foreground/50 italic">No members yet</span>
                  ) : group.studentIds.map(s => (
                    <span key={s._id} className="inline-flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1 text-sm">
                      <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">{s.name.charAt(0)}</span>
                      {s.name} <span className="text-muted-foreground text-xs">({s.studentId})</span>
                    </span>
                  ))}
                </div>

                {/* ─ Section chips — click a section to mark it in its own modal ─ */}
                {projectExams.length > 0 && (
                  <div className="px-5 py-4">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Project Marks</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {projectExams.map(exam => {
                        const entry = getExamRubric(group, exam._id);
                        const template = getRubricTemplate(exam);
                        const savedMark = groupSaved[exam._id];
                        const isScored = template
                          ? !!entry && entry.markMode === 'rubric'
                          : entry?.directMark !== undefined && entry?.directMark !== null;

                        return (
                          <button
                            key={exam._id}
                            onClick={() => template ? handleOpenRubric(group, exam._id) : handleOpenDirectMarkModal(group, exam)}
                            className={`text-left rounded-lg border p-3 transition-all hover:border-primary/50 hover:bg-muted/30 ${
                              isScored ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-muted/10'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold truncate">{exam.displayName}</span>
                              {isScored
                                ? <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />
                                : <span className="text-[10px] text-muted-foreground shrink-0">Not marked</span>}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex items-center justify-between gap-2">
                              <span className="truncate">{template ? template.name : 'Direct mark'} · /{exam.totalMarks}</span>
                              {savedMark !== undefined && (
                                <span className="font-medium text-green-600 dark:text-green-400 shrink-0">{savedMark} pts</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Unassigned students ── */}
      {unassignedStudents.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              ⏳ Unassigned Students <Badge variant="secondary">{unassignedStudents.length}</Badge>
            </h3>
            <Button size="sm" variant="outline" onClick={handleAutoAssignSolo} disabled={autoAssigning}
              className="border-amber-500/40 hover:bg-amber-500/10">
              {autoAssigning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
              Auto-Assign 1 Per Group
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {unassignedStudents.map(s => (
              <span key={s._id} className="inline-flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1 text-sm">
                {s.name} <span className="text-muted-foreground text-xs">({s.studentId})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {unassignedStudents.length === 0 && state.groups.length > 0 && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
          🎉 All students are assigned to groups!
        </div>
      )}

      {/* ─── Rubric dialog ─── */}
      <Dialog open={editingRubric !== null} onOpenChange={open => !open && setEditingRubric(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              Rubric Scoring — Group {activeRubricGroup?.groupNumber}
              {activeRubricExam && (
                <span className="text-sm font-normal text-muted-foreground">
                  · {activeRubricExam.displayName} (out of {activeRubricExam.totalMarks})
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Score each criterion 0–3. The final mark is calculated automatically from these scores.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {(activeRubricTemplate?.criteria ?? []).map(criterion => (
              <div key={criterion.key} className="rounded-xl border p-4 space-y-3">
                <div>
                  <p className="font-semibold text-sm">{criterion.label}</p>
                  <p className="text-xs text-muted-foreground">{criterion.co}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([0, 1, 2, 3] as const).map(score => (
                    <button
                      key={score}
                      onClick={() => setRubricDraft(prev => ({ ...prev, [criterion.key]: score }))}
                      className={`rounded-lg border p-2.5 text-left transition-all ${
                        rubricDraft[criterion.key] === score
                          ? score === 3 ? 'border-green-500 bg-green-500/20 text-green-700 dark:text-green-300'
                            : score === 2 ? 'border-blue-500 bg-blue-500/20 text-blue-700 dark:text-blue-300'
                            : score === 1 ? 'border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300'
                            : 'border-red-500 bg-red-500/20 text-red-700 dark:text-red-300'
                          : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30'
                      }`}
                    >
                      <div className="font-bold text-lg">{score}</div>
                      <div className="text-[10px] mt-1 leading-tight opacity-80">{criterion.descriptions[score]}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {activeRubricExam && (
              <div className="rounded-xl bg-muted/40 border px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Calculated mark:</span>
                <span className="font-bold text-lg">
                  {calculateProjectMark(draftToScores(rubricDraft), activeRubricExam.totalMarks)} / {activeRubricExam.totalMarks}
                </span>
              </div>
            )}
            
            <div className="space-y-1.5 mt-2">
              <label className="text-sm font-medium">Reasoning / Comments</label>
              <textarea
                value={reasoningDraft}
                onChange={e => setReasoningDraft(e.target.value)}
                placeholder="Briefly explain the marks..."
                className="w-full h-20 rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingRubric(null)}>Cancel</Button>
              <Button onClick={handleSaveRubric}>Save Rubric</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Direct mark modal (per section, no rubric assigned) ─── */}
      <Dialog open={editingDirectMark !== null} onOpenChange={open => !open && setEditingDirectMark(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              Enter Mark — Group {activeDirectMarkGroup?.groupNumber}
              {activeDirectMarkExam && (
                <span className="text-sm font-normal text-muted-foreground">
                  · {activeDirectMarkExam.displayName} (out of {activeDirectMarkExam.totalMarks})
                </span>
              )}
            </DialogTitle>
            <DialogDescription>This section has no rubric assigned — enter one mark for the whole group.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <input
              type="number"
              autoFocus
              min={0}
              max={activeDirectMarkExam?.totalMarks}
              step="0.01"
              value={editingDirectMark ? (directMarkDrafts[editingDirectMark.groupId]?.[editingDirectMark.examId] ?? '') : ''}
              onChange={e => editingDirectMark && setDirectMarkDrafts(prev => ({
                ...prev,
                [editingDirectMark.groupId]: { ...prev[editingDirectMark.groupId], [editingDirectMark.examId]: e.target.value },
              }))}
              placeholder={activeDirectMarkExam ? `0 - ${activeDirectMarkExam.totalMarks}` : ''}
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingDirectMark(null)}>Cancel</Button>
              <Button
                onClick={() => activeDirectMarkGroup && activeDirectMarkExam && handleSaveDirectMark(activeDirectMarkGroup, activeDirectMarkExam)}
                disabled={!editingDirectMark || savingDirectMark[`${editingDirectMark.groupId}:${editingDirectMark.examId}`]}
              >
                {editingDirectMark && savingDirectMark[`${editingDirectMark.groupId}:${editingDirectMark.examId}`]
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Save className="w-4 h-4 mr-2" />}
                Save Mark
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── QR dialog ─── */}
      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Project Registration QR Code</DialogTitle>
            <DialogDescription>Students scan this or open the link below to register their group.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <img src={qrImageUrl} alt="Project QR Code" className="rounded-xl border bg-white p-3" />
            <p className="text-xs text-muted-foreground text-center break-all max-w-xs">{projectUrl}</p>
            <Button variant="outline" onClick={handleCopyUrl} className="w-full">
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? 'Copied!' : 'Copy URL'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Start session dialog ─── */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Start Project Session</DialogTitle>
            <DialogDescription>Students will be able to register and join groups using a link or QR code.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Maximum members per group</label>
              <p className="text-xs text-muted-foreground mt-0.5">Students won&apos;t be able to join a full group.</p>
              <input type="number" min={1} max={20} value={maxInput} onChange={e => setMaxInput(e.target.value)}
                className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowStartDialog(false)}>Cancel</Button>
              <Button onClick={handleStart} disabled={toggling}>
                {toggling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Start Session
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Sections manager dialog ─── */}
      <Dialog open={showSectionsManager} onOpenChange={setShowSectionsManager}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Project Sections & Rubrics</DialogTitle>
            <DialogDescription>
              Each {sectionLabel} (e.g. a presentation, demo, or report) can be marked with a rubric (score 0–3
              per criterion, auto-converted to marks) or directly (one manual mark per group). Choose whichever
              fits each section.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {projectExams.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-6 text-center">No sections yet — add your first one below.</p>
            ) : (
              projectExams.map(exam => {
                const template = getRubricTemplate(exam);
                return (
                  <div key={exam._id} className="rounded-xl border p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-semibold text-sm">{exam.displayName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Out of {exam.totalMarks} marks ·{' '}
                        {template ? (
                          <span className="text-primary font-medium">{template.name}</span>
                        ) : (
                          <span className="italic">Direct marks (no rubric)</span>
                        )}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleOpenConfigureRubric(exam)}>
                      <Settings className="w-3.5 h-3.5 mr-1.5" />
                      {template ? 'Change Rubric' : 'Assign Rubric'}
                    </Button>
                  </div>
                );
              })
            )}

            <Button variant="outline" className="w-full" onClick={() => { setShowSectionsManager(false); setShowAddSection(true); }}>
              <Plus className="w-4 h-4 mr-2" />Add Another Section
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Rubric picker dialog (per section) ─── */}
      <Dialog open={configuringExamId !== null} onOpenChange={open => !open && setConfiguringExamId(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Choose Rubric{configuringExamId && (() => {
                const exam = projectExams.find(e => e._id === configuringExamId);
                return exam ? ` — ${exam.displayName}` : '';
              })()}
            </DialogTitle>
            <DialogDescription>
              Pick a rubric to score this section 0–3 per criterion (auto-converted to marks), or choose direct
              marking to enter one mark per group by hand.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <button
              onClick={() => setConfiguringRubricChoice('')}
              className={`w-full text-left rounded-xl border p-4 transition-all ${
                configuringRubricChoice === '' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'
              }`}
            >
              <p className="font-semibold text-sm">No rubric — direct marks</p>
              <p className="text-xs text-muted-foreground mt-1">Enter a single mark per group by hand. Best for quick sections you don't want a rubric for.</p>
            </button>

            {Object.values(rubricTemplates).map(t => (
              <button
                key={t._id}
                onClick={() => setConfiguringRubricChoice(t._id)}
                className={`w-full text-left rounded-xl border p-4 transition-all ${
                  configuringRubricChoice === t._id ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <p className="font-semibold text-sm">{t.name}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.criteria.map(c => (
                    <span key={c.key} className="text-[11px] bg-muted/60 rounded-full px-2 py-0.5 text-muted-foreground">{c.label}</span>
                  ))}
                </div>
              </button>
            ))}

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setConfiguringExamId(null)}>Cancel</Button>
              <Button onClick={handleSaveRubricChoice} disabled={savingRubricChoice}>
                {savingRubricChoice ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Choice
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Add section dialog ─── */}
      <Dialog open={showAddSection} onOpenChange={setShowAddSection}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add {sectionLabel[0].toUpperCase() + sectionLabel.slice(1)}</DialogTitle>
            <DialogDescription>
              Create a new gradable section, e.g. "First Presentation", "Final Presentation", or "Project Report".
              You can optionally assign a rubric now, or add it later from Manage Sections.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Section Name</Label>
              <input
                type="text"
                value={addSectionForm.displayName}
                onChange={e => setAddSectionForm(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="e.g., Final Presentation"
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Total Marks</Label>
              <input
                type="number"
                min={1}
                step="0.01"
                value={addSectionForm.totalMarks}
                onChange={e => setAddSectionForm(prev => ({ ...prev, totalMarks: e.target.value }))}
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rubric (optional)</Label>
              <select
                value={addSectionForm.rubricTemplateId}
                onChange={e => setAddSectionForm(prev => ({ ...prev, rubricTemplateId: e.target.value }))}
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">No rubric (direct marks)</option>
                {Object.values(rubricTemplates).map(t => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Rubric scoring is 0–3 per criterion and is converted to marks automatically. You can change this anytime.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setShowAddSection(false)}>Cancel</Button>
              <Button onClick={handleCreateSection} disabled={savingSection}>
                {savingSection ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Add Section
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
