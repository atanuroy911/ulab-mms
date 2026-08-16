'use client';

import { useRef, useState } from 'react';
import { DatabaseBackup, Download, Upload, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { notify } from '@/app/utils/notifications';

export default function BackupManagement() {
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch('/api/admin/backup');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create backup');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `ulab-mms-backup-${Date.now()}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      notify.success('Backup downloaded successfully');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to create backup');
    } finally {
      setDownloading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setConfirmOpen(true);
  };

  const handleConfirmRestore = async () => {
    if (!pendingFile) return;
    setRestoring(true);
    try {
      const text = await pendingFile.text();
      const response = await fetch('/api/admin/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to restore backup');
      }
      const collectionCount = Object.keys(data.restored || {}).length;
      notify.success(`Restore complete - ${collectionCount} collection${collectionCount !== 1 ? 's' : ''} restored`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to restore backup');
    } finally {
      setRestoring(false);
      setConfirmOpen(false);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Database Backup & Restore</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Backup
          </CardTitle>
          <CardDescription>
            Download a full snapshot of every collection in the database as a single EJSON file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleDownload} disabled={downloading}>
            {downloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing backup...
              </>
            ) : (
              <>
                <DatabaseBackup className="h-4 w-4" />
                Download Backup
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Restore
          </CardTitle>
          <CardDescription>
            Upload a backup file to restore the database. This overwrites the contents of every
            collection included in the file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Restoring is destructive and cannot be undone. All current data in the affected
              collections will be permanently replaced. Make sure you have a recent backup before
              proceeding.
            </AlertDescription>
          </Alert>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileSelect}
            disabled={restoring}
          />
          <Button
            variant="destructive"
            onClick={() => fileInputRef.current?.click()}
            disabled={restoring}
          >
            {restoring ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Restoring...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload Backup File
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(open) => !restoring && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Database Restore
            </DialogTitle>
            <DialogDescription>
              You are about to restore from &quot;{pendingFile?.name}&quot;. This will permanently
              overwrite the current contents of every collection included in this file. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={restoring}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleConfirmRestore} disabled={restoring}>
              {restoring ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Restoring...
                </>
              ) : (
                'Yes, Restore Database'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
