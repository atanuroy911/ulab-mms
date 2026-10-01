'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { BookOpen, Eye, GraduationCap, Home, LogOut, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import { NotificationBell } from './NotificationBell';
import { useStudentMe } from './useStudentMe';

const NAV = [
  { href: '/student/dashboard', label: 'Home', icon: Home, exact: true },
  { href: '/student/dashboard/courses', label: 'My Courses', icon: BookOpen },
  { href: '/student/dashboard/quick-exams', label: 'Quick Exams', icon: Zap },
  { href: '/student/dashboard/capstone', label: 'Capstone', icon: GraduationCap },
];

/** The student portal's frame: who's signed in, where to go, and sign out. Read-only pages. */
export function StudentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const me = useStudentMe();
  const name = me?.name || '';
  const stopViewing = async () => {
    await fetch('/api/admin/view-as', { method: 'DELETE' }).catch(() => undefined);
    window.location.href = '/admin/dashboard?tab=people';
  };

  return (
    <div className="min-h-dvh bg-muted/30">
      {me?.viewAs && (
        <div
          className={
            me.canWrite
              ? 'sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-red-600 px-4 py-2 text-sm font-medium text-white'
              : 'sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950'
          }
        >
          <Eye className="h-4 w-4" aria-hidden />
          <span>
            {me.canWrite
              ? `Acting as ${me.name} (${me.studentId}) - changes are saved as this student`
              : `Viewing the portal as ${me.name} (${me.studentId}) - read only`}
            {me.viewedBy ? ` · ${me.viewedBy}` : ''}
          </span>
          <button type="button" onClick={stopViewing} className="rounded-md bg-black/10 px-2.5 py-0.5 font-semibold hover:bg-black/20">
            Stop viewing
          </button>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/student/dashboard" className="flex min-w-0 items-center gap-2.5">
            <Image src="/ulab.svg" alt="ULAB" width={30} height={30} className="shrink-0" />
            <span className="hidden font-semibold sm:inline">Student Portal</span>
          </Link>
          <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Student portal">
            {NAV.map(({ href, label, icon: Icon, exact }) => {
              const active = exact ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                    active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden /> {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right leading-tight sm:block">
              <p className="max-w-48 truncate text-sm font-medium">{name}</p>
              {me?.studentId && <p className="font-mono text-xs text-muted-foreground">{me.studentId}</p>}
            </div>
            <NotificationBell />
            <ThemeToggle />
            {/* Viewing as a student: signing out would end the admin's own session. */}
            {!me?.viewAs && (
              <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/student/signin' })} aria-label="Sign out">
                <LogOut className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            )}
          </div>
        </div>
        {/* Phones: the same places as a bottom-of-header strip */}
        <nav className="flex border-t md:hidden" aria-label="Student portal">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]', active ? 'font-medium text-primary' : 'text-muted-foreground')}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
