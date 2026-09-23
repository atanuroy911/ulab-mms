'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AtSign, Loader2, ExternalLink, PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import {
  resolveExtensionId,
  connectAndStartEmailSync,
  URMS_EXTENSION_STORE_URL,
  type ImportSession,
  type UrmsEmailSyncStatus,
} from '@/lib/urmsExtensionImport';

interface SyncEmailsButtonProps {
  courseId: string;
  studentIds: string[];
  onSynced?: () => void;
}

/**
 * Looks up every student's email from URMS via the ULAB Faculty Companion extension
 * (see lib/urmsExtensionImport.ts / background.js's 'mms-urms-emails' port) and persists
 * matches to their Student record. Beta, same as the URMS roster/grade-fill integrations.
 */
export default function SyncEmailsButton({ courseId, studentIds, onSynced }: SyncEmailsButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState<'checking' | 'installed' | 'missing'>('checking');
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'saving' | 'done'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ updated: number; received: number } | null>(null);
  const sessionRef = useRef<ImportSession | null>(null);

  const checkExtension = () => {
    setExtensionStatus('checking');
    resolveExtensionId().then((id) => {
      setExtensionStatus(id ? 'installed' : 'missing');
    });
  };

  const handleOpen = () => {
    setSyncState('idle');
    setProgress({ done: 0, total: 0 });
    setError('');
    setResult(null);
    setShowModal(true);
    checkExtension();
  };

  const handleClose = () => {
    sessionRef.current?.disconnect();
    sessionRef.current = null;
    setShowModal(false);
  };

  const handleStatus = async (status: UrmsEmailSyncStatus) => {
    if (status.type === 'EMAIL_SYNC_PROGRESS') {
      setProgress({ done: status.done, total: status.total });
    } else if (status.type === 'EMAIL_SYNC_ERROR') {
      setError(status.error);
      setSyncState('idle');
    } else if (status.type === 'EMAILS') {
      if (status.emails.length === 0) {
        setError('No emails were found for these students.');
        setSyncState('idle');
        return;
      }
      setSyncState('saving');
      try {
        const res = await fetch(`/api/courses/${courseId}/sync-emails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails: status.emails }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to save synced emails');
        setResult({ updated: data.updated, received: data.received });
        setSyncState('done');
        toast.success(`Synced ${data.updated} student email(s)`);
        onSynced?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save synced emails');
        setSyncState('idle');
      }
    }
  };

  const handleStart = () => {
    const id = extensionStatus === 'installed';
    if (!id) return;
    setError('');
    setSyncState('syncing');
    setProgress({ done: 0, total: studentIds.length });

    resolveExtensionId().then((extensionId) => {
      if (!extensionId) {
        setError('Extension not found');
        setSyncState('idle');
        return;
      }
      sessionRef.current = connectAndStartEmailSync(extensionId, studentIds, handleStatus, () => {
        sessionRef.current = null;
      });
    });
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={handleOpen}>
        <AtSign className="w-4 h-4" />
        Sync Emails
      </Button>

      <Dialog open={showModal} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AtSign className="w-5 h-5" />
              Sync Student Emails from URMS
            </DialogTitle>
            <DialogDescription>
              Beta feature — looks up each student's email from URMS using the ULAB Faculty Companion Chrome
              extension, and saves matches to their record. Emails are used for grade/account notifications.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {extensionStatus === 'checking' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking for the ULAB Faculty Companion extension...
            </div>
          )}

          {extensionStatus === 'missing' && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm text-muted-foreground">
                This feature needs the <strong>ULAB Faculty Companion</strong> Chrome extension installed.
              </p>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={URMS_EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Install Extension
                  </a>
                </Button>
                <Button variant="secondary" size="sm" onClick={checkExtension}>
                  I've installed it — check again
                </Button>
              </div>
            </div>
          )}

          {extensionStatus === 'installed' && (
            <div className="rounded-lg border p-3 space-y-3">
              {syncState === 'idle' && (
                <>
                  <p className="text-sm text-muted-foreground">
                    This will look up {studentIds.length} student(s) one by one using your existing URMS login. Make
                    sure you're logged in to URMS in this browser.
                  </p>
                  <Button onClick={handleStart} variant="outline" className="w-full" disabled={studentIds.length === 0}>
                    <PlugZap className="w-4 h-4 mr-2" />
                    Start Sync
                  </Button>
                </>
              )}

              {syncState === 'syncing' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Looking up {progress.done} / {progress.total || studentIds.length}...
                </div>
              )}

              {syncState === 'saving' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving synced emails...
                </div>
              )}

              {syncState === 'done' && result && (
                <div className="text-sm text-emerald-600 dark:text-emerald-400">
                  Synced {result.updated} of {result.received} looked-up email(s).
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
