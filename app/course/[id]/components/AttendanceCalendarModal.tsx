'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, CalendarDays, Search, Check, X, Loader2 } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from 'date-fns';
import { computeMissedClassDates } from '@/app/utils/classSchedule';

interface AttendanceRecord {
  studentId: string;
  status: 'present' | 'absent';
  recordedAt: string;
  markedBy?: 'qr' | 'manual' | 'auto';
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
  withdrawn?: boolean;
}

interface AttendanceCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: Session[];
  students: Student[];
  onUpdateStatus: (sessionId: string, studentId: string, status: 'present' | 'absent') => Promise<void> | void;
  /** Course's regular weekly class days (e.g. ['Thursday', 'Saturday']) - days matching this
   *  pattern with no session between the first session and today are flagged as missed. */
  classDays?: string[];
  courseType?: 'Theory' | 'Lab';
}

function countsForSession(session: Session) {
  const present = session.records?.filter((r) => r.status === 'present').length || 0;
  const absent = session.records?.filter((r) => r.status === 'absent').length || 0;
  return { present, absent };
}

/** Attendance-rate color coding: mirrors the 75% "at-risk" threshold used elsewhere in the app
 *  (lib/coPoCalculations.ts ATTENDANCE_AT_RISK_THRESHOLD), with a green tier above 90%. */
function rateColorClasses(present: number, total: number) {
  if (total === 0) return 'bg-muted text-muted-foreground border-transparent';
  const rate = present / total;
  if (rate >= 0.9) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  if (rate >= 0.75) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30';
}

/** Modular full-screen calendar view of a course's attendance sessions: a month grid on the
 *  left (each class-session day shows a present/absent count colored by attendance rate), and a
 *  detail pane on the right for viewing/toggling that date's per-student attendance. */
