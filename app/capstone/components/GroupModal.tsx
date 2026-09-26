'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

// The whole group view - loaded only when a group is first opened.
const GroupDetailView = dynamic(() => import('../groups/[id]/GroupDetailView').then((m) => m.GroupDetailView), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
});

/**
 * A group opened without leaving the page it was opened from (for coordinators working
 * through a session): a fixed header with the group's title and actions, and the tabs
 * scrolling beneath it. `onClosed` runs after closing, to refresh whatever may have changed.
 */
export function GroupModal({ groupId, tab = 'manage', onClosed }: { groupId: string | null; tab?: string; onClosed: () => void }) {
  return (
    <Dialog open={groupId !== null} onOpenChange={(open) => !open && onClosed()}>
      <DialogContent className="flex h-[94dvh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogTitle className="sr-only">Group details</DialogTitle>
        <DialogDescription className="sr-only">Journal, marks, report and management for this group</DialogDescription>
        {groupId && <GroupDetailView key={groupId} id={groupId} embedded initialTab={tab} />}
      </DialogContent>
    </Dialog>
  );
}
