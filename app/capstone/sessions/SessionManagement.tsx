'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, GraduationCap, ArrowLeft, Users, Trash2, UserCog, ShieldPlus, ShieldMinus } from 'lucide-react';
import { toast } from 'sonner';
import { TrackSchemePanel } from './TrackSchemePanel';
import { MemberEntry, type MemberRow } from './MemberEntry';
import { SetupChecklist } from './SetupChecklist';

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
}

interface GroupMember {
  studentAccountId: { _id: string; studentId: string; name: string } | string;
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
}

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
  // Inline semester creation
  const [showNewSemester, setShowNewSemester] = useState(false);
  const [newSemesterName, setNewSemesterName] = useState('');
  const [creatingNewSemester, setCreatingNewSemester] = useState(false);

  const resetWizard = () => {
    setWizardStep(0);
    setNewSemesterId('');
    setNewDepartment('');
    setNewJournalWeeks('12');
    setShowNewSemester(false);
    setNewSemesterName('');
  };

  const [selectedSession, setSelectedSession] = useState<CapstoneSessionRow | null>(null);
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
      if (sessRes.ok) setSessions(sessData);
      else toast.error(sessData.error || 'Failed to load capstone sessions');
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

  const handleCreateInlineSemester = async () => {
    if (!newSemesterName.trim()) { toast.error('Semester name is required'); return; }
    setCreatingNewSemester(true);
    try {
      const res = await fetch('/api/semesters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSemesterName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create semester');
      toast.success(`Semester "${data.name}" created`);
      setSemesters((prev) => [...prev, data]);
      setNewSemesterId(data._id);
      setShowNewSemester(false);
      setNewSemesterName('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create semester');
    } finally {
      setCreatingNewSemester(false);
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
    try {
      const res = await fetch(`/api/capstone/sessions/${session._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');
      toast.success(`Session moved to ${status}`);
      fetchAll();
      bumpSetup();
      if (selectedSession?._id === session._id) setSelectedSession(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleCreateGroup = async () => {
    if (!selectedSession) return;

    if (!groupTitle.trim() || !groupSupervisor || groupMembers.length === 0) {
      toast.error('Project title, supervisor, and at least one member are required');
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
          members: groupMembers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create group');
      toast.success('Group created');
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
        const target = groups.find(
          (g) => g.evaluators.filter((e) => !e.unassignedAt).length > 2
        );
        if (target) window.location.href = `/capstone/groups/${target._id}`;
        else toast.info('No group has more than two evaluators');
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

  const handleAddMembers = async () => {
    if (!memberPickerFor || newMembers.length === 0) return;
    setAddingMembers(true);

    // Posted one at a time because the endpoint validates each student individually (already
    // in this group, already in another group this session, cohort locked). A per-member
    // result means one rejection doesn't discard the rest.
    let added = 0;
    const failures: string[] = [];

    for (const member of newMembers) {
      try {
        const res = await fetch(`/api/capstone/groups/${memberPickerFor._id}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(member),
        });
        const data = await res.json();
        if (!res.ok) {
          failures.push(`${member.studentId}: ${data.error || 'failed'}`);
          continue;
        }
        added += 1;
        if (Array.isArray(data.warnings)) {
          for (const w of data.warnings) toast.warning(`${w.studentId}: ${w.message}`);
        }
      } catch {
        failures.push(`${member.studentId}: network error`);
      }
    }

    setAddingMembers(false);

    if (added > 0) toast.success(`Added ${added} member${added === 1 ? '' : 's'}`);
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
  if (selectedSession) {
    const semesterName = typeof selectedSession.semesterId === 'object' ? selectedSession.semesterId.name : '';
    return (
      <div className="space-y-4">
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
                <CardDescription>{selectedSession.journalWeekCount} week journal</CardDescription>
              </div>
              <div className="flex gap-2">
                {(STATUS_TRANSITIONS[selectedSession.status] || []).map((next) => (
                  <Button key={next} variant="outline" size="sm" onClick={() => handleTransition(selectedSession, next)} className="capitalize">
                    Move to {next}
                  </Button>
                ))}
                <Button size="sm" onClick={() => setShowCreateGroup(true)} disabled={selectedSession.status === 'closed'}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Group
                </Button>
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
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{group.projectTitle}</h4>
                            <Badge variant="outline">Track {group.track} #{group.groupNumber}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                            <UserCog className="h-3.5 w-3.5" />
                            Supervisor: {supervisor?.name || 'Unknown'} ({supervisor?.email})
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteGroup(group)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-muted-foreground">Members</p>
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
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {activeMembers.map((m) => {
                            const sid = typeof m.studentAccountId === 'object' ? m.studentAccountId._id : m.studentAccountId;
                            const label = typeof m.studentAccountId === 'object' ? `${m.studentAccountId.name} (${m.studentAccountId.studentId})` : m.studentIdText;
                            return (
                              <Badge key={sid} variant="secondary" className="gap-1">
                                {label}
                                <button onClick={() => handleRemoveMember(group, sid)} className="ml-1 hover:text-destructive" title="Remove member">
                                  ×
                                </button>
                              </Badge>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-muted-foreground">Evaluators</p>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setEvaluatorPickerFor(group)}>
                            <ShieldPlus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {activeEvaluators.length === 0 && <span className="text-xs text-muted-foreground">None assigned</span>}
                          {activeEvaluators.map((e) => {
                            const evUser = typeof e.evaluatorId === 'object' ? e.evaluatorId : null;
                            const evId = typeof e.evaluatorId === 'object' ? e.evaluatorId._id : e.evaluatorId;
                            return (
                              <Badge key={evId} variant="outline" className="gap-1">
                                {evUser?.name || evId}
                                <button onClick={() => handleRemoveEvaluator(group, evId)} className="ml-1 hover:text-destructive" title="Unassign evaluator">
                                  <ShieldMinus className="h-3 w-3" />
                                </button>
                              </Badge>
                            );
                          })}
                        </div>
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
                      <SelectItem key={u._id} value={u._id}>{u.name} ({u.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <MemberEntry value={groupMembers} onChange={setGroupMembers} disabled={creatingGroup} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateGroup(false)} disabled={creatingGroup}>Cancel</Button>
              <Button onClick={handleCreateGroup} disabled={creatingGroup}>
                {creatingGroup ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>) : 'Create Group'}
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
                  <SelectItem key={u._id} value={u._id}>{u.name} ({u.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              <MemberEntry value={newMembers} onChange={setNewMembers} disabled={addingMembers} />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setMemberPickerFor(null)}
                disabled={addingMembers}
              >
                Cancel
              </Button>
              <Button onClick={handleAddMembers} disabled={addingMembers || newMembers.length === 0}>
                {addingMembers ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  `Add ${newMembers.length || ''}`.trim()
                )}
              </Button>
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
              <button
                key={session._id}
                onClick={() => openSession(session)}
                className="flex w-full items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors text-left"
              >
                <div>
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
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>

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
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label>Semester</Label>
                <Select value={newSemesterId} onValueChange={setNewSemesterId}>
                  <SelectTrigger><SelectValue placeholder="Select semester" /></SelectTrigger>
                  <SelectContent>
                    {semesters.map((s) => (
                      <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!showNewSemester ? (
                <button
                  onClick={() => setShowNewSemester(true)}
                  className="text-sm text-primary hover:underline"
                >
                  + Create a new semester instead
                </button>
              ) : (
                <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                  <Label>New Semester Name</Label>
                  <Input
                    placeholder="e.g., Spring 2027"
                    value={newSemesterName}
                    onChange={(e) => setNewSemesterName(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreateInlineSemester} disabled={creatingNewSemester}>
                      {creatingNewSemester ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Creating...</> : 'Create & Select'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowNewSemester(false)}>Cancel</Button>
                  </div>
                </div>
              )}
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
                onClick={() => setWizardStep((s) => s + 1)}
                disabled={wizardStep === 0 ? !newSemesterId : !newDepartment}
              >
                Next →
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
