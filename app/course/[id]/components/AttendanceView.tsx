"use client";

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronDown, ChevronRight, Loader2, QrCode, RefreshCw, Trash2, Clock, MapPin, Users, UserRound, Settings, CalendarIcon, MoreVertical, Check, X, Search } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { notify } from '@/app/utils/notifications';

interface AttendanceRecord {
  studentId: string;
  status: 'present' | 'absent';
  recordedAt: string;
  markedBy?: 'qr' | 'manual' | 'auto';
  studentIdString?: string;
}

type CourseSettings = {
  classTime: string;
  classRoom: string;
  numberOfStudents: string;
  classRepresentativeId: string;
};

function SettingsForm({
  students,
  courseId,
  initialValues,
  onSaved,
  onClose,
}: {
  students: Student[];
  courseId: string;
  initialValues: CourseSettings;
  onSaved: (savedCourse: CourseInfo) => Promise<void> | void;
  onClose: () => void;
}) {
  const [classTime, setClassTime] = useState(initialValues.classTime);
  const [classRoom, setClassRoom] = useState(initialValues.classRoom);
  const [numberOfStudents, setNumberOfStudents] = useState(initialValues.numberOfStudents);
  const [repSearch, setRepSearch] = useState('');
  const [classRepresentativeId, setClassRepresentativeId] = useState(initialValues.classRepresentativeId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setClassTime(initialValues.classTime);
    setClassRoom(initialValues.classRoom);
    setNumberOfStudents(initialValues.numberOfStudents);
    setClassRepresentativeId(initialValues.classRepresentativeId);
    const selectedRep = students.find((st) => st._id === initialValues.classRepresentativeId);
    setRepSearch(selectedRep ? selectedRep.name : '');
  }, [initialValues.classRoom, initialValues.classRepresentativeId, initialValues.classTime, initialValues.numberOfStudents, students]);

  const filtered = students.filter((st) => {
    if (!repSearch) return true;
    return st.name.toLowerCase().includes(repSearch.toLowerCase()) || st.studentId.toLowerCase().includes(repSearch.toLowerCase());
  });

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const payload: any = {
        classTime: classTime || '',
        classRoom: classRoom || '',
      };

      if (numberOfStudents !== '' && numberOfStudents !== undefined && numberOfStudents !== null) {
        const asNumber = Number(numberOfStudents);
        if (!Number.isNaN(asNumber)) payload.numberOfStudents = asNumber;
      }

      // If empty string, treat as explicit clear -> send null; otherwise send id
      payload.classRepresentativeId = classRepresentativeId === '' ? null : classRepresentativeId || null;

      const response = await fetch(`/api/courses/${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        await onSaved(data.course || {});
        onClose();
      } else {
        const data = await response.json().catch(() => ({}));
        setSaveError(data.error || 'Failed to save class settings');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {saveError && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{saveError}</div>}

      <div>
        <label className="text-sm font-medium">Class Time</label>
        <input value={classTime} onChange={(e) => setClassTime(e.target.value)} placeholder="e.g. 10:00 AM - 12:00 PM" className="w-full rounded-md border px-2 py-2 mt-1" />
      </div>

      <div>
        <label className="text-sm font-medium">Class Room</label>
        <input value={classRoom} onChange={(e) => setClassRoom(e.target.value)} placeholder="e.g. Lab 101" className="w-full rounded-md border px-2 py-2 mt-1" />
      </div>

      <div>
        <label className="text-sm font-medium">Number of Students</label>
        <input value={numberOfStudents} onChange={(e) => setNumberOfStudents(e.target.value)} type="number" min={1} className="w-40 rounded-md border px-2 py-2 mt-1" />
      </div>

      <div>
        <label className="text-sm font-medium">Class Representative</label>
        <input value={repSearch} onChange={(e) => setRepSearch(e.target.value)} placeholder="Search student name or id" className="w-full rounded-md border px-2 py-2 mt-1" />
        <div className="max-h-40 overflow-y-auto mt-2 rounded-md border bg-background">
          {filtered.map((st) => (
            <button
              key={st._id}
              type="button"
              className={`w-full border-b px-3 py-2 text-left transition-colors last:border-b-0 ${classRepresentativeId === st._id ? 'bg-primary/10 text-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
              onClick={() => setClassRepresentativeId(st._id)}
            >
              <div className="font-medium text-foreground">{st.name}</div>
              <div className="text-xs text-muted-foreground">{st.studentId}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}

interface Session {
  _id: string;
  date: string;
  open: boolean;
  records: AttendanceRecord[];
}

interface Student {
  _id: string;
  studentId: string;
  name: string;
  probation?: boolean;
}

interface CourseInfo {
  classTime?: string;
  classRoom?: string;
  numberOfStudents?: number;
  classRepresentativeId?: string | null;
}

type SessionStatus = 'present' | 'absent' | 'none';

function buildQrUrl(courseId: string, sessionDateISO?: string) {
  const sessionDateQuery = sessionDateISO ? `?attendance=1&sessionDate=${encodeURIComponent(sessionDateISO)}` : '?attendance=1';
  if (typeof window === 'undefined') return `/attendance/checkin/${courseId}${sessionDateQuery}`;
  return `${window.location.origin}/attendance/checkin/${courseId}${sessionDateQuery}`;
}

function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function QuickAttendanceSearch({
  students,
  activeSession,
  getStatus,
  onToggle,
}: {
  students: Student[];
  activeSession: Session | null;
  getStatus: (session: Session, student: Student) => SessionStatus;
  onToggle: (student: Student) => void;
}) {
  const [query, setQuery] = useState('');
  const disabled = !activeSession;

  return (
    <div className="rounded-lg border bg-muted/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Search className="h-4 w-4" />
        Quick attendance search
        {disabled && <span className="text-xs font-normal text-muted-foreground">(open a session to use this)</span>}
      </div>
      <Command shouldFilter className="overflow-visible rounded-md border bg-background">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          disabled={disabled}
          placeholder={disabled ? 'Open a session first...' : 'Type a name or student ID, then press Enter to toggle present/absent'}
        />
        {!disabled && query.trim() && (
          <CommandList>
            <CommandEmpty>No matching student.</CommandEmpty>
            {students.map((student) => {
              const status = activeSession ? getStatus(activeSession, student) : 'none';
              return (
                <CommandItem
                  key={student._id}
                  value={`${student.name} ${student.studentId}`}
                  onSelect={() => {
                    onToggle(student);
                    setQuery('');
                  }}
                  className="justify-between"
                >
                  <span>
                    {student.name} <span className="text-muted-foreground">({student.studentId})</span>
                  </span>
                  {status === 'present' && <Badge className="bg-green-600 hover:bg-green-600">Present</Badge>}
                  {status === 'absent' && <Badge variant="destructive">Absent</Badge>}
                  {status === 'none' && <span className="text-xs text-muted-foreground">Not marked</span>}
                </CommandItem>
              );
            })}
          </CommandList>
        )}
      </Command>
    </div>
  );
}

export default function AttendanceView({ courseId }: { courseId: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [sessionDate, setSessionDate] = useState(getLocalDateInputValue());
  const [sessionDialogError, setSessionDialogError] = useState('');
  const [showExportWarningModal, setShowExportWarningModal] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [attendanceRes, courseRes] = await Promise.all([
        fetch(`/api/courses/${courseId}/attendance`),
        fetch(`/api/courses/${courseId}`),
      ]);

      const attendanceData = await attendanceRes.json();
      const courseData = await courseRes.json();

      if (attendanceRes.ok) {
        setSessions(attendanceData.sessions || []);
        setActiveSession(attendanceData.activeSession || null);
      }

      if (courseRes.ok) {
        setStudents(courseData.students || []);
        setCourse(courseData.course || null);
      }
    } catch (err) {
      console.error('Error fetching attendance data', err);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (courseId) fetchAll();
  }, [courseId]);

  const sessionLabels = useMemo(
    () => sessions.map((session) => ({
      ...session,
      label: format(new Date(session.date), 'dd/MM/yy'),
    })),
    [sessions]
  );

  const toggleAttendance = async () => {
    if (!isActive) {
      setSessionDate(getLocalDateInputValue());
      setSessionDialogError('');
      setShowSessionDialog(true);
      return;
    }

    try {
      const res = await fetch(`/api/courses/${courseId}/attendance`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        await fetchAll();
      } else {
        console.error(data.error || 'Unable to toggle attendance');
      }
    } catch (err) {
      console.error('Error toggling attendance', err);
    }
  };

  const openSettingsModal = () => {
    setShowSettingsModal(true);
  };

  const refreshAttendance = async () => {
    await fetchAll();
  };

  const openSessionWithDate = async () => {
    try {
      const res = await fetch(`/api/courses/${courseId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: sessionDate }),
      });
      const data = await res.json();
      if (res.ok) {
        setSessionDialogError('');
        setShowSessionDialog(false);
        await fetchAll();
      } else {
        setSessionDialogError(data.error || 'Unable to open attendance session');
      }
    } catch (err) {
      setSessionDialogError('Error opening attendance session');
    }
  };

  const updateStudentStatus = async (sessionId: string, studentId: string, status: 'present' | 'absent') => {
    try {
      const res = await fetch(`/api/courses/${courseId}/attendance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, studentId, status }),
      });

      if (res.ok) {
        await fetchAll();
      }
    } catch (err) {
      console.error('Error updating attendance', err);
    }
  };

  const bulkSetSession = async (sessionId: string, status: 'present' | 'absent') => {
    try {
      const res = await fetch(`/api/courses/${courseId}/attendance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, status, applyToAll: true }),
      });

      if (res.ok) {
        notify.success(`Marked everyone ${status} for that date`);
        await fetchAll();
      } else {
        const data = await res.json().catch(() => ({}));
        notify.error(data.error || 'Failed to bulk-update attendance');
      }
    } catch (err) {
      console.error('Error bulk-updating attendance', err);
      notify.error('Failed to bulk-update attendance');
    }
  };

  const toggleActiveSessionStatus = (student: Student) => {
    if (!activeSession) return;
    const current = getStatus(activeSession, student);
    const next: 'present' | 'absent' = current === 'present' ? 'absent' : 'present';
    notify.success(`${student.name} marked ${next}`);
    updateStudentStatus(activeSession._id, student._id, next);
  };

  const deleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/courses/${courseId}/attendance/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirmId(null);
        await fetchAll();
      }
    } catch (err) {
      console.error('Error deleting session', err);
    }
  };

  const toggleProbation = async (studentId: string, probation: boolean) => {
    // Optimistically update UI
    setStudents((prev) => prev.map((s) => (s._id === studentId ? { ...s, probation } : s)));
    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probation }),
      });

      if (!res.ok) {
        // revert on failure and refetch
        await fetchAll();
      }
    } catch (err) {
      console.error('Error updating student probation', err);
      await fetchAll();
    }
  };

  const exportAttendance = async () => {
    try {
      setExportLoading(true);
      const sessionParam = activeSession ? `sessionId=${encodeURIComponent(activeSession._id)}` : '';

      const settingsParams = new URLSearchParams();
      if (course?.classTime) settingsParams.set('classTime', course.classTime);
      if (course?.classRoom) settingsParams.set('classRoom', course.classRoom);
      if (course?.numberOfStudents != null) settingsParams.set('numberOfStudents', String(course.numberOfStudents));
      if (course?.classRepresentativeId) settingsParams.set('classRepresentativeId', String(course.classRepresentativeId));
      if (sessionParam) settingsParams.set('sessionId', activeSession?._id || '');

      const qs = settingsParams.toString();
      const url = `/api/courses/${courseId}/attendance-pdf${qs ? `?${qs}` : ''}`;
      window.open(url, '_blank');
    } catch (err) {
      console.error('Error opening attendance view', err);
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportClick = () => {
    if (settingsMissing) {
      setShowExportWarningModal(true);
    } else {
      exportAttendance();
    }
  };

  const getStatus = (session: Session, student: Student): SessionStatus => {
    const record = session.records?.find((item) => String(item.studentId) === String(student._id));
    return record?.status || 'none';
  };

  const countsForSession = (session: Session) => {
    const present = session.records?.filter((item) => item.status === 'present').length || 0;
    const absent = session.records?.filter((item) => item.status === 'absent').length || 0;
    return { present, absent };
  };

  const isActive = Boolean(activeSession?.open);

  // show guide if settings missing
  const settingsMissing = !course?.classTime && !course?.classRoom && !course?.classRepresentativeId;
  const settingsSummary = [course?.classTime, course?.classRoom, course?.numberOfStudents ? String(course.numberOfStudents) : '', course?.classRepresentativeId ? 'Representative set' : ''].filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-2xl font-semibold">Attendance</h3>
          <p className="text-sm text-muted-foreground">Toggle a class session on, then use QR or manual present/absent updates.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={refreshAttendance}
            disabled={loading}
            aria-label="Refresh attendance"
            title="Refresh attendance"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>

          <Button
            type="button"
            onClick={toggleAttendance}
            className={isActive ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-slate-500 hover:bg-slate-600 text-white'}
          >
            {isActive ? 'Close Session' : 'Open Session'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleExportClick}
            disabled={exportLoading}
          >
            {exportLoading ? 'Opening...' : 'Print Attendance'}
          </Button>

          <Button type="button" variant="outline" onClick={() => setShowQrModal(true)} disabled={!isActive}>
            <QrCode className="mr-2 h-4 w-4" />
            QR Code
          </Button>

          <Button type="button" variant="outline" onClick={() => setShowManageModal(true)}>
            Manage class session
          </Button>
        </div>
      </div>

      {!loading && course && (
        settingsMissing ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10 px-4 py-3">
            <div className="flex-1 text-sm text-muted-foreground">
              Class settings (time, room, representative) are not set. They will appear on PDF exports.
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowSettingsModal(true)}>
              <Settings className="mr-2 h-4 w-4" />
              Set Class Settings
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/10 px-4 py-3 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-4 w-4" />
              {course?.classTime ? (
                <span className="font-medium text-foreground">{course.classTime}</span>
              ) : (
                <span className="italic opacity-60">Time not set</span>
              )}
            </div>
            
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {course?.classRoom ? (
                <span className="font-medium text-foreground">{course.classRoom}</span>
              ) : (
                <span className="italic opacity-60">Room not set</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="font-medium text-foreground">{course?.numberOfStudents || students.length || '0'} Students</span>
            </div>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              <UserRound className="h-4 w-4" />
              {course?.classRepresentativeId ? (
                <span className="font-medium text-foreground">
                  {students.find(s => s._id === course.classRepresentativeId)?.name || 'Representative'}
                </span>
              ) : (
                <span className="italic opacity-60">Rep not set</span>
              )}
            </div>

            <Button variant="ghost" size="sm" className="ml-auto h-8 px-2 text-xs" onClick={() => setShowSettingsModal(true)}>
              Edit Settings
            </Button>
          </div>
        )
      )}

      {!loading && (
        <QuickAttendanceSearch
          students={students}
          activeSession={activeSession}
          getStatus={getStatus}
          onToggle={toggleActiveSessionStatus}
        />
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading attendance...</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[260px]">Student</TableHead>
                <TableHead className="min-w-32">Present / Absent</TableHead>
                {sessionLabels.map((session) => (
                  <TableHead key={session._id} className="w-[84px] min-w-[84px] px-2 text-center">
                    <div className="group flex items-center justify-center gap-1">
                      <span className="text-xs font-medium">{session.label}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Bulk actions for ${session.label}`}
                            className="rounded p-0.5 opacity-0 transition-opacity hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center">
                          <DropdownMenuItem onClick={() => bulkSetSession(session._id, 'present')}>
                            <Check className="text-green-600" />
                            Mark all present
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => bulkSetSession(session._id, 'absent')}>
                            <X />
                            Mark all absent
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {students.map((student) => {
                const isExpanded = expandedStudentId === student._id;
                const studentSessions = sessionLabels.map((session) => ({
                  ...session,
                  status: getStatus(session, student),
                }));
                const presentCount = studentSessions.filter((item) => item.status === 'present').length;
                const absentCount = studentSessions.filter((item) => item.status === 'absent').length;

                return (
                  <Fragment key={student._id}>
                    <TableRow key={student._id}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setExpandedStudentId(isExpanded ? null : student._id)}
                          className="flex items-center gap-2 text-left font-medium hover:underline"
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span>{student.probation ? <strong>{student.name}</strong> : student.name}</span>
                          <span className="text-muted-foreground">({student.studentId})</span>
                          {student.probation && <Badge variant="secondary">Probation</Badge>}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">Present {presentCount} / Absent {absentCount}</Badge>
                      </TableCell>
                      {sessionLabels.map((session) => {
                        const status = getStatus(session, student);
                        return (
                          <TableCell key={session._id} className="p-1 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateStudentStatus(session._id, student._id, 'present')}
                                aria-label={`Mark ${student.name} present for ${session.label}`}
                                aria-pressed={status === 'present'}
                                title="Present"
                                className={cn(
                                  'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                                  status === 'present'
                                    ? 'border-green-600 bg-green-600 text-white'
                                    : 'border-muted-foreground/30 text-muted-foreground/40 hover:border-green-600 hover:text-green-600'
                                )}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => updateStudentStatus(session._id, student._id, 'absent')}
                                aria-label={`Mark ${student.name} absent for ${session.label}`}
                                aria-pressed={status === 'absent'}
                                title="Absent"
                                className={cn(
                                  'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                                  status === 'absent'
                                    ? 'border-red-600 bg-red-600 text-white'
                                    : 'border-muted-foreground/30 text-muted-foreground/40 hover:border-red-600 hover:text-red-600'
                                )}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>

                    {isExpanded && (
                      <TableRow key={`${student._id}-expanded`}>
                        <TableCell colSpan={2 + sessionLabels.length} className="bg-muted/30">
                          <div className="rounded-md border bg-background px-3 py-2">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={Boolean(student.probation)}
                                onCheckedChange={(checked) => toggleProbation(student._id, checked === true)}
                              />
                              <div className="space-y-1">
                                <div className="font-medium">In probation</div>
                                <div className="text-xs text-muted-foreground">
                                  Students in probation are shown bold in the PDF export.
                                </div>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showQrModal} onOpenChange={setShowQrModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Attendance QR</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(buildQrUrl(courseId, activeSession?.date))}`}
              alt="Attendance QR"
              className="rounded-xl border bg-white p-3"
            />
            <div className="break-all text-xs text-muted-foreground">{buildQrUrl(courseId, activeSession?.date)}</div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSessionDialog} onOpenChange={setShowSessionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose class date</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {sessionDialogError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {sessionDialogError}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="attendance-date" className="text-sm font-medium">
                Session date
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="attendance-date"
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !sessionDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {sessionDate ? format(new Date(sessionDate), "dd/MM/yyyy") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={sessionDate ? new Date(sessionDate) : undefined}
                    onSelect={(d) => {
                       if (d) {
                         const year = d.getFullYear();
                         const month = String(d.getMonth() + 1).padStart(2, '0');
                         const day = String(d.getDate()).padStart(2, '0');
                         setSessionDate(`${year}-${month}-${day}`);
                       }
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <p className="text-sm text-muted-foreground">
              Select the actual class date. This is useful for makeup classes or any attendance session that is not held on today’s date.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setShowSessionDialog(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={openSessionWithDate}>
                Open session
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showManageModal} onOpenChange={setShowManageModal}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Manage class session</DialogTitle>
          </DialogHeader>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Present</TableHead>
                  <TableHead>Absent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionLabels.map((session) => {
                  const counts = countsForSession(session);
                  const isDeleteConfirming = deleteConfirmId === session._id;
                  return (
                    <TableRow key={session._id}>
                      <TableCell>{session.label}</TableCell>
                      <TableCell>{counts.present}</TableCell>
                      <TableCell>{counts.absent}</TableCell>
                      <TableCell>
                        <Badge variant={session.open ? 'default' : 'secondary'}>{session.open ? 'Open' : 'Closed'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={isDeleteConfirming ? 'destructive' : 'outline'}
                          size="sm"
                          onClick={() => {
                            if (isDeleteConfirming) {
                              deleteSession(session._id);
                            } else {
                              setDeleteConfirmId(session._id);
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {isDeleteConfirming ? 'Confirm delete' : 'Delete'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Class Settings</DialogTitle>
          </DialogHeader>
          <SettingsForm
            key={`${course?.classTime || ''}|${course?.classRoom || ''}|${course?.numberOfStudents || ''}|${course?.classRepresentativeId || ''}|${students.length}`}
            students={students}
            courseId={courseId}
            initialValues={{
              classTime: course?.classTime || '',
              classRoom: course?.classRoom || '',
              numberOfStudents: course?.numberOfStudents ? String(course.numberOfStudents) : String(students.length || ''),
              classRepresentativeId: course?.classRepresentativeId ? String(course.classRepresentativeId) : '',
            }}
            onSaved={(savedCourse) => {
              setCourse((current) => ({
                ...current,
                ...savedCourse,
              }));
              return fetchAll();
            }}
            onClose={() => setShowSettingsModal(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showExportWarningModal} onOpenChange={setShowExportWarningModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Class Settings Not Set</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm text-muted-foreground">
            <p>
              You haven't set the class settings (Class Time, Class Room, Number of Students, or Representative) yet.
            </p>
            <p>
              If you don't set these, the options will appear empty in the printed sheet. You only need to set these once.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowExportWarningModal(false);
                exportAttendance();
              }}
              disabled={exportLoading}
            >
              Ignore & Print
            </Button>
            <Button
              onClick={() => {
                setShowExportWarningModal(false);
                openSettingsModal();
              }}
            >
              Set Settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
