'use client';

import Image from 'next/image';
import Link from 'next/link';
import { GraduationCap, Users, ChevronRight } from 'lucide-react';
import { AuthShell } from '@/app/auth/components/AuthShell';

/**
 * The landing page is the first of the three sign-in surfaces, so it is built on the same
 * AuthShell as /auth/signin and /student/signin rather than having its own hero layout.
 * Same brand panel, same right-hand column, same spacing - the only difference is that this
 * one asks which of the two portals you want instead of taking credentials.
 */

const CHOICES = [
  {
    href: '/auth/signin',
    icon: Users,
    eyebrow: 'Faculty',
    title: 'Teachers & Staff',
    description:
      'Manage courses, mark attendance, run exams, and oversee capstone sessions. Includes coordinator and admin tools.',
    // Tailwind needs whole class names at build time, so these are written out rather than
    // interpolated from a colour token.
    iconWrap: 'bg-blue-500/10 ring-blue-500/20',
    iconColor: 'text-blue-500',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20',
    hoverBorder: 'hover:border-blue-500/50',
    chevron: 'text-blue-500',
  },
  {
    href: '/student/signin',
    icon: GraduationCap,
    eyebrow: 'Student Login',
    title: 'Students',
    description:
      'Check your marks and attendance, submit weekly capstone journal entries, and track your project.',
    iconWrap: 'bg-emerald-500/10 ring-emerald-500/20',
    iconColor: 'text-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
    hoverBorder: 'hover:border-emerald-500/50',
    chevron: 'text-emerald-500',
  },
];

export default function Home() {
  return (
    <AuthShell
      eyebrow="ULAB MMS"
      tagline="One place for grading, attendance, and capstone tracking — for ULAB faculty and students."
    >
      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Logo and title — the brand panel covers this from lg up, matching the sign-in pages. */}
        <div className="space-y-4 text-center lg:hidden">
          <div className="flex justify-center">
            <Image src="/ulab.svg" alt="ULAB Logo" width={90} height={90} priority />
          </div>
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome</h1>
          <p className="text-sm text-muted-foreground">
            Choose how you&apos;d like to sign in.
          </p>
        </div>

        <div className="space-y-3">
          {CHOICES.map((choice) => {
            const Icon = choice.icon;
            return (
              <Link
                key={choice.href}
                href={choice.href}
                className={`group flex items-start gap-4 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${choice.hoverBorder}`}
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ${choice.iconWrap}`}
                >
                  <Icon className={`h-6 w-6 ${choice.iconColor}`} />
                </span>

                <div className="min-w-0 flex-1">
                  <span
                    className={`mb-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${choice.badge}`}
                  >
                    {choice.eyebrow}
                  </span>
                  <h2 className="text-base font-bold leading-tight">{choice.title}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {choice.description}
                  </p>
                </div>

                <ChevronRight
                  className={`mt-1 h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5 ${choice.chevron}`}
                />
              </Link>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Sign in with your <strong>@ulab.edu.bd</strong> Google account.
        </p>

        {/* Mirrors the footer the brand panel shows on desktop, so small screens still get it. */}
        <div className="space-y-0.5 text-center text-[11px] text-muted-foreground/70 lg:hidden">
          <p>University of Liberal Arts Bangladesh</p>
          <p>Made at ULAB by Atanu Roy and Kaviul Hossain</p>
        </div>
      </div>
    </AuthShell>
  );
}
