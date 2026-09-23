'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Menu, LucideIcon, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { openGlobalSearch } from '@/app/components/GlobalSearch';
import { useMediaQuery, BREAKPOINTS } from '@/lib/useMediaQuery';

export interface SidebarItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
  /** Optional group label — items sharing the same group string are rendered under one collapsible header */
  group?: string;
}

interface AdminSidebarProps {
  items: SidebarItem[];
  title?: string;
  collapsible?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}

/** The item whose href best matches the current path — exact match wins, otherwise the longest path-prefix match. */
function getActiveHref(items: SidebarItem[], pathname: string): string | null {
  let bestHref: string | null = null;
  let bestLength = -1;

  for (const item of items) {
    // Query-string hrefs (e.g. admin dashboard tabs) aren't reflected in usePathname()
    if (item.href.includes('?')) continue;

    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && item.href.length > bestLength) {
      bestHref = item.href;
      bestLength = item.href.length;
    }
  }

  return bestHref;
}

function NavItem({
  item,
  isOpen,
  isActive,
  onNavigate,
}: {
  item: SidebarItem;
  isOpen: boolean;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      key={item.href}
      href={item.href}
      onClick={onNavigate}
      // Collapsed, the rail shows icons only, so the accessible name has to come from
      // somewhere else - otherwise the nav is a column of unlabelled glyphs.
      title={!isOpen ? item.title : undefined}
      aria-label={!isOpen ? item.title : undefined}
    >
      <Button
        variant={isActive ? 'default' : 'ghost'}
        size="sm"
        className={`w-full h-11 ${isOpen ? 'justify-start' : 'justify-center px-0'}`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        {isOpen && (
          <div className="flex-1 flex items-center justify-between ml-2 min-w-0">
            <span className="font-medium truncate">{item.title}</span>
            {item.badge && (
              <Badge variant="secondary" className="ml-2 shrink-0">
                {item.badge}
              </Badge>
            )}
          </div>
        )}
      </Button>
    </Link>
  );
}

function GroupedNav({
  items,
  isOpen,
  pathname,
  onNavigate,
}: {
  items: SidebarItem[];
  isOpen: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const activeHref = getActiveHref(items, pathname);

  // Build ordered group structure while preserving item order
  const groups: { label: string | null; items: SidebarItem[] }[] = [];
  const seenGroups = new Map<string, number>();

  for (const item of items) {
    const groupLabel = item.group ?? null;
    const groupKey = groupLabel ?? `__ungrouped_${groups.length}`;

    if (groupLabel !== null && seenGroups.has(groupLabel)) {
      groups[seenGroups.get(groupLabel)!].items.push(item);
    } else {
      const idx = groups.length;
      groups.push({ label: groupLabel, items: [item] });
      if (groupLabel !== null) seenGroups.set(groupLabel, idx);
    }
  }

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {groups.map((group, gi) => {
        if (!group.label) {
          // Ungrouped items rendered directly
          return group.items.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              isOpen={isOpen}
              isActive={item.href === activeHref}
              onNavigate={onNavigate}
            />
          ));
        }

        const isCollapsed = collapsed[group.label] ?? false;

        return (
          <div key={group.label} className="space-y-0.5">
            {isOpen && (
              <button
                onClick={() => toggleGroup(group.label!)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
              >
                <span>{group.label}</span>
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                )}
              </button>
            )}
            {!isCollapsed && (
              <div className={isOpen ? 'ml-1 space-y-0.5' : 'space-y-0.5'}>
                {group.items.map((item) => (
                  <NavItem
                    key={item.href}
                    item={item}
                    isOpen={isOpen}
                    isActive={item.href === activeHref}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** The user's explicit open/closed choice for the desktop sidebar; null = follow the screen. */
let savedPreference: boolean | null = null;

export function AdminSidebar({
  items,
  title = 'Admin Portal',
  isOpen: controlledIsOpen,
  onToggle,
}: AdminSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Auto-collapse by width. Below md the sidebar is an off-canvas drawer; from md to xl
  // there is room for the icon rail but not for labels beside a content area that needs the
  // space (a course marks table, the grading canvas); from xl up it opens fully.
  const isWide = useMediaQuery(BREAKPOINTS.xl);

  // null = "follow the screen". Any explicit toggle pins the state until the breakpoint
  // itself changes, so a deliberate choice is respected while resizing still does the
  // sensible thing rather than stranding someone in a state they didn't pick.
  //
  // Every page renders its own sidebar, so the choice is kept in a module variable: it
  // survives client-side page changes (the sidebar doesn't spring back on each tab) but
  // resets on a full reload.
  const [userPreference, setUserPreferenceState] = useState<boolean | null>(savedPreference);
  const setUserPreference = (value: boolean | null) => {
    savedPreference = value;
    setUserPreferenceState(value);
  };

  // Reset only when the breakpoint actually changes - not on mount, which would throw away
  // the saved choice every time a page loads.
  const lastIsWide = useRef(isWide);
  useEffect(() => {
    if (lastIsWide.current === isWide) return;
    lastIsWide.current = isWide;
    setUserPreference(null);
  }, [isWide]);

  const autoIsOpen = userPreference ?? isWide;
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : autoIsOpen;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setUserPreference(!isOpen);
    }
  };

  return (
    <>
      {/* Mobile hamburger trigger */}
      <div className="md:hidden fixed top-3 left-3 z-40">
        <Button variant="outline" size="icon" className="h-10 w-10 bg-background shadow-sm" onClick={() => setMobileOpen(true)}>
          <Menu className="w-5 h-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </div>

      {/* Mobile off-canvas drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="px-3 pt-3">
            <SearchTrigger expanded onOpen={() => setMobileOpen(false)} />
          </div>
          <GroupedNav items={items} isOpen pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Static sidebar — desktop/tablet only */}
      <aside className={`hidden md:flex ${
        isOpen ? 'w-64' : 'w-16'
      } transition-all duration-300 border-r bg-card flex-col`}>
        <div className="h-16 flex items-center px-4 border-b shrink-0">
          <Button variant="ghost" size="sm" onClick={handleToggle} className="w-full justify-start">
            <Menu className="w-5 h-5 shrink-0" />
            {isOpen && <span className="ml-2 font-medium">{title}</span>}
          </Button>
        </div>
        <div className={isOpen ? 'px-3 pt-3' : 'flex justify-center pt-3'}>
          <SearchTrigger expanded={isOpen} />
        </div>
        <GroupedNav items={items} isOpen={isOpen} pathname={pathname} />
      </aside>
    </>
  );
}

/** Opens the global search (app/components/GlobalSearch.tsx) - the visible twin of Ctrl/Cmd+K. */
function SearchTrigger({ expanded, onOpen }: { expanded: boolean; onOpen?: () => void }) {
  const open = () => {
    onOpen?.();
    openGlobalSearch();
  };
  if (!expanded) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={open} title="Search (Ctrl+K)" aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      title="Search pages, courses, students and capstone groups"
      className="flex w-full items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px]">Ctrl K</kbd>
    </button>
  );
}
