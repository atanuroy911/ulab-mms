'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, GripVertical, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { BLOCK_LIBRARY, LIBRARY_GROUPS, type LibraryItem } from './nodes';

/** The drag payload type the canvas accepts. */
export const LIBRARY_DRAG_TYPE = 'application/x-grading-block';

/**
 * Every block a scheme can be built from, grouped (Marks, Arithmetic, Rounding & limits, ...)
 * and searchable by name, description or everyday words ("percent", "cap", "average").
 * Click a block to add it where you are looking; drag it to place it exactly.
 */
export function BlockLibrary({
  onAdd,
  draggable = true,
  className,
}: {
  onAdd: (item: LibraryItem) => void;
  /** Off in the phone pop-up, where tapping is the only sensible way. */
  draggable?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (item: LibraryItem) => {
    if (!terms.length) return true;
    const hay = [item.title, item.description, item.group, ...item.keywords].join(' ').toLowerCase();
    return terms.every((t) => hay.includes(t));
  };

  const groups = useMemo(
    () => LIBRARY_GROUPS.map((g) => ({ group: g, items: BLOCK_LIBRARY.filter((i) => i.group === g && matches(i)) })).filter((g) => g.items.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query]
  );

  const toggle = (g: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search blocks - percent, round, cap…"
            className="h-9 pr-8 pl-8"
            aria-label="Search blocks"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {draggable && <p className="mt-2 text-[11px] text-muted-foreground">Click to add, or drag onto the canvas.</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No block matches “{query}”.</p>}
        {groups.map(({ group, items }) => {
          const open = terms.length > 0 || !collapsed.has(group);
          return (
            <section key={group} className="mb-1">
              <button
                type="button"
                onClick={() => toggle(group)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
                aria-expanded={open}
              >
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')} />
                {group}
                <span className="ml-auto font-normal normal-case">{items.length}</span>
              </button>
              {open && (
                <ul className="space-y-0.5 pb-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          draggable={draggable}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(LIBRARY_DRAG_TYPE, item.key);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          onClick={() => onAdd(item)}
                          title={item.description}
                          className="group flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
                        >
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium leading-tight">{item.title}</span>
                            <span className="line-clamp-2 text-[11px] text-muted-foreground">{item.description}</span>
                          </span>
                          {draggable && (
                            <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" aria-hidden />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
