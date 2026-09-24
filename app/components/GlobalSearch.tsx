'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  BookOpen,
  GraduationCap,
  Users,
  CalendarRange,
  Workflow,
  UserCog,
  Settings,
  ShieldCheck,
  LifeBuoy,
  History,
  CornerDownLeft,
  Loader2,
  User,
} from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { useStaffViewer } from '@/app/components/useStaffViewer';
import { SEARCH_FEATURES, canSee, scoreFeature, type SearchFeature } from '@/lib/searchFeatures';

/**
 * System-wide search (Ctrl/Cmd+K, or the "Search" button in the sidebar/header).
 *
 * Two sources, both limited to what the viewer can actually open:
 *  - features: every page, section and action (lib/searchFeatures.ts), filtered by role;
 *  - records:  courses, students, capstone groups, sessions, schemes, accounts
 *              (/api/search, which scopes them server-side).
 * Typing a course section after a course ("cse101 marks") links straight into that section.
 *
 * Mounted once in the root layout. It stays inert for anyone who isn't staff - students on the
 * student portal, or signed-out visitors - so it never offers links they can't use.
 */

interface RecordResult {
  id: string;
  kind: 'course' | 'student' | 'group' | 'capstoneStudent' | 'session' | 'scheme' | 'user';
  title: string;
  subtitle: string;
  href: string;
}

/** Words that, typed after a course, jump into that section of the course page (?view=). */
const COURSE_SECTIONS: Record<string, { view: string; label: string }> = {
  overview: { view: 'overview', label: 'Overview' },
  exams: { view: 'exams', label: 'Exams' },
  exam: { view: 'exams', label: 'Exams' },
  students: { view: 'students', label: 'Students' },
  student: { view: 'students', label: 'Students' },
  marks: { view: 'marks', label: 'Marks' },
  mark: { view: 'marks', label: 'Marks' },
  attendance: { view: 'attendance', label: 'Attendance' },
  copo: { view: 'copo', label: 'CO-PO' },
  'co-po': { view: 'copo', label: 'CO-PO' },
  project: { view: 'project', label: 'Project' },
};

const KIND_META: Record<RecordResult['kind'], { group: string; icon: typeof BookOpen }> = {
  course: { group: 'Courses', icon: BookOpen },
  student: { group: 'Students in your courses', icon: User },
  group: { group: 'Capstone groups', icon: GraduationCap },
  capstoneStudent: { group: 'Capstone students', icon: Users },
  session: { group: 'Capstone sessions', icon: CalendarRange },
  scheme: { group: 'Grading schemes', icon: Workflow },
  user: { group: 'Accounts', icon: UserCog },
};

const FEATURE_ICON: Record<SearchFeature['group'], typeof BookOpen> = {
  Courses: BookOpen,
  Capstone: GraduationCap,
  Account: Settings,
  Administration: ShieldCheck,
  Help: LifeBuoy,
};

const RECENT_KEY = 'mms-search-recent';

interface Recent {
  title: string;
  subtitle?: string;
  href?: string;
  event?: string;
}

function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function rememberRecent(item: Recent) {
  try {
    const next = [item, ...readRecent().filter((r) => r.title !== item.title || r.href !== item.href)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private window etc.) - recents are only a convenience.
  }
}

/** Opens the search from anywhere, e.g. a "Search" button: `openGlobalSearch()`. */
export function openGlobalSearch() {
  window.dispatchEvent(new Event('open-global-search'));
}

