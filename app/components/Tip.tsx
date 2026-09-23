'use client';

import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * A hover/focus tooltip for a single control: `<Tip label="Send a reminder"><Button …/></Tip>`.
 *
 * Carries its own provider so it works anywhere without app-level setup. A disabled button
 * swallows pointer events, so pass `disabledReason` and the tip is shown on a wrapper instead,
 * explaining why the control can't be used right now.
 */
export function Tip({
  label,
  children,
  side = 'top',
  disabledReason,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  disabledReason?: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {disabledReason ? <span className="inline-flex" tabIndex={0}>{children}</span> : children}
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs text-xs">
          {disabledReason || label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
