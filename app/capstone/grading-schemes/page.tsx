'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useStaffViewer } from '@/app/components/useStaffViewer';
import { TeacherShell } from '@/app/components/TeacherShell';
import { GradingSchemesList } from './GradingSchemesList';

export default function GradingSchemesPage() {
  const viewer = useStaffViewer();
  const router = useRouter();


  useEffect(() => {
    if (viewer.status === 'none') router.push('/auth/signin');
    // The admin panel has this list as its own tab - links from shared capstone screens
    // (setup checklist, track panel) land here, so keep the web-admin inside its panel.
    if (viewer.status === 'webAdmin') router.replace('/admin/dashboard?tab=grading-schemes');
  }, [viewer.status, router]);

  if (viewer.status !== 'teacher') {
    return (
      <TeacherShell title="Grading Schemes">
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </TeacherShell>
    );
  }

  const canCreate = viewer.roles.includes('admin') || viewer.roles.includes('coordinator');
  return (
    <TeacherShell title="Grading Schemes" subtitle="How component marks become a final grade">
      <GradingSchemesList canCreate={canCreate} defaultDepartment={viewer.coordinatorDepartments[0] || ''} />
    </TeacherShell>
  );
}
