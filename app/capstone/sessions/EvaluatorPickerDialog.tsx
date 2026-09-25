'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, ShieldPlus } from 'lucide-react';
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

interface PickerGroup {
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
 * Picks an evaluator for one group. Searchable by name or email, shows how many groups each
 * person already evaluates this session (so the load can be spread), and rules out the
 * group's supervisor and anyone already on the group instead of letting the API reject them.
 */
export function EvaluatorPickerDialog({
  group,
  sessionId,
  users,
  allGroups,
  onClose,
  onInvited,
  onAssigned,
}: {
  group: PickerGroup | null;
  sessionId: string;
  users: Person[];
  /** Every group in the session, to count each person's evaluating load. */
  allGroups: PickerGroup[];
  onClose: () => void;
  onInvited: (user: InvitedUser) => void;
  onAssigned: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of allGroups) {
      for (const e of g.evaluators) {
        if (e.unassignedAt) continue;
        const id = idOf(e.evaluatorId);
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
    return counts;
  }, [allGroups]);

  const supervisorId = group ? idOf(group.supervisorId) : '';
  const assigned = useMemo(
    () => new Set((group?.evaluators || []).filter((e) => !e.unassignedAt).map((e) => idOf(e.evaluatorId))),
    [group]
  );
  const current = (group?.evaluators || [])
    .filter((e) => !e.unassignedAt)
    .map((e) => (typeof e.evaluatorId === 'object' ? e.evaluatorId : users.find((u) => u._id === e.evaluatorId)))
    .filter(Boolean) as Person[];
  const supervisor = group
    ? typeof group.supervisorId === 'object'
      ? group.supervisorId
      : users.find((u) => u._id === group.supervisorId)
    : undefined;

  // Available people first; within that, alphabetical.
  const people = useMemo(() => {
    const blocked = (u: Person) => u._id === supervisorId || assigned.has(u._id);
    return [...users].sort((a, b) => Number(blocked(a)) - Number(blocked(b)) || a.name.localeCompare(b.name));
  }, [users, supervisorId, assigned]);

  const chosen = users.find((u) => u._id === selected);

  const close = () => {
    setSelected('');
    onClose();
  };

  const assign = async () => {
    if (!group || !selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/capstone/groups/${group._id}/evaluators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluatorId: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign evaluator');
      toast.success(`${chosen?.name || 'Evaluator'} assigned`);
      setSelected('');
      onAssigned();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign evaluator');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={group !== null} onOpenChange={(open) => !open && !saving && close()}>
      <DialogContent className="gap-4 sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle>Assign evaluator</DialogTitle>
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
            <span className="text-muted-foreground">Supervisor</span>
            <Badge variant="secondary" className="max-w-full truncate">{supervisor?.name || '—'}</Badge>
            <span className="ml-1 text-muted-foreground">Evaluators</span>
            {current.length === 0 ? (
              <span className="text-muted-foreground">none yet</span>
            ) : (
              current.map((u) => (
                <Badge key={u._id} variant="outline" className="max-w-full truncate">
                  {u.name}
                </Badge>
              ))
            )}
          </div>
        )}

        <Command className="rounded-lg border" loop>
          <CommandInput placeholder="Search faculty by name or email…" />
          <CommandList className="max-h-[min(320px,45dvh)]">
            <CommandEmpty>No one matches. Invite them by email below.</CommandEmpty>
            {people.map((u) => {
              const isSupervisor = u._id === supervisorId;
              const isAssigned = assigned.has(u._id);
              const disabled = isSupervisor || isAssigned;
              const count = load.get(u._id) || 0;
              return (
                <CommandItem
                  key={u._id}
                  value={`${u.name} ${u.email} ${u._id}`}
                  disabled={disabled}
                  onSelect={() => setSelected(u._id)}
                  className={cn('gap-3 px-2 py-2', selected === u._id && 'bg-primary/10 data-[selected=true]:bg-primary/15')}
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
                    {isSupervisor ? (
                      <Badge variant="secondary" className="text-[10px]">Supervisor</Badge>
                    ) : isAssigned ? (
                      <Badge variant="secondary" className="text-[10px]">Assigned</Badge>
                    ) : (
                      <span
                        className="text-[11px] text-muted-foreground"
                        title="Groups this person already evaluates in this session"
                      >
                        {count === 0 ? 'No groups yet' : `${count} group${count === 1 ? '' : 's'}`}
                      </span>
                    )}
                    {u.invitePending && <Badge variant="outline" className="text-[10px]">Invited</Badge>}
                  </span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>

        {group && (
          <>
            <PendingInviteNote sessionId={sessionId} role="evaluator" projectTitle={group.projectTitle} user={chosen} />
            <InvitePersonForm
              sessionId={sessionId}
              role="evaluator"
              projectTitle={group.projectTitle}
              onInvited={(user) => {
                onInvited(user);
                setSelected(user._id);
              }}
            />
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={assign} disabled={!selected || saving} className="min-w-0">
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldPlus className="mr-1.5 h-4 w-4" />}
            <span className="truncate">{chosen ? `Assign ${chosen.name}` : 'Assign'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
