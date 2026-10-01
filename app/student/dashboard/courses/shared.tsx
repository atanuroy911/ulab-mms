'use client';

import Link from 'next/link';
import { BookOpen, ChevronRight, FlaskConical, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PortalCourse {
  courseId: string;
  code: string;
  name: string;
  section: string | null;
  semester: string;
  year: number;
  courseType: 'Theory' | 'Lab';
  teacher: string | null;
  withdrawn: boolean;
  past: boolean;
  termRank: number;
  attendance: { totalSessions: number; presentSessions: number; absentSessions: number; percentage: number };
  project: { formingOpen: boolean; groupNumber: number | null; projectTitle: string | null } | null;
}

export interface PortalData {
  student: { studentId: string; name: string };
  courses: PortalCourse[];
}

export async function loadPortal(): Promise<PortalData> {
  const res = await fetch('/api/student/portal');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load your courses');
  return data;
}

export const projectLabel = (c: Pick<PortalCourse, 'courseType'>) => (c.courseType === 'Lab' ? 'OEL / CEP project' : 'Project');

/** Attendance below this is flagged (the university's usual minimum). */
export const ATTENDANCE_MIN = 75;

export function CourseCard({ course: c }: { course: PortalCourse }) {
  const Icon = c.courseType === 'Lab' ? FlaskConical : BookOpen;
  const att = c.attendance;
  const low = att.totalSessions > 0 && att.percentage < ATTENDANCE_MIN;
  return (
    <Link
      href={`/student/dashboard/courses/${c.courseId}`}
      className="group flex flex-col rounded-xl border bg-card p-4 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            c.courseType === 'Lab' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="font-mono">{c.code}</span>
            {c.section && <span>· Sec {c.section}</span>}
            <span>· {c.courseType}</span>
            {c.withdrawn && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold">Withdrawn</span>}
          </p>
          <h3 className="mt-0.5 line-clamp-2 font-semibold leading-snug">{c.name}</h3>
          {c.teacher && <p className="truncate text-xs text-muted-foreground">{c.teacher}</p>}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Attendance</span>
          <span className={cn('font-semibold tabular-nums', low && 'text-destructive')}>
            {att.totalSessions ? `${Math.round(att.percentage)}% · ${att.presentSessions}/${att.totalSessions}` : 'No classes yet'}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className={cn('h-full rounded-full', low ? 'bg-destructive' : 'bg-primary')} style={{ width: `${att.totalSessions ? att.percentage : 0}%` }} />
        </div>
      </div>

      {c.project && (
        <p className="mt-3 flex items-center gap-1.5 truncate border-t pt-3 text-xs">
          <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {c.project.groupNumber ? (
            <span className="truncate">
              {projectLabel(c)}: <span className="font-medium">Group {c.project.groupNumber}</span>
              {c.project.projectTitle ? ` · ${c.project.projectTitle}` : ''}
            </span>
          ) : c.project.formingOpen ? (
            <span className="font-medium text-amber-700 dark:text-amber-400">{projectLabel(c)}: groups are forming - join one</span>
          ) : (
            <span className="text-muted-foreground">{projectLabel(c)}: not in a group</span>
          )}
        </p>
      )}
    </Link>
  );
}

export function CoursesSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid animate-pulse gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-44 rounded-xl bg-muted" />
      ))}
    </div>
  );
}
