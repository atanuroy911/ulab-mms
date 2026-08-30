'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Save } from 'lucide-react';

interface ProjectCoMarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupLabel: string;
  numberOfCOs: number;
  /** Configured max marks per CO (course.coPoMapping.maxMarks['Project']), used to cap each input. */
  maxMarks?: number[];
  /** Total obtained marks (or weighted points) this group's CO marks should add up to. */
  targetTotal: number;
  targetUnit: 'marks' | '%';
  initialValues: number[];
  saving?: boolean;
  onSave: (values: number[]) => void | Promise<void>;
}

/** Evenly distributes `total` across `n` COs, respecting each CO's configured max (0/undefined =
 *  no cap). COs that would overflow their max are pinned to it and the leftover is re-spread
 *  across the remaining COs (classic "water-filling"), so a max never gets exceeded. */
export function distributeEvenly(total: number, n: number, maxMarks: number[] = []): number[] {
  const marks = new Array(n).fill(0);
  if (n <= 0 || total <= 0) return marks;

  const capped = new Array(n).fill(false);
  let remaining = total;

  for (let pass = 0; pass < n; pass++) {
    const active = marks.map((_, i) => i).filter(i => !capped[i]);
    if (active.length === 0) break;

    const evenShare = remaining / active.length;
    let anyNewlyCapped = false;

    for (const i of active) {
      const max = maxMarks[i];
      if (max !== undefined && max > 0 && evenShare > max) {
        marks[i] = max;
        capped[i] = true;
        remaining = Math.round((remaining - max) * 100) / 100;
        anyNewlyCapped = true;
      }
    }

    if (!anyNewlyCapped) {
      const share = Math.floor(evenShare * 100) / 100;
      active.forEach(i => { marks[i] = share; });
      // put the rounding remainder on the last active CO so the total exactly matches
      const usedSum = active.reduce((sum, i) => sum + marks[i], 0);
      const remainder = Math.round((remaining - usedSum) * 100) / 100;
      const lastActive = active[active.length - 1];
      marks[lastActive] = Math.round((marks[lastActive] + remainder) * 100) / 100;
      break;
    }
  }

  return marks;
}

/** Modular "distribute this group's obtained marks across its Course Outcomes" dialog, reused
 *  wherever a group's combined Project/OEL CO marks need to be entered. */
export default function ProjectCoMarksModal({
  isOpen,
  onClose,
  groupLabel,
  numberOfCOs,
  maxMarks = [],
  targetTotal,
  targetUnit,
  initialValues,
  saving = false,
  onSave,
}: ProjectCoMarksModalProps) {
  const [values, setValues] = useState<string[]>([]);
  const [autoDistribute, setAutoDistribute] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const seeded = Array.from({ length: numberOfCOs }, (_, i) => String(initialValues[i] ?? 0));
      const lastIdx = numberOfCOs - 1;
      if (lastIdx >= 0) {
        const sumOthers = seeded.slice(0, lastIdx).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
        const lastMax = maxMarks[lastIdx];
        let remaining = Math.max(0, Math.round((targetTotal - sumOthers) * 100) / 100);
        if (lastMax !== undefined && lastMax > 0 && remaining > lastMax) remaining = lastMax;
        seeded[lastIdx] = String(remaining);
      }
      setValues(seeded);
      setAutoDistribute(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, numberOfCOs, initialValues]);

  const total = values.reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const totalRounded = Math.round(total * 100) / 100;
  const targetRounded = Math.round(targetTotal * 100) / 100;
  const matchesTarget = totalRounded === targetRounded;
  const lastIndex = numberOfCOs - 1;

  const handleToggleAutoDistribute = (checked: boolean) => {
    setAutoDistribute(checked);
    if (checked) {
      setValues(distributeEvenly(targetTotal, numberOfCOs, maxMarks).map(String));
    }
  };

  const handleChange = (index: number, rawValue: string) => {
    const max = maxMarks[index];
    // Clamp manual entry to that CO's configured max, if any.
    const clampedValue = (() => {
      if (rawValue === '') return rawValue;
      const num = parseFloat(rawValue);
      if (isNaN(num)) return rawValue;
      return max !== undefined && max > 0 && num > max ? String(max) : rawValue;
    })();

    setValues(prev => {
      const next = prev.map((v, i) => (i === index ? clampedValue : v));
      // The last CO box auto-fills with whatever's left, so the total always matches the
      // obtained marks without the user having to compute the remainder by hand — capped at
      // its own configured max, same as every other CO.
      if (lastIndex >= 0 && index !== lastIndex) {
        const sumOthers = next
          .slice(0, lastIndex)
          .reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
        const lastMax = maxMarks[lastIndex];
        let remaining = Math.max(0, Math.round((targetTotal - sumOthers) * 100) / 100);
        if (lastMax !== undefined && lastMax > 0 && remaining > lastMax) remaining = lastMax;
        next[lastIndex] = String(remaining);
      }
      return next;
    });
  };

  const handleSave = () => {
    const parsed = values.map(v => (v === '' ? 0 : parseFloat(v) || 0));
    onSave(parsed);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Combined CO Marks — {groupLabel}</DialogTitle>
          <DialogDescription>
            Distribute this group&apos;s obtained {targetRounded} {targetUnit === 'marks' ? 'marks' : '%'} across each Course Outcome.
            Each CO is capped at its configured maximum. The last CO auto-fills with whatever&apos;s left.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={autoDistribute}
              onChange={(e) => handleToggleAutoDistribute(e.target.checked)}
            />
            Auto-distribute evenly across COs
          </label>

          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: numberOfCOs }).map((_, i) => (
              <div key={i}>
                <Label className="text-[10px] text-muted-foreground">
                  CO {i + 1}{maxMarks[i] ? ` (max ${maxMarks[i]})` : ''}
                </Label>
                <Input
                  type="number"
                  min="0"
                  max={maxMarks[i] || undefined}
                  step="0.1"
                  disabled={autoDistribute || i === lastIndex}
                  value={values[i] ?? ''}
                  onChange={(e) => handleChange(i, e.target.value)}
                  placeholder="0"
                  className="mt-1 h-8 text-center"
                />
              </div>
            ))}
          </div>

          <p className={`text-xs ${matchesTarget ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            Total: {totalRounded.toFixed(2)} / {targetRounded.toFixed(2)} {targetUnit === 'marks' ? 'marks' : '%'}
            {!matchesTarget && ' — should add up to the obtained total above'}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : 'Save CO Marks'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
