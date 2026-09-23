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

  const renderFeature = (f: SearchFeature) => {
    const Icon = FEATURE_ICON[f.group];
    return (
      <CommandItem
        key={f.id}
        value={`feature-${f.id}`}
        onSelect={() => go({ title: f.title, subtitle: f.description, href: f.href, event: f.event })}
      >
        <Icon className="text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{f.title}</div>
          <div className="truncate text-xs text-muted-foreground">{f.description}</div>
        </div>
      </CommandItem>
    );
  };

  const hasQuery = query.trim().length > 0;
  const showSpinner = searching && recordQuery.length >= 2;
  const nothing = hasQuery && !showSpinner && features.length === 0 && shownRecords.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="top-[12vh] max-w-xl translate-y-0 overflow-hidden p-0 shadow-lg" showCloseButton={false}>
        <VisuallyHidden>
          <DialogTitle>Search</DialogTitle>
        </VisuallyHidden>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search courses, students, capstone groups, settings…"
          />
          <CommandList className="max-h-[60vh]">
            {nothing && <CommandEmpty>No matches. Try a course code, a student ID or a page name.</CommandEmpty>}

            {!hasQuery && recent.length > 0 && (
              <CommandGroup heading="Recent">
                {recent.map((r, i) => (
                  <CommandItem key={`recent-${i}`} value={`recent-${i}`} onSelect={() => go(r)}>
                    <History className="text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{r.title}</div>
                      {r.subtitle && <div className="truncate text-xs text-muted-foreground">{r.subtitle}</div>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!hasQuery && (
              <CommandGroup heading="Go to">{suggestions.map(renderFeature)}</CommandGroup>
            )}

            {features.length > 0 && <CommandGroup heading="Pages & actions">{features.map(renderFeature)}</CommandGroup>}

            {recordGroups.map(([heading, items]) => (
              <CommandGroup key={heading} heading={heading}>
                {items.map((r) => {
                  const Icon = KIND_META[r.kind].icon;
                  return (
                    <CommandItem
                      key={`${r.kind}-${r.id}`}
                      value={`${r.kind}-${r.id}`}
                      onSelect={() => go({ title: r.title, subtitle: r.subtitle, href: r.href })}
                    >
                      <Icon className="text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{r.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.subtitle}</div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}

            {showSpinner && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            )}
          </CommandList>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
            <span>
              Tip: add a section after a course, e.g. <span className="font-mono">cse101 marks</span>
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" /> open · Esc close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
