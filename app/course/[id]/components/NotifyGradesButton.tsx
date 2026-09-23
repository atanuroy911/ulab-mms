'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface NotifyGradesButtonProps {
  courseId: string;
}

/**
 * Emails every student in the course (who has an email on file) their current marks.
 * A deliberate, teacher-clicked action rather than an automatic trigger - see
 * app/api/courses/[id]/notify-grades/route.ts for why.
 */
export default function NotifyGradesButton({ courseId }: NotifyGradesButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/notify-grades`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to send emails');

      if (data.sent > 0) {
        toast.success(`Sent marks to ${data.sent} student(s)${data.skipped ? `, skipped ${data.skipped} (no email on file or no marks)` : ''}`);
      } else {
        toast.warning(data.message || 'No emails were sent — no students have an email on file yet.');
      }
      setShowConfirm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send emails');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setShowConfirm(true)}>
        <Mail className="w-4 h-4" />
        Notify Grades
      </Button>

      <Dialog open={showConfirm} onOpenChange={(open) => !sending && setShowConfirm(open)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Email current marks to students?</DialogTitle>
            <DialogDescription>
              Every student in this course who has an email on file (captured automatically the first time they
              sign in with Google, or synced from URMS) will receive an email with their current exam-by-exam
              marks. Students without an email on file are skipped.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Emails'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
