'use client';

import { useEffect, useMemo, useState } from 'react';
import { Archive, BookOpen, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { StudentShell } from '../../components/StudentShell';
import { CourseCard, CoursesSkeleton, loadPortal, type PortalData } from './shared';

export default function StudentCoursesPage() {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'current' | 'past'>('current');
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadPortal()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      (data?.courses || [])
        .filter((c) => (tab === 'past' ? c.past : !c.past))
        .filter((c) => !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.teacher || '').toLowerCase().includes(q)),
    [data, tab, q]
  );
  // Past courses read best grouped by term, newest first.
  const terms = useMemo(() => {
    const map = new Map<string, typeof list>();
    for (const c of list) {
      const key = `${c.semester} ${c.year}`;
      map.set(key, [...(map.get(key) || []), c]);
    }
    return [...map];
  }, [list]);

  const currentCount = data?.courses.filter((c) => !c.past).length ?? 0;
  const pastCount = data?.courses.filter((c) => c.past).length ?? 0;

  return (
    <StudentShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My Courses</h1>
            <p className="text-sm text-muted-foreground">Marks, attendance and project groups for every course you&apos;re enrolled in.</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="flex rounded-lg border bg-background p-0.5" role="tablist" aria-label="Semester">
              {(
                [
                  ['current', `This semester (${currentCount})`],
                  ['past', `Past semesters (${pastCount})`],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={cn(
                    'flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm transition-colors',
                    tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {k === 'past' && <Archive className="h-3.5 w-3.5" aria-hidden />}
                  {label}
                </button>
              ))}
            </div>
            <div className="relative min-w-48 flex-1 sm:w-56 sm:flex-none">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search courses" className="h-9 pl-8" aria-label="Search courses" />
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </p>
        )}
        {!data && !error && <CoursesSkeleton count={6} />}

        {data && list.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 font-medium">
              {q ? 'No course matches.' : tab === 'past' ? 'No past semesters yet.' : 'No courses this semester.'}
            </p>
            {!q && tab === 'current' && (
              <p className="mt-1 text-sm text-muted-foreground">
                Courses appear here once your teacher adds you to the class list with your student ID ({data.student.studentId}).
              </p>
            )}
          </div>
        )}

        {data && list.length > 0 && tab === 'current' && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <CourseCard key={c.courseId} course={c} />
            ))}
          </div>
        )}

        {data &&
          tab === 'past' &&
          terms.map(([term, courses]) => (
            <section key={term} className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">{term}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map((c) => (
                  <CourseCard key={c.courseId} course={c} />
                ))}
              </div>
            </section>
          ))}
      </div>
    </StudentShell>
  );
}
