'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Save, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface Exam {
  _id: string;
  displayName: string;
  examCategory?: string;
}

interface BulkRenameExamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  exams: Exam[];
  onRenamed: () => void | Promise<void>;
}

const CATEGORY_ORDER: { key: string; label: string }[] = [
  { key: 'MainExam', label: 'Main Exams' },
  { key: 'Quiz', label: 'Quizzes' },
  { key: 'Assignment', label: 'Assignments' },
  { key: 'Project', label: 'Project' },
  { key: 'ClassPerformance', label: 'Class Performance' },
  { key: 'Attendance', label: 'Attendance' },
  { key: 'Others', label: 'Others' },
];

export default function BulkRenameExamsModal({ isOpen, onClose, exams, onRenamed }: BulkRenameExamsModalProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      exams.forEach(exam => { initial[exam._id] = exam.displayName; });
      setDrafts(initial);
    }
  }, [isOpen, exams]);

  const groups = CATEGORY_ORDER
    .map(({ key, label }) => ({ key, label, exams: exams.filter(e => (e.examCategory || 'Others') === key) }))
    .filter(group => group.exams.length > 0);

  const changedExamIds = exams.filter(e => drafts[e._id] !== undefined && drafts[e._id].trim() !== e.displayName).length;

  const handleSaveAll = async () => {
    const toSave = exams.filter(e => drafts[e._id] !== undefined && drafts[e._id].trim() !== '' && drafts[e._id].trim() !== e.displayName);
    if (toSave.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const exam of toSave) {
        const response = await fetch(`/api/exams/${exam._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: drafts[exam._id].trim() }),
        });
        if (response.ok) successCount++;
        else failCount++;
      }

      if (successCount > 0) {
        toast.success(`Renamed ${successCount} exam${successCount !== 1 ? 's' : ''}`);
        await onRenamed();
      }
      if (failCount > 0) {
        toast.error(`${failCount} rename${failCount !== 1 ? 's' : ''} failed`);
      }
      if (failCount === 0) {
        onClose();
      }
    } catch (err) {
      console.error('Error bulk renaming exams:', err);
      toast.error('An error occurred while renaming exams');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Bulk Rename Exams
          </DialogTitle>
          <DialogDescription>
            Edit any exam names below, then save all changes at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {groups.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
              No exams yet.
            </div>
          ) : (
            groups.map(group => (
              <div key={group.key} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</div>
                {group.exams.map(exam => (
                  <Input
                    key={exam._id}
                    value={drafts[exam._id] ?? ''}
                    onChange={(e) => setDrafts(prev => ({ ...prev, [exam._id]: e.target.value }))}
                    className={drafts[exam._id]?.trim() !== exam.displayName ? 'border-primary/60' : ''}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveAll}
            disabled={saving || changedExamIds === 0}
            title={!saving && changedExamIds === 0 ? 'No exam names have been changed yet' : undefined}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : `Save ${changedExamIds > 0 ? `(${changedExamIds})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
