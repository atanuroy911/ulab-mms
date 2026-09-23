'use client';

import { useSession } from 'next-auth/react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { TeacherShell } from '@/app/components/TeacherShell';
import { DeveloperSettingsPanel } from '@/app/components/DeveloperSettingsPanel';
import { Card, CardContent } from '@/components/ui/card';

export default function DeveloperSettingsPage() {
  const { data: session, status } = useSession();
  const isAdminUser = ((session?.user as { roles?: string[] } | undefined)?.roles || []).includes('admin');

  if (status === 'loading') {
    return (
      <TeacherShell title="Developer Settings">
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </TeacherShell>
    );
  }

  return (
    <TeacherShell title="Developer Settings" subtitle="Testing switches - admin only">
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        {isAdminUser ? (
          <DeveloperSettingsPanel />
        ) : (
          <Card>
            <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
              <ShieldAlert className="h-5 w-5" />
              Developer settings are only available to accounts with the admin role.
            </CardContent>
          </Card>
        )}
      </div>
    </TeacherShell>
  );
}
