'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Workflow, ArrowRight } from 'lucide-react';
import { TeacherShell } from '@/app/components/TeacherShell';
import { toast } from 'sonner';

interface SchemeRow {
  _id: string;
  name: string;
  description: string;
  department: string;
  track: 'A' | 'B' | 'C' | null;
  currentVersion: number;
  isArchived: boolean;
  updatedAt: string;
}

export default function GradingSchemesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [schemes, setSchemes] = useState<SchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [track, setTrack] = useState<string>('A');

  const user = session?.user as { roles?: string[]; coordinatorDepartments?: string[] } | undefined;
  const roles = user?.roles || [];
  const canCreate = roles.includes('admin') || roles.includes('coordinator');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    if (status !== 'authenticated') return;

    // Default the new-scheme department to the one this coordinator actually manages, so
    // the common case needs no thought.
    const dept = user?.coordinatorDepartments?.[0];
    if (dept) setDepartment(dept);

    (async () => {
      try {
        const res = await fetch('/api/capstone/grading-schemes');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setSchemes(data);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load grading schemes');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const create = async () => {
    if (!name.trim() || !department.trim()) {
      toast.error('A name and department are required');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/capstone/grading-schemes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), department: department.trim(), track }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      toast.success('Grading scheme created');
      router.push(`/capstone/grading-schemes/${data._id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <TeacherShell title="Grading Schemes" subtitle="How component marks become a final grade">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-xl text-sm text-muted-foreground">
            Build how component marks combine into a final grade, visually. Pin a published
            version to a capstone track to grade under it.
          </p>

          {canCreate && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-1.5 h-4 w-4" />
                  New scheme
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New grading scheme</DialogTitle>
                  <DialogDescription>
                    Starts from the CSE4098 arithmetic already documented for your department -
                    report 40%, presentation 45%, peer 5%, weekly journal 10% - which you can
                    then rearrange.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="scheme-name">Name</Label>
                    <Input
                      id="scheme-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="CSE4098A — Spring 2026"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="scheme-dept">Department</Label>
                      <Input
                        id="scheme-dept"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value.toUpperCase())}
                        placeholder="CSE"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Track</Label>
                      <Select value={track} onValueChange={setTrack}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">Capstone A</SelectItem>
                          <SelectItem value="B">Capstone B</SelectItem>
                          <SelectItem value="C">Capstone C</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={create} disabled={creating}>
                    {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Create & open
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {schemes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Workflow className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="mb-1.5 text-base">No grading schemes yet</CardTitle>
              <CardDescription className="max-w-sm">
                {canCreate
                  ? 'Create one to define how report, presentation, peer and journal marks add up to a final grade.'
                  : 'Your department coordinator has not published a grading scheme yet.'}
              </CardDescription>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {schemes.map((scheme) => (
              <Link key={scheme._id} href={`/capstone/grading-schemes/${scheme._id}`}>
                <Card className="group h-full transition-all hover:border-primary/50 hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight">{scheme.name}</CardTitle>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                    {scheme.description && (
                      <CardDescription className="line-clamp-2">{scheme.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-1.5 pt-0">
                    <Badge variant="outline">{scheme.department}</Badge>
                    {scheme.track && <Badge variant="outline">Capstone {scheme.track}</Badge>}
                    <Badge variant={scheme.currentVersion > 0 ? 'secondary' : 'outline'}>
                      {scheme.currentVersion > 0 ? `v${scheme.currentVersion}` : 'draft'}
                    </Badge>
                    {scheme.isArchived && <Badge variant="destructive">archived</Badge>}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
