'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStaffViewer } from '@/app/components/useStaffViewer';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { TeacherShell } from '@/app/components/TeacherShell';
import SessionManagement from './SessionManagement';

/**
 * Capstone session management, on the teacher side.
 *
 * Coordinators used to have to switch into the admin dashboard to open a session or add a
 * group, which meant leaving their own portal to do their own job. The same component is
 * embedded here and in the admin dashboard; the APIs behind it are gated by
 * canManageDepartment, so a coordinator sees exactly their department and an admin sees all.
 */
export default function CapstoneSessionsPage() {
  const viewer = useStaffViewer();
  const router = useRouter();

  // Teacher accounts and the /admin panel's web-admin login both manage sessions here.
  const roles = viewer.status === 'teacher' || viewer.status === 'webAdmin' ? viewer.roles : [];
  const canManage = roles.includes('admin') || roles.includes('coordinator');

  useEffect(() => {
    if (viewer.status === 'none') router.push('/auth/signin');
  }, [viewer.status, router]);

  if (viewer.status === 'loading' || viewer.status === 'none') {
    return (
      <TeacherShell title="Capstone Sessions">
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </TeacherShell>
    );
  }

  // This is a client-side courtesy only - the server enforces the same rule on every
  // underlying route, so hiding the UI is never the thing keeping a teacher out.
  if (!canManage) {
    return (
      <TeacherShell title="Capstone Sessions">
        <div className="mx-auto max-w-lg p-6 pt-16">
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <ShieldAlert className="h-6 w-6 text-muted-foreground" />
              </div>
              <CardTitle className="mb-1.5 text-base">Coordinator access required</CardTitle>
              <CardDescription className="max-w-sm">
                Only a department coordinator or an admin can open capstone sessions and assign
                groups. You can still see the groups you supervise or evaluate under Capstone.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell title="Capstone Sessions" subtitle="Open sessions, add groups, assign supervisors">
      <div className="p-4 sm:p-6">
        <SessionManagement />
      </div>
    </TeacherShell>
  );
}
