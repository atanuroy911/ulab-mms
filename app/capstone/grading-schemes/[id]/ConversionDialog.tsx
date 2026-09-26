'use client';

import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface ConversionPreview {
  direction: 'toBlocks' | 'toFormula';
  /** The formula being converted (to blocks), or the one produced (to formula). */
  formula: string;
  ok: boolean;
  steps: string[];
  /** Checked on sample marks: the new version gives the same numbers. */
  verified: boolean;
  reason?: string;
  guidance?: string;
}

/**
 * Shows exactly what a formula <-> blocks conversion will do before it happens: the steps in
 * plain words, and whether the result was checked to be identical. Nothing changes until
 * "Replace" - and it can't be pressed if the check failed.
 */
export function ConversionDialog({
  preview,
  onCancel,
  onApply,
}: {
  preview: ConversionPreview | null;
  onCancel: () => void;
  onApply: () => void;
}) {
  const toBlocks = preview?.direction === 'toBlocks';
  const canApply = !!preview?.ok && preview.verified;
  return (
    <Dialog open={preview !== null} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{toBlocks ? 'Turn this formula into blocks' : 'Turn these blocks into a formula'}</DialogTitle>
          <DialogDescription>
            {toBlocks
              ? 'Each part of the formula becomes a block that reads as a plain step. Nothing changes until you press Replace.'
              : 'The selected block and the math blocks feeding only it become one formula. Marks and blocks used elsewhere stay as they are and become its inputs.'}
          </DialogDescription>
        </DialogHeader>

        {preview && (
          <div className="space-y-4">
            {toBlocks && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Formula</p>
                <code className="block rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">{preview.formula}</code>
              </div>
            )}

            {preview.ok ? (
              <>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">{toBlocks ? 'Becomes these steps, in order' : 'Result'}</p>
                  {toBlocks ? (
                    <ol className="space-y-1">
                      {preview.steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {i + 1}
                          </span>
                          {s}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <p>{preview.steps[0]}</p>
                      <code className="block rounded-md bg-muted px-3 py-2 font-mono text-sm break-all">{preview.steps[1]}</code>
                      {preview.steps.length > 2 && (
                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                          {preview.steps.slice(2).map((s) => (
                            <li key={s}>• {s}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                <p
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                    preview.verified ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {preview.verified ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  {preview.verified
                    ? 'Checked on 40 sets of sample marks: gives exactly the same result.'
                    : 'The check found a different result, so this conversion is blocked. Please report it.'}
                </p>
              </>
            ) : (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="flex items-start gap-2 font-medium">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {preview.reason}
                </p>
                {preview.guidance && <p className="text-muted-foreground">{preview.guidance}</p>}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel}>
            {canApply ? 'Cancel' : 'Close'}
          </Button>
          {preview?.ok && (
            <Button onClick={onApply} disabled={!canApply}>
              Replace
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
