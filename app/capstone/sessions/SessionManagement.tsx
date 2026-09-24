'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, Plus, GraduationCap, ArrowLeft, Users, Trash2, UserCog, ShieldPlus, ShieldMinus, Printer, ChevronDown, MailPlus, FileText, Link2, ExternalLink, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { TrackSchemePanel } from './TrackSchemePanel';
import { MemberEntry, type MemberRow } from './MemberEntry';
import { SetupChecklist } from './SetupChecklist';
import { DeleteSessionDialog } from './DeleteSessionDialog';
import { InvitePersonForm, PendingInviteNote, type InvitedUser } from './InvitePersonForm';
import { Tip } from '@/app/components/Tip';
import { StudentDetailDialog } from '../components/StudentDetailDialog';
import { JournalReminderButton } from '../components/JournalReminderButton';

interface Semester {
  _id: string;
  name: string;
}

interface DepartmentOption {
  _id: string;
  code: string;
  name: string;
}

interface CapstoneSessionRow {
  _id: string;
  semesterId: { _id: string; name: string } | string;
  department: string;
  status: 'draft' | 'open' | 'grading' | 'closed';
  journalWeekCount: number;
  tracks: { track: string; isOpen: boolean; gradingSchemeId?: string | null; gradingSchemeVersion?: number | null }[];
  createdAt: string;
}

interface UserOption {
  _id: string;
  name: string;
  email: string;
  /** Invited but hasn't set up their account yet. */
  invitePending?: boolean;
}

const userLabel = (u: UserOption) => `${u.name} (${u.email})${u.invitePending ? ' · invited' : ''}`;

interface GroupMember {
  studentAccountId: { _id: string; studentId: string; name: string; email?: string } | string;
  studentIdText: string;
  removedAt?: string | null;
}

interface GroupRow {
  _id: string;
  track: string;
  groupNumber: number;
  projectTitle: string;
  members: GroupMember[];
  supervisorId: UserOption | string;
  evaluators: { evaluatorId: UserOption | string; unassignedAt?: string | null }[];
  reportUrl?: string | null;
  lastJournalReminderAt?: string | null;
}

/** A report link must be a real web address - anything else is almost certainly a paste slip. */
const isWebUrl = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());

const TERMS = ['Spring', 'Summer', 'Fall'] as const;

/** ULAB terms: Spring Jan-Apr, Summer May-Aug, Fall Sep-Dec. */
function currentTerm(now = new Date()): (typeof TERMS)[number] {
  const month = now.getMonth();
  return month < 4 ? 'Spring' : month < 8 ? 'Summer' : 'Fall';
}

/** Last year through three years ahead - enough to open a session a little late or early. */
function yearOptions(now = new Date()): number[] {
  const year = now.getFullYear();
  return [year - 1, year, year + 1, year + 2, year + 3];
}

/** Select value meaning "type your own" for both the term and the year pickers. */
const OTHER = '__other__';

const normalizeSemesterName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * What each stage change means, in words. The session moves draft → open → grading → closed;
 * these describe only what the server actually enforces at each stage (marks are accepted
 * only while "open", members can't be added from "grading" on, groups can't be added once
 * "closed"), so the buttons don't promise locks that don't exist.
 */
const STATUS_ACTIONS: Record<string, { label: string; hint: string; done: string; confirm?: string }> = {
  'draft->open': {
    label: 'Open Session',
    hint: 'Start the semester: supervisors and evaluators can submit marks while the session is open.',
    done: 'Session opened',
  },
  'open->grading': {
    label: 'Start Grading',
    hint: 'Stop mark submissions and new members, and compute grades from what was submitted.',
    done: 'Grading started - mark submission is now closed',
    confirm: 'Supervisors and evaluators will no longer be able to submit or change marks, and no more members can be added. You can reopen submissions later if needed.',
  },
  'grading->open': {
    label: 'Reopen Submissions',
    hint: 'Let supervisors and evaluators submit or correct marks again.',
    done: 'Submissions reopened',
  },
  'grading->closed': {
    label: 'Close Session',
    hint: 'Finalise the semester. Only an admin can reopen a closed session, with a reason.',
    done: 'Session closed',
    confirm: 'This finalises the semester. Only an admin can reopen it afterwards, and a reason is required.',
  },
  'closed->grading': {
    label: 'Reopen for Correction',
    hint: 'Admin only: move a closed session back to grading, e.g. to fix a mark. A reason is required.',
    done: 'Session reopened for correction',
  },
};

/** One line on what the current stage means, shown next to the status badge. */
const STATUS_MEANING: Record<string, string> = {
  draft: 'Setting up - marks cannot be submitted yet.',
  open: 'In progress - supervisors and evaluators can submit marks.',
  grading: 'Marks are closed; grades are computed from what was submitted.',
  closed: 'Finalised. Only an admin can reopen it.',
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['open'],
  open: ['grading'],
  grading: ['closed', 'open'],
  closed: ['grading'],
};

