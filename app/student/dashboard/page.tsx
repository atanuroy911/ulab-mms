'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AlertTriangle, ArrowRight, BookOpen, CalendarCheck, GraduationCap, PlayCircle, Users, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StudentShell } from '../components/StudentShell';
import { ATTENDANCE_MIN, CourseCard, CoursesSkeleton, loadPortal, projectLabel, type PortalData } from './courses/shared';

interface QuickExamItem {
  _id: string;
  title: string;
  course: string;
  availability: 'upcoming' | 'open' | 'closed';
  state: 'not started' | 'in progress' | 'submitted';
}
interface CapstoneItem {
  group: { _id: string; track: string; groupNumber: number; projectTitle: string };
  session: { status: string } | null;
}

export default function StudentDashboardPage() {
  const { data: session } = useSession();
  const [portal, setPortal] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exams, setExams] = useState<QuickExamItem[] | null>(null);
  const [capstone, setCapstone] = useState<CapstoneItem[] | null>(null);

  useEffect(() => {
    loadPortal()
      .then(setPortal)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
    // The extras never block the page - they just don't show if they fail.
    fetch('/api/student/quick-exams')
      .then((r) => (r.ok ? r.json() : { exams: [] }))
      .then((d) => setExams(d.exams || []))
      .catch(() => setExams([]));
    fetch('/api/student/capstone')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCapstone(Array.isArray(d) ? d : []))
      .catch(() => setCapstone([]));
  }, []);

  const current = useMemo(() => (portal?.courses || []).filter((c) => !c.past && !c.withdrawn), [portal]);
  const openExams = (exams || []).filter((e) => e.state === 'in progress' || (e.availability === 'open' && e.state === 'not started'));
  const runningCapstone = (capstone || []).find((c) => c.session && c.session.status !== 'closed');
  const withClasses = current.filter((c) => c.attendance.totalSessions > 0);
  const avgAttendance = withClasses.length ? Math.round(withClasses.reduce((n, c) => n + c.attendance.percentage, 0) / withClasses.length) : null;

  // What needs the student's attention, most urgent first.
  const attention = [
    ...openExams.map((e) => ({
      key: `exam-${e._id}`,
      icon: PlayCircle,
      text: e.state === 'in progress' ? `Finish your quick exam: ${e.title}` : `Quick exam open: ${e.title}`,
      sub: e.course,
      href: `/student/dashboard/quick-exams/${e._id}`,
      tone: 'primary' as const,
    })),
    ...current
      .filter((c) => c.attendance.totalSessions >= 3 && c.attendance.percentage < ATTENDANCE_MIN)
      .map((c) => ({
        key: `att-${c.courseId}`,
        icon: AlertTriangle,
        text: `Attendance ${Math.round(c.attendance.percentage)}% in ${c.code}`,
        sub: `Below ${ATTENDANCE_MIN}% - ${c.attendance.absentSessions} classes missed`,
        href: `/student/dashboard/courses/${c.courseId}`,
        tone: 'danger' as const,
      })),
    ...current
      .filter((c) => c.project?.formingOpen && !c.project.groupNumber)
      .map((c) => ({
        key: `proj-${c.courseId}`,
        icon: Users,
        text: `Join a ${projectLabel(c)} group in ${c.code}`,
        sub: 'Groups are forming now',
        href: `/project/${c.courseId}`,
        tone: 'warn' as const,
      })),
  ];

  const firstName = (session?.user?.name || '').replace(/\s*\([^)]*\)\s*$/, '').split(' ')[0];

  return (
    <StudentShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Welcome{firstName ? `, ${firstName}` : ''}</h1>
          <p className="text-sm text-muted-foreground">Here&apos;s where you stand this semester.</p>
        </div>

        {/* At a glance */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile icon={BookOpen} label="Courses this semester" value={portal ? String(current.length) : '–'} href="/student/dashboard/courses" />
          <Tile
            icon={CalendarCheck}
            label="Average attendance"
            value={avgAttendance === null ? '–' : `${avgAttendance}%`}
            tone={avgAttendance !== null && avgAttendance < ATTENDANCE_MIN ? 'danger' : 'normal'}
            href="/student/dashboard/courses"
          />
          <Tile icon={Zap} label="Quick exams open" value={exams ? String(openExams.length) : '–'} tone={openExams.length ? 'primary' : 'normal'} href="/student/dashboard/quick-exams" />
          <Tile
            icon={GraduationCap}
            label="Capstone"
            value={capstone === null ? '–' : runningCapstone ? `${runningCapstone.group.track} · Group ${runningCapstone.group.groupNumber}` : 'Not enrolled'}
            small
            href="/student/dashboard/capstone"
          />
        </div>

        {attention.length > 0 && (
          <section className="space-y-3" aria-label="Needs your attention">
            <h2 className="text-sm font-semibold text-muted-foreground">Needs your attention</h2>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {attention.map(({ key, icon: Icon, text, sub, href, tone }) => (
                <li key={key}>
                  <Link href={href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        tone === 'danger' ? 'bg-destructive/10 text-destructive' : tone === 'warn' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-primary/10 text-primary'
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{text}</span>
                      <span className="block truncate text-xs text-muted-foreground">{sub}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">This semester</h2>
            <Link href="/student/dashboard/courses" className="text-sm text-primary hover:underline">
              All courses &amp; past semesters
            </Link>
          </div>
          {error && (
            <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </p>
          )}
          {!portal && !error && <CoursesSkeleton />}
          {portal && current.length === 0 && (
            <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium">No courses this semester</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Courses appear once your teacher adds you with your student ID ({portal.student.studentId}).
              </p>
            </div>
          )}
          {current.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {current.map((c) => (
                <CourseCard key={c.courseId} course={c} />
              ))}
            </div>
          )}
        </section>
      </div>
    </StudentShell>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  href,
  tone = 'normal',
  small = false,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
  href: string;
  tone?: 'normal' | 'primary' | 'danger';
  small?: boolean;
}) {
  return (
    <Link href={href} className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg',
          tone === 'danger' ? 'bg-destructive/10 text-destructive' : tone === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <p className={cn('mt-3 font-bold tabular-nums', small ? 'truncate text-base' : 'text-2xl')}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}
