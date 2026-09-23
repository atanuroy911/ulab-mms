'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * A right-click menu anchored to a point on the grading canvas.
 *
 * Built by hand rather than with the shadcn dropdown: that component anchors to a trigger
 * element, and these menus need to open at arbitrary viewport coordinates (wherever the
 * pointer was) over a React Flow pane that owns its own event handling.
 */

export interface MenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** Rendered in the destructive colour and separated from the items above it. */
  destructive?: boolean;
  disabled?: boolean;
  /** Right-aligned hint, e.g. a keyboard shortcut. */
  hint?: string;
}

export interface MenuSection {
  key: string;
  label?: string;
  items: MenuItem[];
}

interface Props {
  x: number;
  y: number;
  sections: MenuSection[];
  onClose: () => void;
  header?: ReactNode;
}

const MENU_WIDTH = 216;
const ESTIMATED_ITEM_HEIGHT = 34;

export function CanvasContextMenu({ x, y, sections, onClose, header }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Pointerdown rather than click: React Flow starts a pane drag on pointerdown, so
    // waiting for click would leave the menu open while the canvas moves underneath it.
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    // Any scroll or zoom moves the canvas out from under the anchor point.
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  // Flip the menu back inside the viewport when the click was near an edge, so a
  // right-click on a node at the bottom of the screen doesn't open a menu you can't reach.
  const itemCount = sections.reduce((n, s) => n + s.items.length, 0);
  const estimatedHeight = itemCount * ESTIMATED_ITEM_HEIGHT + sections.length * 12 + (header ? 34 : 0);

  const left = typeof window !== 'undefined' && x + MENU_WIDTH > window.innerWidth - 8
    ? Math.max(8, x - MENU_WIDTH)
    : x;
  const top = typeof window !== 'undefined' && y + estimatedHeight > window.innerHeight - 8
    ? Math.max(8, window.innerHeight - estimatedHeight - 8)
    : y;

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left, top, width: MENU_WIDTH }}
      className="fixed z-50 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 duration-100"
      // The canvas has its own context handler; without this a right-click inside the menu
      // would close it and open a second one.
      onContextMenu={(e) => e.preventDefault()}
    >
      {header && (
        <div className="truncate border-b px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
          {header}
        </div>
      )}

      {sections.map((section, si) => (
        <div key={section.key}>
          {si > 0 && <div className="my-1 h-px bg-border" />}
          {section.label && (
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </div>
          )}
          {section.items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect();
                  onClose();
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-40 ${
                  item.destructive
                    ? 'text-destructive hover:bg-destructive/10'
                    : 'hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint && (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{item.hint}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