export default function CapstoneSessionManagement() {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [sessions, setSessions] = useState<CapstoneSessionRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [newSemesterId, setNewSemesterId] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newJournalWeeks, setNewJournalWeeks] = useState('12');
  const [creating, setCreating] = useState(false);
  // The semester is picked as term + year and resolved to a Semester record on "Next".
  const [newTerm, setNewTerm] = useState<string>(currentTerm());
  const [newYear, setNewYear] = useState<string>(String(new Date().getFullYear()));
  const [customTerm, setCustomTerm] = useState('');
  const [customYear, setCustomYear] = useState('');
  const [resolvingSemester, setResolvingSemester] = useState(false);

  const resetWizard = () => {
    setWizardStep(0);
    setNewSemesterId('');
    setNewDepartment('');
    setNewJournalWeeks('12');
    setNewTerm(currentTerm());
    setNewYear(String(new Date().getFullYear()));
    setCustomTerm('');
    setCustomYear('');
  };

  const [selectedSession, setSelectedSession] = useState<CapstoneSessionRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CapstoneSessionRow | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupTrack, setGroupTrack] = useState('A');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupSupervisor, setGroupSupervisor] = useState('');
  const [groupMembers, setGroupMembers] = useState<MemberRow[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Bumped after any mutation so the setup checklist re-reads its state.
  const [setupKey, setSetupKey] = useState(0);
  const bumpSetup = () => setSetupKey((k) => k + 1);

  const [memberPickerFor, setMemberPickerFor] = useState<GroupRow | null>(null);
  const [newMembers, setNewMembers] = useState<MemberRow[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);

  const [evaluatorPickerFor, setEvaluatorPickerFor] = useState<GroupRow | null>(null);
  const [evaluatorToAdd, setEvaluatorToAdd] = useState('');

  // Student detail dialog (marks, grade, journal; coordinators can edit name/email).
  const [openStudent, setOpenStudent] = useState<{ groupId: string; studentAccountId: string } | null>(null);

  // Report links: one inline editor at a time, plus a bulk-paste dialog for end of semester.
  const [reportEditFor, setReportEditFor] = useState<string | null>(null);
  const [reportDraft, setReportDraft] = useState('');
  const [savingReport, setSavingReport] = useState(false);
  const [showBulkReports, setShowBulkReports] = useState(false);
  const [bulkReportTrack, setBulkReportTrack] = useState('A');
  const [bulkReportText, setBulkReportText] = useState('');
  const [savingBulkReports, setSavingBulkReports] = useState(false);

  /** Adds (or refreshes) an invited user in the picker list so they can be selected at once. */
  const upsertUser = (user: InvitedUser) =>
    setUsers((prev) => {
      const rest = prev.filter((u) => u._id !== user._id);
      return [...rest, user].sort((a, b) => a.name.localeCompare(b.name));
    });

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [semRes, deptRes, sessRes, usersRes] = await Promise.all([
        fetch('/api/semesters'),
        fetch('/api/departments'),
        fetch('/api/capstone/sessions'),
        fetch('/api/auth/users'),
      ]);
      const [semData, deptData, sessData, usersData] = await Promise.all([
        semRes.json(),
        deptRes.json(),
        sessRes.json(),
        usersRes.json(),
      ]);
      if (semRes.ok) setSemesters(semData);
      if (deptRes.ok) setDepartments(deptData);
      if (sessRes.ok) {
        setSessions(sessData);
        // ?session=<id> (from the global search or a shared link) opens that session directly.
        const url = new URL(window.location.href);
        if (url.searchParams.get('action') === 'new-session') {
          setShowCreate(true);
          url.searchParams.delete('action');
          window.history.replaceState(window.history.state, '', url);
        }
        const wanted = url.searchParams.get('session');
        if (wanted) {
          const match = (sessData as CapstoneSessionRow[]).find((x) => x._id === wanted);
          if (match) openSession(match);
          else toast.error('That capstone session was not found, or you cannot manage it');
          url.searchParams.delete('session');
          window.history.replaceState(window.history.state, '', url);
        }
      } else toast.error(sessData.error || 'Failed to load capstone sessions');
      if (usersRes.ok) setUsers(usersData);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load capstone data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleCreateSession = async () => {
    if (!newSemesterId || !newDepartment) {
      toast.error('Semester and department are required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/capstone/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          semesterId: newSemesterId,
          department: newDepartment,
          journalWeekCount: Number(newJournalWeeks) || 12,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create session');
      toast.success('Capstone session created');
      setShowCreate(false);
      resetWizard();
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  // "Other" swaps the dropdown value for whatever was typed in its custom box.
  const termValue = (newTerm === OTHER ? customTerm : newTerm).trim().replace(/\s+/g, ' ');
  const yearValue = (newYear === OTHER ? customYear : newYear).trim();
  const termError =
    newTerm === OTHER && termValue && !/^[A-Za-z][A-Za-z -]{0,29}$/.test(termValue)
      ? 'Use letters only, e.g. "Winter"'
      : '';
  const yearError =
    newYear === OTHER && yearValue && !(/^\d{4}$/.test(yearValue) && +yearValue >= 1990 && +yearValue <= 2100)
      ? 'Enter a 4-digit year between 1990 and 2100'
      : '';

  /**
   * Finds the semester named "<Term> <Year>" (matching existing records regardless of case or
   * spacing) or creates it, then moves the wizard on. Reusing the existing record matters:
   * courses and other sessions hang off the same Semester, so a near-duplicate like
   * "fall 2026" would split them.
   */
  const resolveSemesterAndContinue = async () => {
    if (termError || yearError || !termValue || !yearValue) return;
    const name = `${termValue} ${yearValue}`;
    const existing = semesters.find((sem) => normalizeSemesterName(sem.name) === normalizeSemesterName(name));
    if (existing) {
      setNewSemesterId(existing._id);
      setWizardStep(1);
      return;
    }

    setResolvingSemester(true);
    try {
      const res = await fetch('/api/semesters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        setSemesters((prev) => [...prev, data]);
        setNewSemesterId(data._id);
        setWizardStep(1);
        return;
      }
      // Someone else may have created it since the list loaded - reload and use theirs.
      if (res.status === 409) {
        const listRes = await fetch('/api/semesters');
        const list: Semester[] = listRes.ok ? await listRes.json() : [];
        const found = list.find((sem) => normalizeSemesterName(sem.name) === normalizeSemesterName(name));
        if (found) {
          setSemesters(list);
          setNewSemesterId(found._id);
          setWizardStep(1);
          return;
        }
      }
      throw new Error(data.error || `Could not set up semester "${name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set up semester');
    } finally {
      setResolvingSemester(false);
    }
  };

  const openSession = async (session: CapstoneSessionRow) => {
    setSelectedSession(session);
    setGroupsLoading(true);
    try {
      const res = await fetch(`/api/capstone/sessions/${session._id}/groups`);
      const data = await res.json();
      if (res.ok) setGroups(data);
      else toast.error(data.error || 'Failed to load groups');
    } catch (err) {
      console.error(err);
      toast.error('Failed to load groups');
    } finally {
      setGroupsLoading(false);
    }
  };

  const refreshGroups = async () => {
    if (!selectedSession) return;
    const res = await fetch(`/api/capstone/sessions/${selectedSession._id}/groups`);
    const data = await res.json();
    if (res.ok) setGroups(data);
    bumpSetup();
  };

  const handleTransition = async (session: CapstoneSessionRow, status: string) => {
    const action = STATUS_ACTIONS[`${session.status}->${status}`];
    if (action?.confirm && !confirm(`${action.label}?\n\n${action.confirm}`)) return;

    // Reopening a closed session is admin-only and the server requires a reason for the
    // record - without asking, this transition could never succeed.
    let reason: string | undefined;
    if (session.status === 'closed') {
      reason = window.prompt('Why is this closed session being reopened? (kept in the session history)')?.trim();
      if (!reason) return;
    }

    try {
      const res = await fetch(`/api/capstone/sessions/${session._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');
      toast.success(action?.done || `Session moved to ${status}`);
      fetchAll();
      bumpSetup();
      if (selectedSession?._id === session._id) setSelectedSession(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  /** Toast summarising a journal-welcome email run, so a coordinator knows who didn't get it. */
  const reportEmailResult = (email: { sent: number; failed: number; noEmail: { studentId: string }[] } | undefined) => {
    if (!email) return;
    const parts = [`Emailed ${email.sent} student${email.sent === 1 ? '' : 's'}`];
    if (email.failed) parts.push(`${email.failed} failed`);
    if (email.noEmail.length) parts.push(`no email on record: ${email.noEmail.map((n) => n.studentId).join(', ')}`);
    (email.failed || email.noEmail.length ? toast.warning : toast.success)(parts.join(' · '));
  };

  const handleCreateGroup = async (notifyStudents: boolean) => {
    if (!selectedSession) return;

    const members = groupMembers;
    const missing = [
      !groupTitle.trim() && 'a project title',
      !groupSupervisor && 'a supervisor',
      members.length === 0 && 'at least one member',
    ].filter(Boolean);
    if (missing.length > 0) {
      toast.error(`Please add ${missing.join(', ')}`);
      return;
    }

    setCreatingGroup(true);
    try {
      const res = await fetch(`/api/capstone/sessions/${selectedSession._id}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track: groupTrack,
          projectTitle: groupTitle.trim(),
          supervisorId: groupSupervisor,
          // Full member records, so no URMS lookup is needed server-side.
          members,
          notifyStudents,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create group');
      toast.success('Group created');
      reportEmailResult(data.email);
      // Non-fatal per-member problems (a duplicated email, say) come back alongside the
      // created group rather than as an error, so surface them without implying failure.
      if (Array.isArray(data.warnings)) {
        for (const w of data.warnings) toast.warning(`${w.studentId}: ${w.message}`);
      }
      setShowCreateGroup(false);
      setGroupTitle('');
      setGroupSupervisor('');
      setGroupMembers([]);
      refreshGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setCreatingGroup(false);
    }
  };

  const saveReportUrl = async (groupId: string, url: string) => {
    const reportUrl = url.trim();
    if (reportUrl && !isWebUrl(reportUrl)) {
      toast.error('Enter a full link starting with http:// or https://');
      return false;
    }
    const res = await fetch(`/api/capstone/groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportUrl: reportUrl || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save report link');
    setGroups((prev) => prev.map((g) => (g._id === groupId ? { ...g, reportUrl: reportUrl || null } : g)));
    return true;
  };

  const handleSaveReport = async (groupId: string) => {
    setSavingReport(true);
    try {
      if (await saveReportUrl(groupId, reportDraft)) {
        toast.success(reportDraft.trim() ? 'Report link saved' : 'Report link removed');
        setReportEditFor(null);
        bumpSetup();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save report link');
    } finally {
      setSavingReport(false);
    }
  };

  // Bulk paste: "group number, link" per line, for one track. Lines are matched to groups
  // up front so the dialog can show exactly what will be saved before anything is written.
  const bulkReportPlan = (() => {
    const trackGroups = groups.filter((g) => g.track === bulkReportTrack);
    const rows: Array<{ line: string; group?: GroupRow; url?: string; problem?: string }> = [];
    for (const raw of bulkReportText.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const match = /^#?\s*(\d+)\s*[,;\t ]\s*(\S+)\s*$/.exec(line);
      if (!match) {
        rows.push({ line, problem: 'Expected: group number, link' });
        continue;
      }
      const group = trackGroups.find((g) => g.groupNumber === Number(match[1]));
      if (!group) rows.push({ line, problem: `No group #${match[1]} in Track ${bulkReportTrack}` });
      else if (!isWebUrl(match[2])) rows.push({ line, group, problem: 'Not a web link (http/https)' });
      else rows.push({ line, group, url: match[2] });
    }
    return rows;
  })();

  const handleSaveBulkReports = async () => {
    const ready = bulkReportPlan.filter((r) => r.group && r.url);
    if (ready.length === 0) return;
    setSavingBulkReports(true);
    let saved = 0;
    for (const row of ready) {
      try {
        if (await saveReportUrl(row.group!._id, row.url!)) saved += 1;
      } catch (err) {
        toast.error(`#${row.group!.groupNumber}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }
    setSavingBulkReports(false);
    toast.success(`Saved ${saved} report link${saved === 1 ? '' : 's'}`);
    if (saved === ready.length) {
      setShowBulkReports(false);
      setBulkReportText('');
    }
    bumpSetup();
  };

  const handleDeleteGroup = async (group: GroupRow) => {
    if (!confirm(`Delete group "${group.projectTitle}"?`)) return;
    try {
      const res = await fetch(`/api/capstone/groups/${group._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete group');
      toast.success('Group deleted');
      refreshGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete group');
    }
  };

  const handleRemoveMember = async (group: GroupRow, studentAccountId: string) => {
    try {
      const res = await fetch(`/api/capstone/groups/${group._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeMemberStudentAccountId: studentAccountId, removeReason: 'dropped' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove member');
      toast.success('Member removed');
      refreshGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  /** Emails every supervisor and evaluator asking them to submit their marks. */
  const handleRequestMarks = async () => {
    if (!selectedSession) return;
    try {
      const res = await fetch(`/api/capstone/sessions/${selectedSession._id}/request-marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send requests');
      toast.success(
        typeof data.sent === 'number'
          ? `Emailed ${data.sent} grader${data.sent === 1 ? '' : 's'}`
          : 'Mark requests sent'
      );
      bumpSetup();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send requests');
    }
  };

  /**
   * Routes a checklist step to whatever it actually needs. Steps with an href navigate on
   * their own; these are the ones that act in-page.
   */
  const handleSetupAction = (stepKey: string) => {
    if (!selectedSession) return;

    switch (stepKey) {
      case 'groups':
        setShowCreateGroup(true);
        break;
      case 'evaluators': {
        // Jump straight to the first group that has none, rather than making the user hunt.
        const target = groups.find(
          (g) => g.evaluators.filter((e) => !e.unassignedAt).length === 0
        );
        if (target) {
          setEvaluatorPickerFor(target);
        } else {
          toast.info('Every group already has an evaluator');
        }
        break;
      }
      case 'open':
        handleTransition(selectedSession, 'open');
        break;
      case 'marks':
        if (selectedSession.status === 'open') handleTransition(selectedSession, 'grading');
        else handleRequestMarks();
        break;
      case 'chosen': {
        // First group that still needs a choice: more than two evaluators and a component with
        // none chosen (groups with one or two count them all automatically).
        const target = groups.find((g) => {
          if (g.evaluators.filter((e) => !e.unassignedAt).length <= 2) return false;
          const chosen = (g as GroupRow & { chosenEvaluators?: { presentation?: string[]; report?: string[] } }).chosenEvaluators;
          return !chosen?.presentation?.length || !chosen?.report?.length;
        });
        if (target) window.location.href = `/capstone/groups/${target._id}?tab=manage`;
        else toast.info('Every group with more than two evaluators already has a choice');
        break;
      }
      case 'pin':
        // The pinning panel is already on this page; scrolling beats a dialog here.
        document.getElementById('track-schemes')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      default:
        break;
    }
  };

  const handleAddMembers = async (notify: boolean) => {
    if (!memberPickerFor) return;
    const toAdd = newMembers;
    if (toAdd.length === 0) {
      toast.error('Add at least one student');
      return;
    }
    setAddingMembers(true);

    // Posted one at a time because the endpoint validates each student individually (already
    // in this group, already in another group this session, cohort locked). A per-member
    // result means one rejection doesn't discard the rest.
    let added = 0;
    const failures: string[] = [];
    const email = { sent: 0, failed: 0, noEmail: [] as { studentId: string }[] };

    for (const member of toAdd) {
      try {
        const res = await fetch(`/api/capstone/groups/${memberPickerFor._id}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...member, notify }),
        });
        const data = await res.json();
        if (!res.ok) {
          failures.push(`${member.studentId}: ${data.error || 'failed'}`);
          continue;
        }
        added += 1;
        if (data.email) {
          email.sent += data.email.sent;
          email.failed += data.email.failed;
          email.noEmail.push(...data.email.noEmail);
        }
        if (Array.isArray(data.warnings)) {
          for (const w of data.warnings) toast.warning(`${w.studentId}: ${w.message}`);
        }
      } catch {
        failures.push(`${member.studentId}: network error`);
      }
    }

    setAddingMembers(false);

    if (added > 0) toast.success(`Added ${added} member${added === 1 ? '' : 's'}`);
    if (notify && added > 0) reportEmailResult(email);
    for (const failure of failures) toast.error(failure);

    if (failures.length === 0) {
      setMemberPickerFor(null);
      setNewMembers([]);
    } else {
      // Keep only the ones that failed, so the user can correct them in place.
      const failedIds = new Set(failures.map((f) => f.split(':')[0]));
      setNewMembers((prev) => prev.filter((m) => failedIds.has(m.studentId)));
    }
    refreshGroups();
  };

  const handleAddEvaluator = async () => {
    if (!evaluatorPickerFor || !evaluatorToAdd) return;
    try {
      const res = await fetch(`/api/capstone/groups/${evaluatorPickerFor._id}/evaluators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluatorId: evaluatorToAdd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign evaluator');
      toast.success('Evaluator assigned');
      setEvaluatorToAdd('');
      setEvaluatorPickerFor(null);
      refreshGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign evaluator');
    }
  };

  const handleRemoveEvaluator = async (group: GroupRow, evaluatorId: string) => {
    try {
      const res = await fetch(`/api/capstone/groups/${group._id}/evaluators/${evaluatorId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove evaluator');
      toast.success('Evaluator removed');
      refreshGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove evaluator');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  // ── Session detail (groups) view ──────────────────────────────────────────
  const sessionLabel = (s: CapstoneSessionRow) =>
    `${s.department} Capstone - ${typeof s.semesterId === 'object' ? s.semesterId.name : ''}`;

  const deleteDialog = (
    <DeleteSessionDialog
      session={deleteTarget ? { _id: deleteTarget._id, label: sessionLabel(deleteTarget) } : null}
      onClose={() => setDeleteTarget(null)}
      onDeleted={(sessionId) => {
        setDeleteTarget(null);
        setSessions((prev) => prev.filter((s) => s._id !== sessionId));
        if (selectedSession?._id === sessionId) setSelectedSession(null);
      }}
    />
  );

  if (selectedSession) {
    const semesterName = typeof selectedSession.semesterId === 'object' ? selectedSession.semesterId.name : '';
    return (
      <div className="space-y-4">
        {deleteDialog}
        <Button variant="ghost" size="sm" onClick={() => setSelectedSession(null)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Back to Sessions
        </Button>

        <SetupChecklist
          sessionId={selectedSession._id}
          refreshKey={setupKey}
          onAction={handleSetupAction}
        />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {selectedSession.department} Capstone - {semesterName}
                  <Badge variant="secondary" className="capitalize">{selectedSession.status}</Badge>
                </CardTitle>
                <CardDescription>
                  {STATUS_MEANING[selectedSession.status]} · {selectedSession.journalWeekCount} week journal
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* One menu instead of a Presentation + Report button per track. Each item opens a
                    print-ready page in a new tab. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" title="Print blank marking sheets for manual scoring">
                      <Printer className="h-4 w-4 mr-1.5" />
                      Print Sheets
                      <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    {([
                      { kind: 'presentation-sheet', label: 'Presentation marking sheet', hint: 'one sheet per track' },
                      { kind: 'report-sheet', label: 'Report rubric', hint: 'one page per group' },
                    ] as const).map((sheet, i) => (
                      <DropdownMenuGroup key={sheet.kind}>
                        {i > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel className="text-xs">
                          {sheet.label}
                          <span className="ml-1 font-normal text-muted-foreground">· {sheet.hint}</span>
                        </DropdownMenuLabel>
                        {selectedSession.tracks.map((t) => (
                          <DropdownMenuItem
                            key={`${sheet.kind}-${t.track}`}
                            onSelect={() =>
                              window.open(
                                `/api/capstone/sessions/${selectedSession._id}/${sheet.kind}?track=${t.track}`,
                                '_blank'
                              )
                            }
                          >
                            Capstone {t.track}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {(STATUS_TRANSITIONS[selectedSession.status] || []).map((next) => {
                  const action = STATUS_ACTIONS[`${selectedSession.status}->${next}`];
                  return (
                    <Tip key={next} label={action?.hint || `Move the session to ${next}`}>
                      <Button
                        variant={next === 'open' && selectedSession.status === 'draft' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleTransition(selectedSession, next)}
                      >
                        {action?.label || `Move to ${next}`}
                      </Button>
                    </Tip>
                  );
                })}
                <Tip label="Paste report links for many groups at once, e.g. at semester end">
                  <Button variant="outline" size="sm" onClick={() => setShowBulkReports(true)} disabled={groups.length === 0}>
                    <Link2 className="h-4 w-4 mr-1.5" />
                    Report Links
                  </Button>
                </Tip>
                <Tip
                  label="Create a group: project title, supervisor and students"
                  disabledReason={selectedSession.status === 'closed' ? 'This session is closed - reopen it to add groups.' : undefined}
                >
                  <Button size="sm" onClick={() => setShowCreateGroup(true)} disabled={selectedSession.status === 'closed'}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    New Group
                  </Button>
                </Tip>
                <Tip label="Permanently delete this session and everything in it - you'll be asked to confirm">
                  <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(selectedSession)}>
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete Session
                  </Button>
                </Tip>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {groupsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : groups.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No groups yet.</p>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => {
                  const activeMembers = group.members.filter((m) => !m.removedAt);
                  const activeEvaluators = group.evaluators.filter((e) => !e.unassignedAt);
                  const supervisor = typeof group.supervisorId === 'object' ? group.supervisorId : null;
                  return (
                    <div key={group._id} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold">{group.projectTitle}</h4>
                            <Badge variant="outline">Track {group.track} #{group.groupNumber}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                            <UserCog className="h-3.5 w-3.5" />
                            Supervisor: {supervisor?.name || 'Unknown'} ({supervisor?.email})
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <JournalReminderButton
                            groupId={group._id}
                            lastSentAt={group.lastJournalReminderAt}
                            compact
                            variant="ghost"
                            onSent={(at) =>
                              setGroups((prev) => prev.map((g) => (g._id === group._id ? { ...g, lastJournalReminderAt: at } : g)))
                            }
                          />
                          <Tip label="Delete this group and its journal entries and marks (only while the session is a draft or open)">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteGroup(group)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </Tip>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-muted-foreground">Members · click a name for marks, grade and journal</p>
                          <Tip label="Add students to this group">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => {
                                setMemberPickerFor(group);
                                setNewMembers([]);
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          </Tip>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {activeMembers.map((m) => {
                            const account = typeof m.studentAccountId === 'object' ? m.studentAccountId : null;
                            const sid = account ? account._id : (m.studentAccountId as string);
                            return (
                              <span key={sid} className="inline-flex items-center rounded-md border bg-secondary/60 text-xs">
                                <Tip label={account?.email ? `${account.email} - view marks, grade and journal` : 'No email on record - view or edit details'}>
                                  <button
                                    type="button"
                                    onClick={() => setOpenStudent({ groupId: group._id, studentAccountId: sid })}
                                    className="flex items-center gap-1.5 rounded-l-md px-2 py-1 hover:bg-secondary"
                                  >
                                    <span className="font-medium">{account?.name || m.studentIdText}</span>
                                    <span className="font-mono text-[10px] text-muted-foreground">{account?.studentId || m.studentIdText}</span>
                                    {account && !account.email && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="no email" />}
                                  </button>
                                </Tip>
                                <Tip label="Remove from this group (journal and marks are kept)">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMember(group, sid)}
                                    className="rounded-r-md border-l px-1.5 py-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    aria-label="Remove member"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Tip>
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-muted-foreground">Evaluators</p>
                          <Tip label="Assign an evaluator - or invite someone who isn't registered yet">
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setEvaluatorPickerFor(group)}>
                              <ShieldPlus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          </Tip>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {activeEvaluators.length === 0 && <span className="text-xs text-muted-foreground">None assigned</span>}
                          {activeEvaluators.map((e) => {
                            const evUser = typeof e.evaluatorId === 'object' ? e.evaluatorId : null;
                            const evId = typeof e.evaluatorId === 'object' ? e.evaluatorId._id : e.evaluatorId;
                            return (
                              <Badge key={evId} variant="outline" className="gap-1">
                                {evUser?.name || evId}
                                <Tip label="Unassign this evaluator (their submitted marks are kept)">
                                  <button onClick={() => handleRemoveEvaluator(group, evId)} className="ml-1 hover:text-destructive" aria-label="Unassign evaluator">
                                    <ShieldMinus className="h-3 w-3" />
                                  </button>
                                </Tip>
                              </Badge>
                            );
                          })}
                        </div>
                      </div>

                      {/* Report link - usually filled in at semester end, once students upload. */}
                      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground">Report</p>
                        {reportEditFor === group._id ? (
                          <>
                            <Input
                              autoFocus
                              value={reportDraft}
                              onChange={(e) => setReportDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveReport(group._id);
                                if (e.key === 'Escape') setReportEditFor(null);
                              }}
                              placeholder="https://drive.google.com/..."
                              className="h-8 min-w-48 flex-1 text-xs"
                              disabled={savingReport}
                            />
                            <Tip label="Save the report link (leave empty to remove it)">
                              <Button size="icon" className="h-8 w-8" onClick={() => handleSaveReport(group._id)} disabled={savingReport}>
                                {savingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              </Button>
                            </Tip>
                            <Tip label="Cancel">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setReportEditFor(null)} disabled={savingReport}>
                                <X className="h-4 w-4" />
                              </Button>
                            </Tip>
                          </>
                        ) : group.reportUrl ? (
                          <>
                            <Tip label={group.reportUrl}>
                              <a href={group.reportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                <FileText className="h-3.5 w-3.5" /> Open report <ExternalLink className="h-3 w-3" />
                              </a>
                            </Tip>
                            <Tip label="Change the report link">
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { setReportEditFor(group._id); setReportDraft(group.reportUrl || ''); }}>
                                Edit
                              </Button>
                            </Tip>
                          </>
                        ) : (
                          <Tip label="Paste the link to the group's final report (e.g. Google Drive) once they've uploaded it">
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => { setReportEditFor(group._id); setReportDraft(''); }}>
                              <Link2 className="h-3 w-3 mr-1" /> Add report link
                            </Button>
                          </Tip>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div id="track-schemes">
          <TrackSchemePanel
          sessionId={selectedSession._id}
          department={selectedSession.department}
          tracks={selectedSession.tracks}
          onUpdated={(updatedTracks) => {
            setSelectedSession((prev) => (prev ? { ...prev, tracks: updatedTracks as typeof prev.tracks } : prev));
            bumpSetup();
          }}
          />
        </div>

        {/* Create group */}
        <Dialog open={showCreateGroup} onOpenChange={(open) => !creatingGroup && setShowCreateGroup(open)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Capstone Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label>Track</Label>
                <Select value={groupTrack} onValueChange={setGroupTrack}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {selectedSession.tracks.map((t) => (
                      <SelectItem key={t.track} value={t.track}>Track {t.track}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="group-title">Project Title</Label>
                <Input id="group-title" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Supervisor</Label>
                <Select value={groupSupervisor} onValueChange={setGroupSupervisor}>
                  <SelectTrigger><SelectValue placeholder="Select supervisor" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u._id} value={u._id}>{userLabel(u)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <PendingInviteNote
                  sessionId={selectedSession._id}
                  role="supervisor"
                  user={users.find((u) => u._id === groupSupervisor)}
                />
                <InvitePersonForm
                  sessionId={selectedSession._id}
                  role="supervisor"
                  onInvited={(user) => {
                    upsertUser(user);
                    setGroupSupervisor(user._id);
                  }}
                />
              </div>
              <MemberEntry
                value={groupMembers}
                onChange={setGroupMembers}
                disabled={creatingGroup}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateGroup(false)} disabled={creatingGroup}>Cancel</Button>
              <Tip label="Create the group without emailing anyone.">
                <Button variant="secondary" onClick={() => handleCreateGroup(false)} disabled={creatingGroup}>
                  {creatingGroup ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Save
                </Button>
              </Tip>
              <Tip label="Create the group and email each student their group, project and supervisor, with a link to their weekly journal.">
                <Button onClick={() => handleCreateGroup(true)} disabled={creatingGroup}>
                  {creatingGroup ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MailPlus className="h-4 w-4 mr-2" />}
                  Save &amp; email students
                </Button>
              </Tip>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <StudentDetailDialog
          groupId={openStudent?.groupId || null}
          studentAccountId={openStudent?.studentAccountId || null}
          onClose={() => setOpenStudent(null)}
          onUpdated={() => refreshGroups()}
        />

        {/* Bulk report links */}
        <Dialog open={showBulkReports} onOpenChange={(open) => !savingBulkReports && setShowBulkReports(open)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Report links</DialogTitle>
              <DialogDescription>
                Once students have uploaded their final reports, paste one line per group:{' '}
                <strong>group number, link</strong>. Existing links for those groups are replaced.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="shrink-0">Track</Label>
                <Select value={bulkReportTrack} onValueChange={setBulkReportTrack}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {selectedSession.tracks.map((t) => (
                      <SelectItem key={t.track} value={t.track}>Capstone {t.track}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <textarea
                value={bulkReportText}
                onChange={(e) => setBulkReportText(e.target.value)}
                rows={6}
                placeholder={'1, https://drive.google.com/...\n2, https://drive.google.com/...'}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-primary/50"
                disabled={savingBulkReports}
              />
              {bulkReportPlan.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
                  {bulkReportPlan.map((row, i) => (
                    <li key={i} className="flex items-start gap-2">
                      {row.url ? (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      ) : (
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                      <span className="min-w-0">
                        {row.group ? (
                          <strong>#{row.group.groupNumber} {row.group.projectTitle}</strong>
                        ) : (
                          <span className="font-mono">{row.line}</span>
                        )}
                        {row.problem ? (
                          <span className="text-destructive"> - {row.problem}</span>
                        ) : (
                          <span className="block truncate text-muted-foreground">{row.url}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkReports(false)} disabled={savingBulkReports}>Cancel</Button>
              <Button
                onClick={handleSaveBulkReports}
                disabled={savingBulkReports || !bulkReportPlan.some((r) => r.url)}
              >
                {savingBulkReports && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save {bulkReportPlan.filter((r) => r.url).length || ''} link{bulkReportPlan.filter((r) => r.url).length === 1 ? '' : 's'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add evaluator */}
        <Dialog open={evaluatorPickerFor !== null} onOpenChange={(open) => !open && setEvaluatorPickerFor(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Assign Evaluator</DialogTitle>
              <DialogDescription>{evaluatorPickerFor?.projectTitle}</DialogDescription>
            </DialogHeader>
            <Select value={evaluatorToAdd} onValueChange={setEvaluatorToAdd}>
              <SelectTrigger><SelectValue placeholder="Select evaluator" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u._id} value={u._id}>{userLabel(u)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {evaluatorPickerFor && (
              <PendingInviteNote
                sessionId={selectedSession._id}
                role="evaluator"
                projectTitle={evaluatorPickerFor.projectTitle}
                user={users.find((u) => u._id === evaluatorToAdd)}
              />
            )}
            {evaluatorPickerFor && (
              <InvitePersonForm
                sessionId={selectedSession._id}
                role="evaluator"
                projectTitle={evaluatorPickerFor.projectTitle}
                onInvited={(user) => {
                  upsertUser(user);
                  setEvaluatorToAdd(user._id);
                }}
              />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEvaluatorPickerFor(null)}>Cancel</Button>
              <Button onClick={handleAddEvaluator} disabled={!evaluatorToAdd}>Assign</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add members to an existing group */}
        <Dialog
          open={memberPickerFor !== null}
          onOpenChange={(open) => !open && !addingMembers && setMemberPickerFor(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Members</DialogTitle>
              <DialogDescription>
                {memberPickerFor?.projectTitle} · Track {memberPickerFor?.track} #
                {memberPickerFor?.groupNumber}
              </DialogDescription>
            </DialogHeader>

            <div className="py-2">
              <MemberEntry
                value={newMembers}
                onChange={setNewMembers}
                disabled={addingMembers}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setMemberPickerFor(null)}
                disabled={addingMembers}
              >
                Cancel
              </Button>
              <Tip label="Add these students without emailing them.">
                <Button variant="secondary" onClick={() => handleAddMembers(false)} disabled={addingMembers || newMembers.length === 0}>
                  {addingMembers && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </Tip>
              <Tip label="Add these students and email each of them their group details and a link to their weekly journal.">
                <Button onClick={() => handleAddMembers(true)} disabled={addingMembers || newMembers.length === 0}>
                  {addingMembers ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailPlus className="mr-2 h-4 w-4" />}
                  Save &amp; email {newMembers.length ? `(${newMembers.length})` : ''}
                </Button>
              </Tip>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Sessions list view ───────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Capstone Sessions
            </CardTitle>
            <CardDescription>
              Open a capstone session per semester/department, then create groups (title + members),
              assign supervisors, and manage evaluators.
            </CardDescription>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Open Session
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No capstone sessions yet.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session._id}
                className="flex w-full items-center justify-between gap-2 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <button onClick={() => openSession(session)} className="flex-1 p-4 text-left">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">
                      {session.department} - {typeof session.semesterId === 'object' ? session.semesterId.name : ''}
                    </h4>
                    <Badge variant="secondary" className="capitalize">{session.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Tracks {session.tracks.map((t) => t.track).join(', ')} · {session.journalWeekCount} week journal
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-3 text-muted-foreground hover:text-destructive"
                  title="Delete session"
                  aria-label={`Delete ${sessionLabel(session)}`}
                  onClick={() => setDeleteTarget(session)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {deleteDialog}

      {/* Create session — 3-step wizard */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!creating) { setShowCreate(open); if (!open) resetWizard(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Open Capstone Session</DialogTitle>
            <DialogDescription>
              Step {wizardStep + 1} of 3 —{' '}
              {wizardStep === 0 ? 'Choose a semester' : wizardStep === 1 ? 'Set department & journal weeks' : 'Confirm & create'}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-2">
            {[0, 1, 2].map((s) => (
              <div key={s} className="flex flex-1 items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium shrink-0 ${
                  s === wizardStep ? 'bg-primary text-primary-foreground' : s < wizardStep ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                }`}>{s + 1}</div>
                {s < 2 && <div className={`h-px flex-1 ${s < wizardStep ? 'bg-primary/40' : 'bg-border'}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Semester */}
          {wizardStep === 0 && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="space-y-2">
                <Label>Term</Label>
                <Select value={newTerm} onValueChange={setNewTerm}>
                  <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                  <SelectContent>
                    {TERMS.map((term) => (
                      <SelectItem key={term} value={term}>{term}</SelectItem>
                    ))}
                    <SelectItem value={OTHER}>Other…</SelectItem>
                  </SelectContent>
                </Select>
                {newTerm === OTHER && (
                  <>
                    <Input
                      autoFocus
                      placeholder="e.g. Winter"
                      value={customTerm}
                      onChange={(e) => setCustomTerm(e.target.value)}
                      maxLength={30}
                    />
                    {termError && <p className="text-xs text-destructive">{termError}</p>}
                  </>
                )}
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={newYear} onValueChange={setNewYear}>
                  <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                  <SelectContent>
                    {yearOptions().map((year) => (
                      <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                    <SelectItem value={OTHER}>Other…</SelectItem>
                  </SelectContent>
                </Select>
                {newYear === OTHER && (
                  <>
                    <Input
                      autoFocus={newTerm !== OTHER}
                      inputMode="numeric"
                      placeholder="e.g. 2024"
                      value={customYear}
                      onChange={(e) => setCustomYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    />
                    {yearError && <p className="text-xs text-destructive">{yearError}</p>}
                  </>
                )}
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                Semester:{' '}
                <strong className="text-foreground">
                  {termValue && yearValue ? `${termValue} ${yearValue}` : '—'}
                </strong>
              </p>
            </div>
          )}

          {/* Step 2: Department + Journal Weeks */}
          {wizardStep === 1 && (
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={newDepartment} onValueChange={setNewDepartment}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d._id} value={d.code}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="journal-weeks">Weekly Journal — Number of Weeks</Label>
                <Input id="journal-weeks" type="number" min={1} max={30} value={newJournalWeeks} onChange={(e) => setNewJournalWeeks(e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {wizardStep === 2 && (() => {
            const sem = semesters.find((s) => s._id === newSemesterId);
            const dept = departments.find((d) => d.code === newDepartment);
            return (
              <div className="py-2 space-y-3">
                <p className="text-sm text-muted-foreground">Please confirm the details before creating:</p>
                <div className="rounded-lg border p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Semester</span><strong>{sem?.name || '—'}</strong></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Department</span><strong>{dept?.name || '—'}</strong></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tracks</span><strong>A, B, C (auto-created)</strong></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Journal Weeks</span><strong>{newJournalWeeks}</strong></div>
                </div>
              </div>
            );
          })()}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { if (wizardStep === 0) { setShowCreate(false); resetWizard(); } else setWizardStep((s) => s - 1); }} disabled={creating}>
              {wizardStep === 0 ? 'Cancel' : '← Back'}
            </Button>
            {wizardStep < 2 ? (
              <Button
                onClick={() => (wizardStep === 0 ? resolveSemesterAndContinue() : setWizardStep((s) => s + 1))}
                disabled={
                  wizardStep === 0
                    ? !termValue || !yearValue || !!termError || !!yearError || resolvingSemester
                    : !newDepartment
                }
              >
                {resolvingSemester ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Next →</> : 'Next →'}
              </Button>
            ) : (
              <Button onClick={handleCreateSession} disabled={creating}>
                {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : 'Open Session'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