export default function AttendanceCalendarModal({
  isOpen,
  onClose,
  sessions,
  students,
  onUpdateStatus,
  classDays = [],
  courseType,
}: AttendanceCalendarModalProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev' | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const wheelCooldownRef = useRef(false);
  const wheelAccumRef = useRef(0);
  const touchStartXRef = useRef<number | null>(null);
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, Session>();
    sessions.forEach((s) => {
      map.set(format(new Date(s.date), 'yyyy-MM-dd'), s);
    });
    return map;
  }, [sessions]);

  const firstSessionDate = useMemo(() => {
    if (sessions.length === 0) return null;
    return sessions.reduce((earliest, s) => (new Date(s.date) < earliest ? new Date(s.date) : earliest), new Date(sessions[0].date));
  }, [sessions]);

  const missedClassDateKeys = useMemo(() => {
    if (classDays.length === 0 || !firstSessionDate) return new Set<string>();
    const sessionDateKeys = new Set(sessions.map((s) => format(new Date(s.date), 'yyyy-MM-dd')));
    const missed = computeMissedClassDates(firstSessionDate, sessionDateKeys, classDays, courseType);
    return new Set(missed.map((d) => format(d, 'yyyy-MM-dd')));
  }, [classDays, firstSessionDate, sessions, courseType]);

  const isMissedClassDay = (day: Date) => missedClassDateKeys.has(format(day, 'yyyy-MM-dd'));

  const selectedSession = sessions.find((s) => s._id === selectedSessionId) || null;

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth));
    const end = endOfWeek(endOfMonth(viewMonth));
    const result: Date[] = [];
    let day = start;
    while (day <= end) {
      result.push(day);
      day = addDays(day, 1);
    }
    return result;
  }, [viewMonth]);

  const goToMonth = (direction: 'next' | 'prev') => {
    setSlideDirection(direction);
    setViewMonth((m) => (direction === 'next' ? addMonths(m, 1) : subMonths(m, 1)));
  };

  // Mouse-wheel scroll and touch swipe both change months, mirroring how people naturally try to
  // navigate a compact calendar (scroll up/down on desktop, swipe left/right on phone) instead of
  // hunting for the arrow buttons every time.
  const handleWheel = (e: React.WheelEvent) => {
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(delta) < 2) return;
    e.preventDefault();
    if (wheelCooldownRef.current) return;

    wheelAccumRef.current += delta;
    if (Math.abs(wheelAccumRef.current) < 60) return;

    const direction = wheelAccumRef.current > 0 ? 'next' : 'prev';
    wheelAccumRef.current = 0;
    wheelCooldownRef.current = true;
    goToMonth(direction);
    setTimeout(() => {
      wheelCooldownRef.current = false;
    }, 400);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const deltaX = (e.changedTouches[0]?.clientX ?? touchStartXRef.current) - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(deltaX) < 50) return;
    goToMonth(deltaX < 0 ? 'next' : 'prev');
  };

  const handleSelectDay = (day: Date) => {
    const session = sessionsByDay.get(format(day, 'yyyy-MM-dd'));
    setSelectedSessionId(session ? session._id : null);
  };

  const handleToggle = async (studentId: string, status: 'present' | 'absent') => {
    if (!selectedSession) return;
    setSavingStudentId(studentId);
    try {
      await onUpdateStatus(selectedSession._id, studentId, status);
    } finally {
      setSavingStudentId(null);
    }
  };

  const filteredStudents = studentSearch.trim()
    ? students.filter(
        (s) =>
          s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
          s.studentId.toLowerCase().includes(studentSearch.toLowerCase())
      )
    : students;

  const selectedCounts = selectedSession ? countsForSession(selectedSession) : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[96vw] w-full h-[92vh] p-0 flex flex-col gap-0 overflow-hidden sm:rounded-xl">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Attendance Calendar
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5">
          {/* Left: month calendar */}
          <div className="lg:col-span-3 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between px-6 py-3 shrink-0 gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => goToMonth('prev')} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => goToMonth('next')} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <span className="font-semibold text-lg">{format(viewMonth, 'MMMM yyyy')}</span>
                <span className="text-[11px] text-muted-foreground hidden sm:block">Scroll or swipe to change month</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setViewMonth(startOfMonth(new Date()))}>
                Jump to today
              </Button>
            </div>

            <div
              className="flex-1 min-h-0 overflow-y-auto px-6 pb-6"
              onWheel={handleWheel}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div className="grid grid-cols-7 gap-2 text-center text-sm font-semibold text-muted-foreground mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div
                key={format(viewMonth, 'yyyy-MM')}
                className={`grid grid-cols-7 gap-2 animate-in fade-in duration-200 ${
                  slideDirection === 'next' ? 'slide-in-from-right-8' : slideDirection === 'prev' ? 'slide-in-from-left-8' : ''
                }`}
              >
                {days.map((day) => {
                  const key = format(day, 'yyyy-MM-dd');
                  const session = sessionsByDay.get(key);
                  const inMonth = isSameMonth(day, viewMonth);
                  const counts = session ? countsForSession(session) : null;
                  const total = counts ? counts.present + counts.absent : 0;
                  const isSelected = session && session._id === selectedSessionId;
                  const missed = !session && isMissedClassDay(day);

                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!session}
                      onClick={() => handleSelectDay(day)}
                      title={missed ? 'Expected class day with no recorded session' : undefined}
                      className={`min-h-[68px] rounded-lg border p-2 flex flex-col justify-between gap-1.5 transition-colors text-left ${
                        !inMonth ? 'opacity-35' : ''
                      } ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/40 bg-primary/5'
                          : session
                          ? 'border-border hover:border-primary/50 cursor-pointer'
                          : missed
                          ? 'border-dashed border-red-500/50 bg-red-500/5'
                          : 'border-transparent cursor-default'
                      }`}
                    >
                      <span className={`text-base ${isToday(day) ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
                        {format(day, 'd')}
                      </span>
                      {session && counts && (
                        <span
                          className={`w-full rounded px-1.5 py-1 text-sm font-semibold border text-center leading-tight ${rateColorClasses(counts.present, total)}`}
                        >
                          {counts.present}/{total}
                        </span>
                      )}
                      {missed && (
                        <span className="w-full rounded px-1.5 py-1 text-xs font-medium border border-dashed border-red-500/40 text-red-600 dark:text-red-400 text-center leading-tight">
                          Missed
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40" /> ≥90% present
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/40" /> 75–89%
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500/40" /> &lt;75%
                </span>
                {classDays.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-red-500/60" /> Missed class
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: selected day detail pane */}
          <div className="lg:col-span-2 flex flex-col min-h-0">
            {!selectedSession ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground text-center px-8">
                Click a highlighted date on the calendar to view and edit that day&apos;s attendance.
              </div>
            ) : (
              <>
                <div className="px-5 py-4 border-b shrink-0 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{format(new Date(selectedSession.date), 'EEEE, MMM d yyyy')}</div>
                      {selectedCounts && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {selectedCounts.present} present · {selectedCounts.absent} absent · {students.length} students
                        </div>
                      )}
                    </div>
                    <Badge variant={selectedSession.open ? 'default' : 'secondary'}>
                      {selectedSession.open ? 'Open' : 'Closed'}
                    </Badge>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Search by name or ID..."
                      className="pl-9 h-9"
                    />
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto divide-y">
                  {filteredStudents.map((student) => {
                    const record = selectedSession.records?.find((r) => r.studentId === student._id);
                    const status = record?.status;
                    const saving = savingStudentId === student._id;

                    return (
                      <div key={student._id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                        <div className="min-w-0">
                          <div className={`text-sm font-medium truncate ${student.withdrawn ? 'text-amber-700 dark:text-yellow-400' : ''}`}>
                            {student.name} {student.withdrawn && <span className="font-bold">(W)</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">{student.studentId}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-1" />
                          ) : (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant={status === 'present' ? 'default' : 'outline'}
                                className={status === 'present' ? 'bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2.5' : 'h-8 px-2.5'}
                                onClick={() => handleToggle(student._id, 'present')}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={status === 'absent' ? 'default' : 'outline'}
                                className={status === 'absent' ? 'bg-red-600 hover:bg-red-700 text-white h-8 px-2.5' : 'h-8 px-2.5'}
                                onClick={() => handleToggle(student._id, 'absent')}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filteredStudents.length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">No students match &quot;{studentSearch}&quot;</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
