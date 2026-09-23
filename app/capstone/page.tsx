'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, GraduationCap, Users, Settings } from 'lucide-react';
import { TeacherShell } from '@/app/components/TeacherShell';
import { toast } from 'sonner';

interface Member {
  studentAccountId: { _id: string; studentId: string; name: string } | string;
  removedAt?: string | null;
}

interface GroupRow {
  _id: string;
  track: 'A' | 'B' | 'C';
  groupNumber: number;
  projectTitle: string;
  members: Member[];
  sessionId: { _id: string; department: string; status: string } | string;
  supervisorId: string;
  evaluators: { evaluatorId: string; unassignedAt?: string | null }[];
}

export default function CapstonePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchGroups();
    }
  }, [status, router]);

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/capstone/groups/mine');
      const data = await res.json();
      if (res.ok) setGroups(data);
      else toast.error(data.error || 'Failed to load your capstone groups');
    } catch (err) {
      console.error(err);
      toast.error('Failed to load your capstone groups');
    } finally {
      setLoading(false);
    }
  };

  const roles = (session?.user as any)?.roles as string[] | undefined;
  const canManage = roles?.includes('admin') || roles?.includes('coordinator');
  const myId = session?.user?.id;

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <TeacherShell
      title="Capstone"
      subtitle="Groups you supervise or evaluate"
      actions={
        canManage ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/capstone/sessions">
              <Settings className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sessions</span>
            </Link>
          </Button>
        ) : null
      }
    >
      <div className="mx-auto max-w-5xl p-4 pt-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">My Capstone Groups</h2>
          <p className="text-muted-foreground">
            Groups where you're the supervisor or an assigned evaluator. Review weekly journals and submit marks.
          </p>
        </div>

        {groups.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              You are not currently assigned to any capstone group.
              {canManage && (
                <div className="mt-4">
                  <Button asChild variant="outline">
                    <Link href="/capstone/sessions">Manage Capstone Sessions</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((group) => {
              const activeMembers = group.members.filter((m) => !m.removedAt);
              const isSupervisor = String(group.supervisorId) === myId;
              const sessionInfo = typeof group.sessionId === 'object' ? group.sessionId : null;
              return (
                <Link key={group._id} href={`/capstone/groups/${group._id}`}>
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50 h-full">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{group.projectTitle}</CardTitle>
                        <Badge variant="outline">Track {group.track}</Badge>
                      </div>
                      <CardDescription className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {activeMembers.length} member(s) · {sessionInfo?.department}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Badge variant={isSupervisor ? 'default' : 'secondary'}>
                        {isSupervisor ? 'Supervisor' : 'Evaluator'}
                      </Badge>
                      {sessionInfo && (
                        <Badge variant="secondary" className="capitalize ml-2">{sessionInfo.status}</Badge>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
