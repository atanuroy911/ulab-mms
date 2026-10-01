'use client';

import { use as usePromise, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, FlaskConical, Lock, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StudentShell } from '../../../components/StudentShell';
import { CourseReportBody } from '@/app/student/check-marks/components/CourseReportBody';
import type { CourseData } from '@/app/student/check-marks/types';

interface ProjectInfo {
  /** The course has project groups at all. */
  exists: boolean;
  formingOpen: boolean;
  group: {
    groupNumber: number;
    projectTitle: string;
    maxMembers: number;
    members: Array<{ name: string; studentId: string; isMe: boolean }>;
  } | null;
}

export default function StudentCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = usePromise(params);
  const [data, setData] = useState<{ report: CourseData; project: ProjectInfo } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/student/portal/courses/${courseId}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Failed to load the course');
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the course'));
  }, [courseId]);

  const c = data?.report.course;
  const Icon = c?.courseType === 'Lab' ? FlaskConical : BookOpen;
  const projectName = c?.courseType === 'Lab' ? 'OEL / CEP project' : 'Course project';

  return (
    <StudentShell>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/student/dashboard/courses">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> My Courses
          </Link>
        </Button>

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </p>
        )}
        {!data && !error && (
          <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
            <div className="h-20 rounded-xl bg-muted" />
            <div className="h-64 rounded-xl bg-muted" />
          </div>
        )}

        {data && c && (
          <>
            <header className="flex items-start gap-4">
              <span
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                  c.courseType === 'Lab' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                )}
              >
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono">{c.code}</span> · {c.semester} {c.year} · {c.courseType}
                  {c.isArchived && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">Archived</span>}
                  {data.report.student.withdrawn && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">Withdrawn</span>}
                </p>
                <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
              </div>
            </header>

            {/* The student's project group - shown here, changed only on the group page while the teacher keeps it open. */}
            {data.project.exists && (
            <section className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold">
                    <Users className="h-4 w-4 text-primary" aria-hidden /> {projectName}
                  </h2>
                  {data.project.group ? (
                    <p className="mt-1 text-sm">
                      <span className="font-medium">Group {data.project.group.groupNumber}</span>
                      {data.project.group.projectTitle ? (
                        <span className="text-muted-foreground"> · {data.project.group.projectTitle}</span>
                      ) : (
                        <span className="italic text-muted-foreground"> · no title yet</span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {data.project.formingOpen ? 'You are not in a group yet - groups are forming now.' : 'You are not in a project group for this course.'}
                    </p>
                  )}
                </div>
                {data.project.formingOpen ? (
                  <Button asChild size="sm" variant={data.project.group ? 'outline' : 'default'}>
                    <Link href={`/project/${courseId}`}>
                      {data.project.group ? 'Group page' : 'Join or start a group'} <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  data.project.group && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" aria-hidden /> Groups are fixed
                    </span>
                  )
                )}
              </div>
              {data.project.group && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {data.project.group.members.map((m) => (
                    <li
                      key={m.studentId}
                      className={cn('rounded-full px-2.5 py-1 text-xs', m.isMe ? 'border border-primary/30 bg-primary/10 font-medium text-primary' : 'bg-muted')}
                    >
                      {m.name} <span className="opacity-60">{m.studentId}</span>
                      {m.isMe && ' (you)'}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            )}

            <CourseReportBody courseData={data.report} />
          </>
        )}
      </div>
    </StudentShell>
  );
}
