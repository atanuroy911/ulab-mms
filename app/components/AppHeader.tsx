'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';

export interface AppHeaderAction {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary' | 'ghost';
  /** Keep the label visible even on small screens (icon-only is the default below sm). */
  alwaysShowLabel?: boolean;
}

interface AppHeaderProps {
  /** Main title text. */
  title: string;
  /** Small text under the title — plain text or custom markup (badges, etc.). */
  subtitle?: ReactNode;
  /** Optional icon rendered in a badge next to the title (e.g. course type icon). */
  icon?: LucideIcon;
  /** Where the logo mark links to. Defaults to the signed-in dashboard. */
  logoHref?: string;
  /** Apply the brand gradient treatment to the title text. */
  gradient?: 'blue' | 'purple' | 'none';
  /** Right-aligned action buttons, rendered after the theme toggle. */
  actions?: AppHeaderAction[];
  /** Fully custom content appended at the end of the action row (dropdowns, menus, etc.). */
  extra?: ReactNode;
  /** Additional content rendered as a second row inside the header (e.g. mobile tab switcher). */
  bottomBar?: ReactNode;
}

const GRADIENT_CLASSES: Record<NonNullable<AppHeaderProps['gradient']>, string> = {
  blue: 'bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent',
  purple: 'bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent',
  none: '',
};

export function AppHeader({
  title,
  subtitle,
  icon: Icon,
  logoHref = '/dashboard',
  gradient = 'none',
  actions = [],
  extra,
  bottomBar,
}: AppHeaderProps) {
  return (
    <div className="sticky top-0 z-50">
      <nav className="border-b bg-background/75 backdrop-blur-xl supports-backdrop-filter:bg-background/60">
        <div className="max-w-7xl mx-auto px-3 sm:px-4">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link href={logoHref} className="shrink-0 group">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15 transition-colors group-hover:bg-primary/15">
                  <Image
                    src="/ulab.svg"
                    alt="ULAB Logo"
                    width={26}
                    height={26}
                    className="h-6 w-6 shrink-0"
                  />
                </span>
              </Link>
              <div className="min-w-0">
                <h1 className="flex items-center gap-1.5 text-base sm:text-lg font-bold leading-tight truncate">
                  {Icon && <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />}
                  <span className={cn('truncate', GRADIENT_CLASSES[gradient])}>{title}</span>
                </h1>
                {subtitle && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <ThemeToggle />
              {actions.map(({ key, label, icon: ActionIcon, href, onClick, variant = 'outline', alwaysShowLabel }) => {
                const content = (
                  <>
                    <ActionIcon className={cn('h-4 w-4', alwaysShowLabel ? 'mr-2' : 'sm:mr-2')} />
                    <span className={alwaysShowLabel ? 'inline' : 'hidden sm:inline'}>{label}</span>
                  </>
                );
                return href ? (
                  <Button key={key} variant={variant} size="sm" asChild>
                    <Link href={href}>{content}</Link>
                  </Button>
                ) : (
                  <Button key={key} variant={variant} size="sm" onClick={onClick}>
                    {content}
                  </Button>
                );
              })}
              {extra}
            </div>
          </div>
        </div>
      </nav>
      {bottomBar}
    </div>
  );
}
