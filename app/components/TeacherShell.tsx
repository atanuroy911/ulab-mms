'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { useStaffViewer } from '@/app/components/useStaffViewer';
import { adminSidebarItems } from '@/app/components/adminNav';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LogOut } from 'lucide-react';
import { AdminSidebar } from '@/app/components/AdminSidebar';
import { useTeacherNavItems } from '@/app/components/useTeacherNavItems';
import { DevModeBanner } from '@/app/components/DevModeBanner';

/**
 * The standard teacher-side page frame: persistent sidebar plus a sticky top bar.
 *
 * Extracted because the capstone pages had been built as standalone screens with their own
 * header and no sidebar, which made them feel like a separate application - you could get
 * into capstone but not back out to courses, resources or settings without the browser's
 * back button. Everything behind a teacher login should share one navigation frame.
 *
 * The `pl-16 md:pl-6` on the top bar leaves room for the mobile hamburger the sidebar
 * renders fixed at top-left below md; from md up the static rail takes over and the extra
 * padding is dropped.
 */

interface TeacherShellProps {
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned controls, rendered before the theme toggle. */
  actions?: ReactNode;
  children: ReactNode;
  /** Set for pages that manage their own scrolling (e.g. a full-bleed canvas). */
  noScroll?: boolean;
}

export function TeacherShell({
  title,
  subtitle,
  actions,
  children,
  noScroll = false,
}: TeacherShellProps) {
  const viewer = useStaffViewer();
  // Capstone pages are shared with the /admin panel's web-admin login, which can't open
  // teacher pages - give it the admin panel's navigation and sign-out instead.
  const webAdmin = viewer.status === 'webAdmin';
  const teacherNav = useTeacherNavItems();
  const items = webAdmin ? adminSidebarItems : teacherNav;

  const handleSignOut = async () => {
    if (webAdmin) {
      await fetch('/api/admin/signout', { method: 'POST' }).catch(() => {});
      window.location.href = '/admin/signin';
      return;
    }
    signOut({ callbackUrl: '/auth/signin' });
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <AdminSidebar items={items} title={webAdmin ? 'Admin Portal' : 'Teacher Portal'} />

      <div className="flex min-w-0 flex-1 flex-col">
        {webAdmin ? (
          <DevModeBanner manageHref="/admin/dashboard?tab=developer" canManage />
        ) : (
          <DevModeBanner />
        )}
        <nav className="sticky top-0 z-30 border-b bg-background">
          <div className="flex h-16 items-center justify-between gap-3 pl-16 pr-4 sm:pr-6 md:pl-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link href={webAdmin ? '/admin/dashboard' : '/dashboard'} className="hidden shrink-0 sm:block">
                <Image src="/ulab.svg" alt="ULAB Logo" width={32} height={32} />
              </Link>
              <div className="min-w-0">
                <h1 className="truncate bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-base font-bold text-transparent sm:text-lg">
                  {title}
                </h1>
                {subtitle && (
                  <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              {actions}
              <ThemeToggle />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </nav>

        <main className={noScroll ? 'flex min-h-0 flex-1 flex-col' : 'flex-1 overflow-y-auto'}>
          {children}
        </main>
      </div>
    </div>
  );
}
