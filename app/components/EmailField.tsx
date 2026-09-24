'use client';

import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const ULAB_DOMAIN = '@ulab.edu.bd';

/**
 * Whether the admin "allow any email domain" developer setting is on (public, from
 * /api/auth/settings). Defaults to false - the normal ULAB-only form - until known or on error.
 */
export function useAnyEmailDomain(): boolean {
  const [anyDomain, setAnyDomain] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => !cancelled && setAnyDomain(data?.devAllowAnyEmailDomain === true))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return anyDomain;
}

/** "jane" (+ULAB suffix) from whatever is typed or pasted - everything before an @. */
function localPart(value: string): string {
  return value.split('@')[0].trim();
}

interface Props {
  id: string;
  /** Always the full address ("jane@ulab.edu.bd"), whichever way it's shown. */
  value: string;
  onChange: (email: string) => void;
  /** Developer setting on: a plain email box for any domain. */
  anyDomain: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Show the envelope icon inside the box (sign-in/sign-up style). */
  withIcon?: boolean;
  invalid?: boolean;
  className?: string;
}

/**
 * Email input for teacher accounts. Normally only @ulab.edu.bd addresses are allowed, so the box
 * takes just the username with "@ulab.edu.bd" fixed beside it - nobody can type the wrong domain.
 * With the developer "any email domain" setting on it becomes an ordinary email box. The server
 * validates the domain either way; this only makes the rule visible.
 */
export function EmailField({ id, value, onChange, anyDomain, disabled, required, withIcon, invalid, className }: Props) {
  if (anyDomain) {
    return (
      <div className={cn('relative', className)}>
        {withIcon && <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
        <Input
          id={id}
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(withIcon && 'pl-9', invalid && 'border-destructive')}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        // Same look as components/ui/input, applied to the pair so they read as one field.
        'flex items-stretch overflow-hidden rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] dark:bg-input/30 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        invalid && 'border-destructive ring-destructive/20 dark:ring-destructive/40',
        disabled && 'opacity-50',
        className
      )}
    >
      <div className="relative flex-1">
        {withIcon && <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
        <input
          id={id}
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="yourname"
          // Shows only the username; a pasted or autofilled full address keeps its username.
          value={localPart(value)}
          onChange={(e) => {
            const local = localPart(e.target.value);
            onChange(local ? `${local}${ULAB_DOMAIN}` : '');
          }}
          required={required}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-domain`}
          className={cn(
            'h-9 w-full min-w-0 bg-transparent px-3 py-1 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm',
            withIcon && 'pl-9'
          )}
        />
      </div>
      <span
        id={`${id}-domain`}
        className="flex select-none items-center border-l bg-muted px-3 text-sm text-muted-foreground"
      >
        {ULAB_DOMAIN}
      </span>
    </div>
  );
}
