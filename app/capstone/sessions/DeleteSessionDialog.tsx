'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Preview {
  status: string;
  groups: number;
  students: number;
  marks: number;
  journalEntries: number;
  canForceDelete: boolean;
}

interface Props {
  /** The session to delete; null closes the dialog. */
  session: { _id: string; label: string } | null;
  onClose: () => void;
  onDeleted: (sessionId: string) => void;
}

const CONFIRM_WORD = 'DELETE';

/**
 * Deleting a session removes every group, journal entry and mark under it, with no undo.
 * The dialog shows the actual counts first and requires typing DELETE, so it can't be
 * confirmed by a stray click.
 */
export function DeleteSessionDialog({ session, onClose, onDeleted }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    setPreview(null);
    setTyped('');
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/capstone/sessions/${session._id}?deletePreview=1`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load session details');
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load session details');
        if (!cancelled) onClose();
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?._id]);

  const isClosed = preview?.status === 'closed';
  const blocked = isClosed && !preview?.canForceDelete;

  const handleDelete = async () => {
    if (!session) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/capstone/sessions/${session._id}${isClosed ? '?force=1' : ''}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete session');
      toast.success('Capstone session deleted');
      onDeleted(session._id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={session !== null} onOpenChange={(open) => !open && !deleting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete capstone session?
          </DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">{session?.label}</strong> and <strong>everything in it</strong> will
            be permanently deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {loading || !preview ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="mb-2 font-medium">This will delete:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>{preview.groups} group{preview.groups === 1 ? '' : 's'} ({preview.students} student{preview.students === 1 ? '' : 's'} enrolled)</li>
                <li>{preview.marks} submitted mark{preview.marks === 1 ? '' : 's'} (report, presentation, peer, journal)</li>
                <li>{preview.journalEntries} weekly journal entr{preview.journalEntries === 1 ? 'y' : 'ies'} and supervisor comments</li>
                <li>The session&apos;s track settings and grading scheme assignments</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Student accounts and grading schemes are kept - they can be reused by other sessions.
              </p>
            </div>

            {isClosed && (
              <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                {blocked
                  ? 'This session is closed and holds final results. Only an admin can delete it.'
                  : 'This session is closed and holds final results. Export the grades first if you need a record.'}
              </p>
            )}

            {!blocked && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-delete">
                  Type <strong>{CONFIRM_WORD}</strong> to confirm
                </Label>
                <Input
                  id="confirm-delete"
                  value={typed}
                  autoComplete="off"
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={deleting}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting || loading || !preview || blocked || typed.trim() !== CONFIRM_WORD}
          >
            {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Delete everything
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
