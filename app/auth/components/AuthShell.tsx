'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { Check } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import ChromeExtensionPromo from '@/components/ChromeExtensionPromo';

const TEACHER_FEATURES = [
  'Weighted grades with configurable rubrics',
  'Attendance tracking and CO-PO mapping',
  'One-tap OEL and capstone project marking',
];

const ADMIN_FEATURES = [
  'Course, semester, and account management',
  'System-wide backups and restore',
  'Capstone group and resource oversight',
];

type Variant = 'blue' | 'purple';

const VARIANT_STYLES: Record<Variant, { gradient: string; blobs: [string, string, string]; text: string; textMuted: string; textFooter: string }> = {
  blue: {
    gradient: 'from-blue-600 via-blue-700 to-cyan-600',
    blobs: ['bg-blue-500/20', 'bg-cyan-400/20', 'bg-purple-400/10'],
    text: 'text-blue-100',
    textMuted: 'text-blue-50/90',
    textFooter: 'text-blue-100/70',
  },
  purple: {
    gradient: 'from-purple-600 via-purple-700 to-pink-600',
    blobs: ['bg-purple-500/20', 'bg-pink-400/20', 'bg-blue-400/10'],
    text: 'text-purple-100',
    textMuted: 'text-purple-50/90',
    textFooter: 'text-purple-100/70',
  },
};

interface AuthShellProps {
  children: ReactNode;
  variant?: Variant;
  eyebrow?: string;
  title?: ReactNode;
  tagline?: string;
  features?: string[];
}

export function AuthShell({
  children,
  variant = 'blue',
  eyebrow,
  title = (
    <>
      Marks Management,
      <br />
      simplified.
    </>
  ),
  tagline = 'One place for grading, attendance, and capstone tracking — built for ULAB faculty.',
  features = TEACHER_FEATURES,
}: AuthShellProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div className="relative min-h-screen overflow-hidden bg-background lg:grid lg:grid-cols-2">
      {/* Ambient blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className={`absolute -top-24 -left-24 h-72 w-72 rounded-full ${styles.blobs[0]} blur-3xl motion-safe:animate-blob`} />
        <div className={`absolute top-1/3 -right-16 h-72 w-72 rounded-full ${styles.blobs[1]} blur-3xl motion-safe:animate-blob [animation-delay:2s]`} />
        <div className={`absolute -bottom-24 left-1/4 h-72 w-72 rounded-full ${styles.blobs[2]} blur-3xl motion-safe:animate-blob [animation-delay:4s]`} />
      </div>

      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <ChromeExtensionPromo />

      {/* Brand panel — desktop only */}
      <div className={`relative hidden overflow-hidden bg-gradient-to-br ${styles.gradient} p-12 text-white lg:flex lg:flex-col lg:justify-between`}>
        <div
          aria-hidden
          className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]"
        />
        <div className="relative animate-in fade-in slide-in-from-left-4 duration-700">
          <span className="inline-flex items-center justify-center rounded-2xl bg-white p-3 shadow-lg">
            <Image
              src="/ulab.svg"
              alt="ULAB Logo"
              width={72}
              height={72}
              priority
            />
          </span>
        </div>

        <div className="relative space-y-6 animate-in fade-in slide-in-from-left-4 duration-700 delay-150 fill-mode-backwards">
          {eyebrow && (
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              {eyebrow}
            </span>
          )}
          <h2 className="text-4xl font-bold leading-tight">{title}</h2>
          <p className={`max-w-sm text-lg ${styles.text}`}>{tagline}</p>
          <ul className="space-y-3 pt-4">
            {features.map((feature, i) => (
              <li
                key={feature}
                className={`flex items-start gap-3 text-sm ${styles.textMuted} animate-in fade-in slide-in-from-left-2 fill-mode-backwards`}
                style={{ animationDelay: `${350 + i * 100}ms`, animationDuration: '600ms' }}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Check className="h-3 w-3" />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className={`relative text-xs ${styles.textFooter}`}>University of Liberal Arts Bangladesh</p>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center p-4 sm:p-8">{children}</div>
    </div>
  );
}

export { TEACHER_FEATURES, ADMIN_FEATURES };
