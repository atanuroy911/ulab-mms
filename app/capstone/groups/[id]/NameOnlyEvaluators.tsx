'use client';

import { useEffect, useState } from 'react';
import { Link2, Loader2, Trash2, UserRoundSearch } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tip } from '@/app/components/Tip';

interface Placeholder {
  id: string;
  label: string;
  marks: number;
  groupsInSession: number;
}

/**
 * Graders an imported workbook names only by initials. Their marks count as they are; the
 * coordinator can link a name to the real person (the marks become theirs) or remove it
 * (the marks stay on record but stop counting).
 */
export function NameOnlyEvaluators({
  groupId,
  staff,
  sessionFinished,
  onChanged,
}: {
  groupId: string;
  staff: Array<{ _id: string; name: string; email: string }>;
  sessionFinished: boolean;
  onChanged: () => void;
}) {
  const [data, setData] = useState<{ supervisorLabel: string | null; placeholders: Placeholder[] } | null>(null);
  const [person, setPerson] = useState<Record<string, string>>({});
  const [everywhere, setEverywhere] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Placeholder | null>(null);

  const load = () =>
    fetch(`/api/capstone/groups/${groupId}/placeholders`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => undefined);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const act = async (p: Placeholder, body: Record<string, unknown>) => {
    setBusy(p.id);
    try {
      const res = await fetch(`/api/capstone/groups/${groupId}/placeholders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeholderId: p.id, ...body }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Failed');
      if (body.action === 'remove') toast.success(`${p.label} removed - their marks are kept but no longer count`);
      else {
        const who = staff.find((s) => s._id === body.userId)?.name || 'them';
        toast.success(`${p.label} is now ${who} in ${out.linked} ${out.linked === 1 ? 'group' : 'groups'}`);
        for (const s of out.skipped || []) toast.warning(`Track ${s.track} #${s.groupNumber} not linked: ${s.reason}`);
      }
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(null);
      setConfirmRemove(null);
    }
  };

  if (!data || (data.placeholders.length === 0 && !data.supervisorLabel)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRoundSearch className="h-4 w-4" />
          Names from the imported workbook
        </CardTitle>
        <CardDescription>
          The workbook gives these graders by initials only. Their marks count as they are. Link a name to the real person to
          make the marks theirs, or remove it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.supervisorLabel && (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm">
            <span className="font-medium">Supervisor in the workbook: {data.supervisorLabel}</span>
            <span className="text-muted-foreground"> - set the real supervisor from the session&apos;s group list (Change supervisor).</span>
          </p>
        )}
        {data.placeholders.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <span className="flex h-10 min-w-10 items-center justify-center rounded-full bg-muted px-2 text-sm font-bold">{p.label}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Evaluator {p.label} · name only</p>
              <p className="text-xs text-muted-foreground">
                {p.marks} {p.marks === 1 ? 'mark' : 'marks'} here
                {p.groupsInSession > 1 && ` · also in ${p.groupsInSession - 1} other ${p.groupsInSession === 2 ? 'group' : 'groups'} this session`}
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <select
                aria-label={`Who is ${p.label}?`}
                value={person[p.id] || ''}
                onChange={(e) => setPerson((prev) => ({ ...prev, [p.id]: e.target.value }))}
                className="h-9 min-w-48 flex-1 rounded-md border bg-background px-2 text-sm"
                disabled={busy === p.id}
              >
                <option value="">Who is {p.label}?</option>
                {staff.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
              <Tip label={`Make ${p.label}'s marks this person's, and add them as an evaluator`}>
                <Button
                  size="sm"
                  className="h-9"
                  disabled={!person[p.id] || busy === p.id}
                  onClick={() => act(p, { action: 'link', userId: person[p.id], everywhere: p.groupsInSession > 1 && everywhere[p.id] !== false })}
                >
                  {busy === p.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Link2 className="mr-1.5 h-4 w-4" />}
                  Link
                </Button>
              </Tip>
              <Tip label={`Stop counting ${p.label}'s marks (they stay on record)`}>
                <Button size="sm" variant="ghost" className="h-9 text-destructive hover:text-destructive" disabled={busy === p.id} onClick={() => setConfirmRemove(p)}>
                  <Trash2 className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Remove</span>
                </Button>
              </Tip>
            </div>
            {p.groupsInSession > 1 && (
              <label className="flex w-full cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={everywhere[p.id] !== false}
                  onChange={(e) => setEverywhere((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                />
                Link {p.label} in all {p.groupsInSession} groups of this session
              </label>
            )}
          </div>
        ))}
      </CardContent>

      <Dialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {confirmRemove?.label} from this group?</DialogTitle>
            <DialogDescription>
              Their {confirmRemove?.marks} marks stay on record but stop counting, so this group&apos;s grades are recalculated from the
              other graders{sessionFinished ? ' - and this session is finished, so its published grades will change' : ''}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!!busy} onClick={() => confirmRemove && act(confirmRemove, { action: 'remove' })}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
