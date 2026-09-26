'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { InvitePersonForm, PendingInviteNote, type InvitedUser } from './InvitePersonForm';

interface Person {
  _id: string;
  name: string;
  email: string;
  invitePending?: boolean;
}

interface SupervisedGroup {
  _id: string;
  track: string;
  groupNumber: number;
  projectTitle: string;
  supervisorId: Person | string;
  evaluators: { evaluatorId: Person | string; unassignedAt?: string | null }[];
}

const idOf = (p: Person | string) => (typeof p === 'object' ? p._id : p);

function initials(name: string) {
  const words = name.split(/\s+/).filter((w) => w && !/^(dr|md|mr|mrs|ms|prof)\.?$/i.test(w));
  return (words.length ? words : name.split(/\s+/)).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
}

/**
 * Hands a group to a different supervisor. Searchable like the evaluator picker; the current
 * supervisor and the group's active evaluators are shown but can't be picked (the API would
 * reject them - one person can't mark the same student twice).
 */
export function ChangeSupervisorDialog({
  group,
  sessionId,
  users,
  allGroups,
  onClose,
  onInvited,
  onChanged,
}: {
  group: SupervisedGroup | null;
  sessionId: string;
  users: Person[];
  /** Every group in the session, to show how many groups each person already supervises. */
  allGroups: SupervisedGroup[];
  onClose: () => void;
  onInvited: (user: InvitedUser) => void;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of allGroups) counts.set(idOf(g.supervisorId), (counts.get(idOf(g.supervisorId)) || 0) + 1);
    return counts;
  }, [allGroups]);

  const currentId = group ? idOf(group.supervisorId) : '';
  const current = group ? (typeof group.supervisorId === 'object' ? group.supervisorId : users.find((u) => u._id === currentId)) : undefined;
  const evaluators = useMemo(
    () => new Set((group?.evaluators || []).filter((e) => !e.unassignedAt).map((e) => idOf(e.evaluatorId))),
    [group]
  );

  // Available people first; within that, alphabetical.
  const people = useMemo(() => {
    const blocked = (u: Person) => u._id === currentId || evaluators.has(u._id);
    return [...users].sort((a, b) => Number(blocked(a)) - Number(blocked(b)) || a.name.localeCompare(b.name));
  }, [users, currentId, evaluators]);

  const chosen = users.find((u) => u._id === selected);

  const close = () => {
    setSelected('');
    onClose();
  };

  const save = async () => {
    if (!group || !selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/capstone/groups/${group._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supervisorId: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change supervisor');
      toast.success(`${chosen?.name || 'The new supervisor'} now supervises this group`);
      setSelected('');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change supervisor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={group !== null} onOpenChange={(open) => !open && !saving && close()}>
      <DialogContent className="gap-4 sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle>Change supervisor</DialogTitle>
          <DialogDescription className="line-clamp-2 break-words">
            {group && (
              <>
                <span className="font-medium text-foreground">
                  Track {group.track} · Group {group.groupNumber}
                </span>
                {' — '}
                {group.projectTitle}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {group && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Now</span>
            <Badge variant="secondary" className="max-w-full truncate">{current?.name || '—'}</Badge>
          </div>
        )}

        <Command className="rounded-lg border" loop>
          <CommandInput placeholder="Search faculty by name or email…" />
          <CommandList className="max-h-[min(300px,40dvh)]">
            <CommandEmpty>No one matches. Invite them by email below.</CommandEmpty>
            {people.map((u) => {
              const isCurrent = u._id === currentId;
              const isEvaluator = evaluators.has(u._id);
              const count = load.get(u._id) || 0;
              return (
                <CommandItem
                  key={u._id}
                  value={`${u.name} ${u.email} ${u._id}`}
                  disabled={isCurrent || isEvaluator}
                  onSelect={() => setSelected(u._id)}
                  className={cn('cursor-pointer gap-3 px-2 py-2', selected === u._id && 'bg-primary/10 data-[selected=true]:bg-primary/15')}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      selected === u._id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {selected === u._id ? <Check className="h-4 w-4" /> : initials(u.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{u.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    {isCurrent ? (
                      <Badge variant="secondary" className="text-[10px]">Current</Badge>
                    ) : isEvaluator ? (
                      <Badge variant="secondary" className="text-[10px]" title="Remove them as this group's evaluator first">
                        Evaluator here
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-muted-foreground" title="Groups this person already supervises in this session">
                        {count === 0 ? 'No groups yet' : `Supervises ${count}`}
                      </span>
                    )}
                    {u.invitePending && <Badge variant="outline" className="text-[10px]">Invited</Badge>}
                  </span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>

        <PendingInviteNote sessionId={sessionId} role="supervisor" user={chosen} />
        <InvitePersonForm
          sessionId={sessionId}
          role="supervisor"
          onInvited={(user) => {
            onInvited(user);
            setSelected(user._id);
          }}
        />

        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          The new supervisor reviews journals and gives the supervisor marks from now on. Feedback and marks already
          given are kept; a previous supervisor&apos;s mark counts only until the new one marks that part.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!selected || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCog className="mr-2 h-4 w-4" />}
            {chosen ? `Make ${chosen.name} supervisor` : 'Choose someone'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
