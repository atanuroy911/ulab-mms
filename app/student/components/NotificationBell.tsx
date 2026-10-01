'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BookOpen, CheckCheck, ClipboardList, GraduationCap, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Item {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

const ICON: Record<string, typeof Bell> = { 'quick-exam': Zap, capstone: GraduationCap, journal: ClipboardList, project: Users, marks: BookOpen };

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d} d ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** The student's notifications - everything we also email, kept here for those without email. */
export function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState<{ unread: number; items: Item[] } | null>(null);
  const [open, setOpen] = useState(false);

  const load = () =>
    fetch('/api/student/notifications')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => undefined);
  useEffect(() => {
    load();
    // Light polling while the portal is open; new items are rare.
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, []);

  const mark = (body: Record<string, unknown>) =>
    fetch('/api/student/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);

  const openItem = async (n: Item) => {
    if (!n.read) {
      setData((d) => d && { unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) });
      await mark({ id: n.id });
    }
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  const unread = data?.unread ?? 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={async () => {
                setData((d) => d && { unread: 0, items: d.items.map((x) => ({ ...x, read: true })) });
                await mark({ all: true });
              }}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>
        <ul className="max-h-[60vh] divide-y overflow-y-auto">
          {(!data || data.items.length === 0) && <li className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</li>}
          {data?.items.map((n) => {
            const Icon = ICON[n.kind] || Bell;
            return (
              <li key={n.id}>
                <button type="button" onClick={() => openItem(n)} className={cn('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60', !n.read && 'bg-primary/5')}>
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm', !n.read && 'font-semibold')}>{n.title}</span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-muted-foreground">{ago(n.createdAt)}</span>
                  </span>
                  {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