export function GlobalSearch() {
  const router = useRouter();
  const { data: session } = useSession();
  const viewer = useStaffViewer();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<RecordResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);

  // Students (student portal / check-in sessions) and signed-out visitors get no search.
  const sessionUser = session?.user as
    | { checkinOnly?: boolean; marksOnly?: boolean; projectOnly?: boolean; studentSession?: boolean }
    | undefined;
  const studentOnly = !!(sessionUser?.checkinOnly || sessionUser?.marksOnly || sessionUser?.projectOnly || sessionUser?.studentSession);
  const enabled = !studentOnly && (viewer.status === 'teacher' || viewer.status === 'webAdmin');

  const searchViewer = useMemo(
    () => ({
      teacher: viewer.status === 'teacher',
      roles: viewer.status === 'teacher' || viewer.status === 'webAdmin' ? viewer.roles : [],
      adminPanel: viewer.status === 'webAdmin',
    }),
    [viewer]
  );

  // Ctrl/Cmd+K anywhere, plus the open event from Search buttons.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-global-search', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-global-search', onOpen);
    };
  }, [enabled]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setRecent(readRecent());
    else {
      setQuery('');
      setRecords([]);
    }
  };

  // Split a trailing/leading course-section word off the query: "cse101 marks".
  const { recordQuery, section } = useMemo(() => {
    const words = query.trim().split(/\s+/).filter(Boolean);
    const idx = words.findIndex((w) => COURSE_SECTIONS[w.toLowerCase()]);
    if (idx === -1 || words.length < 2) return { recordQuery: query.trim(), section: null };
    const found = COURSE_SECTIONS[words[idx].toLowerCase()];
    return { recordQuery: words.filter((_, i) => i !== idx).join(' '), section: found };
  }, [query]);

  // Debounced record search; stale responses are ignored.
  const requestId = useRef(0);
  useEffect(() => {
    if (!open) return;
    const q = recordQuery;
    const id = ++requestId.current;
    // Too short to search: nothing to fetch (and `shownRecords` hides stale results).
    if (q.length < 2) return;
    const timer = window.setTimeout(() => {
      setSearching(true);
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data) => {
          if (id === requestId.current) setRecords(data.results || []);
        })
        .catch(() => id === requestId.current && setRecords([]))
        .finally(() => id === requestId.current && setSearching(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [recordQuery, open]);

  const features = useMemo(() => {
    const visible = SEARCH_FEATURES.filter((f) => canSee(f, searchViewer));
    if (!query.trim()) return [];
    return visible
      .map((f) => ({ f, score: scoreFeature(f, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.f);
  }, [query, searchViewer]);

  // With nothing typed, offer the most useful places for this viewer.
  const suggestions = useMemo(() => {
    const ids = ['my-courses', 'capstone-mine', 'capstone-sessions', 'grading-schemes', 'add-course', 'settings', 'admin-accounts', 'report-bug'];
    return ids
      .map((id) => SEARCH_FEATURES.find((f) => f.id === id)!)
      .filter((f) => f && canSee(f, searchViewer))
      .slice(0, 6);
  }, [searchViewer]);

  // Results only count while they belong to a searchable query.
  const shownRecords = useMemo(() => (recordQuery.length >= 2 ? records : []), [recordQuery, records]);

  const recordGroups = useMemo(() => {
    const groups = new Map<string, RecordResult[]>();
    for (const r of shownRecords) {
      const target =
        r.kind === 'course' && section
          ? { ...r, title: `${r.title} → ${section.label}`, href: section.view === 'overview' ? r.href : `${r.href}?view=${section.view}` }
          : r;
      const name = KIND_META[r.kind].group;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(target);
    }
    return [...groups.entries()];
  }, [shownRecords, section]);

  const go = useCallback(
    (item: Recent) => {
      rememberRecent(item);
      setOpen(false);
      setQuery('');
      setRecords([]);
      if (item.event) window.dispatchEvent(new Event(item.event));
      else if (item.href) router.push(item.href);
    },
    [router]
  );

  if (!enabled) return null;

  const renderFeature = (f: SearchFeature) => (
    <ResultRow
      key={f.id}
      value={`feature-${f.id}`}
      icon={FEATURE_ICON[f.group]}
      title={f.title}
      subtitle={f.description}
      onSelect={() => go({ title: f.title, subtitle: f.description, href: f.href, event: f.event })}
    />
  );

  const hasQuery = query.trim().length > 0;
  const showSpinner = searching && recordQuery.length >= 2;
  const nothing = hasQuery && !showSpinner && features.length === 0 && shownRecords.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="top-[12vh] max-w-xl translate-y-0 gap-0 overflow-hidden rounded-xl border p-0 shadow-2xl"
        showCloseButton={false}
      >
        <VisuallyHidden>
          <DialogTitle>Search</DialogTitle>
        </VisuallyHidden>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]]:px-4 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-14 [&_[cmdk-input]]:text-base"
        >
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search pages, courses, students, groups…" />
          <CommandList className="max-h-[min(60vh,28rem)] pb-2">
            {nothing && (
              <CommandEmpty className="px-6 py-10 text-center">
                <p className="text-sm font-medium">No results for &ldquo;{query.trim()}&rdquo;</p>
                <p className="mt-1 text-xs text-muted-foreground">Try a course code, a student ID or a page name.</p>
              </CommandEmpty>
            )}

            {!hasQuery && recent.length > 0 && (
              <CommandGroup heading="Recent">
                {recent.map((r, i) => (
                  <ResultRow
                    key={`recent-${i}`}
                    value={`recent-${i}`}
                    icon={History}
                    title={r.title}
                    subtitle={r.subtitle}
                    onSelect={() => go(r)}
                  />
                ))}
              </CommandGroup>
            )}
            {!hasQuery && <CommandGroup heading="Quick links">{suggestions.map(renderFeature)}</CommandGroup>}

            {features.length > 0 && <CommandGroup heading="Pages & actions">{features.map(renderFeature)}</CommandGroup>}

            {recordGroups.map(([heading, items]) => (
              <CommandGroup key={heading} heading={heading}>
                {items.map((r) => (
                  <ResultRow
                    key={`${r.kind}-${r.id}`}
                    value={`${r.kind}-${r.id}`}
                    icon={KIND_META[r.kind].icon}
                    title={r.title}
                    subtitle={r.subtitle}
                    onSelect={() => go({ title: r.title, subtitle: r.subtitle, href: r.href })}
                  />
                ))}
              </CommandGroup>
            ))}

            {showSpinner && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            )}
          </CommandList>

          <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2.5 text-[11px] text-muted-foreground">
            <span className="hidden truncate sm:inline">
              Tip: <Kbd>cse101 marks</Kbd> jumps straight to a course section
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> move
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> open
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Esc</Kbd> close
              </span>
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** One result: an icon tile, a title over a muted subtitle, and an Enter hint when highlighted. */
function ResultRow({
  value,
  icon: Icon,
  title,
  subtitle,
  onSelect,
}: {
  value: string;
  icon: typeof BookOpen;
  title: string;
  subtitle?: string;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      className="group gap-3 rounded-lg px-2.5 py-2 aria-selected:bg-primary/10 aria-selected:text-foreground"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/50 text-muted-foreground transition-colors group-aria-selected:border-primary/30 group-aria-selected:bg-primary/15 group-aria-selected:text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-5">{title}</span>
        {subtitle && <span className="block truncate text-xs leading-4 text-muted-foreground">{subtitle}</span>}
      </span>
      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-aria-selected:opacity-100" />
    </CommandItem>
  );
}

/** A small keyboard-key chip for the footer hints. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-background px-1 font-mono text-[10px] font-medium text-foreground shadow-sm">
      {children}
    </kbd>
  );
}
