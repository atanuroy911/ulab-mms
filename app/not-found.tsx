'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowRight, Compass, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openGlobalSearch } from '@/app/components/GlobalSearch';
import { useStaffViewer } from '@/app/components/useStaffViewer';
import { SEARCH_FEATURES, canSee, didYouMean } from '@/lib/searchFeatures';

/**
 * A page that doesn't exist - usually an old bookmark or a mistyped link. Instead of a dead
 * end, offer where the person most likely meant to go, from the words in the address.
 */
export default function NotFound() {
  const pathname = usePathname() || '';
  const { data: session } = useSession();
  const viewer = useStaffViewer();
  const student = !!(session?.user as { studentSession?: boolean } | undefined)?.studentSession;
  const staff = !student && (viewer.status === 'teacher' || viewer.status === 'webAdmin');
  const words = pathname.replace(/[^a-zA-Z0-9]+/g, ' ').replace(/\b[0-9a-f]{24}\b/g, ' ').trim();

  const suggestions = staff
    ? didYouMean(
        SEARCH_FEATURES.filter((f) =>
          canSee(f, {
            teacher: viewer.status === 'teacher',
            roles: viewer.status === 'teacher' || viewer.status === 'webAdmin' ? viewer.roles : [],
            adminPanel: viewer.status === 'webAdmin',
          })
        ),
        words
      ).filter((f) => f.href)
    : [];

  const home = student ? { href: '/student/dashboard', label: 'Go to the student portal' } : staff ? { href: viewer.status === 'webAdmin' ? '/admin/dashboard' : '/dashboard', label: 'Go to my dashboard' } : { href: '/', label: 'Go to the home page' };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Compass className="h-7 w-7 text-primary" />
        </span>
        <div>
          <h1 className="text-xl font-bold">This page isn&apos;t here</h1>
          <p className="mt-1 text-sm text-muted-foreground">The link may be old or mistyped.</p>
        </div>

        {suggestions.length > 0 && (
          <div className="text-left">
            <p className="mb-2 text-sm font-medium">Were you looking for…</p>
            <ul className="divide-y overflow-hidden rounded-lg border">
              {suggestions.map((f) => (
                <li key={f.id}>
                  <Link href={f.href!} className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/60">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{f.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{f.description}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button asChild size="lg">
            <Link href={home.href}>{home.label}</Link>
          </Button>
          {staff && (
            <Button variant="outline" size="lg" onClick={() => openGlobalSearch(words)}>
              <Search className="mr-2 h-4 w-4" /> Search for it
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
