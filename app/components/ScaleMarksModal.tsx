'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Exam {
  _id: string;
  displayName: string;
  totalMarks: number;
}

interface Mark {
  _id: string;
  examId: string;
}

interface ScaleMarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: Exam | null;
  marks: Mark[];
  onScaled: () => void | Promise<void>;
  /** Pre-fills "Scaling from" — e.g. the exam's previous total marks, when this modal is opened
   *  automatically after a total-marks change rather than from the column menu. */
  initialScaleFrom?: number;
}

/** Rescales every existing mark for one exam column from an old maximum to a new one — for when
 *  marks were entered against one total and the exam's total marks changed afterward. */
export default function ScaleMarksModal({ isOpen, onClose, exam, marks, onScaled, initialScaleFrom }: ScaleMarksModalProps) {
  const [scaleFrom, setScaleFrom] = useState('');
  const [scaleTo, setScaleTo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && exam) {
      setScaleFrom(initialScaleFrom !== undefined ? String(initialScaleFrom) : '');
      setScaleTo(String(exam.totalMarks));
    }
  }, [isOpen, exam, initialScaleFrom]);

  if (!exam) return null;

  const enteredCount = marks.filter(m => m.examId === exam._id).length;

  const handleScale = async () => {
    const fromNum = parseFloat(scaleFrom);
    const toNum = parseFloat(scaleTo);

    if (isNaN(fromNum) || fromNum <= 0) {
      toast.error('Enter the previous maximum marks (must be greater than 0)');
      return;
    }
    if (isNaN(toNum) || toNum <= 0) {
      toast.error('Enter the new maximum marks (must be greater than 0)');
      return;
    }
    if (fromNum === toNum) {
      toast.error('Scaling from and to are the same — nothing to change');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/exams/${exam._id}/scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scaleFrom: fromNum, scaleTo: toNum }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to scale marks');
      }
      toast.success(`Scaled ${data.updated ?? enteredCount} mark(s) from ${fromNum} to ${toNum}`);
      await onScaled();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'An error occurred while scaling marks');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            Scale Marks — {exam.displayName}
          </DialogTitle>
          <DialogDescription>
            Recalculates every existing mark in this column proportionally, e.g. if marks were entered out of 10 and the exam is now out of 20, a mark of 7 becomes 14.
            This only affects {exam.displayName} — {enteredCount} mark{enteredCount !== 1 ? 's' : ''} will be updated.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="scale-from" className="text-xs">Scaling from (previous max)</Label>
            <Input
              id="scale-from"
              type="number"
              min="0.01"
              step="0.01"
              value={scaleFrom}
              onChange={(e) => setScaleFrom(e.target.value)}
              placeholder="e.g. 10"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="scale-to" className="text-xs">Scaling to (new max)</Label>
            <Input
              id="scale-to"
              type="number"
              min="0.01"
              step="0.01"
              value={scaleTo}
              onChange={(e) => setScaleTo(e.target.value)}
              placeholder="e.g. 20"
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleScale} disabled={saving || enteredCount === 0}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeftRight className="mr-2 h-4 w-4" />}
            {saving ? 'Scaling...' : 'Scale Marks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
