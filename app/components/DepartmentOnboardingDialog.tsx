'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

interface DepartmentOption {
  _id: string;
  code: string;
  name: string;
}

/**
 * Blocks the teacher dashboard with a one-time "pick your department" prompt for any
 * signed-in teacher account that doesn't have one yet (existing accounts predate
 * departments; new accounts haven't set one at signup). Self-contained - drop it once near
 * the top of a page and it reads the session itself, so it doesn't need prop-threading.
 */
export default function DepartmentOnboardingDialog() {
  const { data: session, status, update } = useSession();
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isRealTeacherSession =
    status === 'authenticated' &&
    !!session?.user &&
    !(session.user as any).checkinOnly &&
    !(session.user as any).marksOnly &&
    !(session.user as any).projectOnly;

  const needsDepartment = isRealTeacherSession && !(session!.user as any).departmentId && !dismissed;

  useEffect(() => {
    if (!needsDepartment) return;
    fetch('/api/departments')
      .then((res) => res.json())
      .then((data) => setDepartments(Array.isArray(data) ? data : []))
      .catch((err) => console.error('Failed to load departments', err));
  }, [needsDepartment]);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/set-department', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departmentId: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to set department');

      toast.success('Department saved');
      // Forces the JWT callback to re-read the department immediately rather than waiting
      // for the periodic refresh (see app/api/auth/[...nextauth]/route.ts).
      await update();
      setDismissed(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set department');
    } finally {
      setSubmitting(false);
    }
  };

  if (!needsDepartment) return null;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-[420px]"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Select Your Department
          </DialogTitle>
          <DialogDescription>
            This is a one-time setup step. Your department determines which coordinator(s) can manage
            capstone sessions you're involved in.
          </DialogDescription>
        </DialogHeader>

        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a department" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!selected || submitting} className="w-full">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Continue'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
