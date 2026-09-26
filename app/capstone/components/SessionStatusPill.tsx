'use client';

import { Tip } from '@/app/components/Tip';
import { cn } from '@/lib/utils';
import { STATUS_HINT, STATUS_TONE, statusLabel, type SessionStatus } from '@/lib/capstoneStatus';

/** A session's status in plain words, with what it means on hover. */
export function SessionStatusPill({ status, className }: { status: string; className?: string }) {
  const s = status as SessionStatus;
  return (
    <Tip label={STATUS_HINT[s] || status}>
      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_TONE[s] || 'bg-muted', className)}>
        {statusLabel(status)}
      </span>
    </Tip>
  );
}
