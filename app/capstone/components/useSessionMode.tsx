'use client';

import { useSyncExternalStore } from 'react';
import { Tip } from '@/app/components/Tip';
import { cn } from '@/lib/utils';

// One Simple/Advanced choice for every capstone session screen (the session, Enter marks,
// Grades), remembered on this device - so Simple stays Simple wherever it leads.

export type SessionMode = 'simple' | 'advanced';
const KEY = 'capstone-session-mode';
const EVENT = 'capstone-session-mode';

function read(): SessionMode {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(KEY) === 'advanced' ? 'advanced' : 'simple';
  } catch {
    return 'simple';
  }
}

function subscribe(onChange: () => void) {
  // Another tab, or another screen on this one, changed it.
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useSessionMode(): [SessionMode, (m: SessionMode) => void] {
  // The server can't see the device's choice, so it renders Simple; the browser then uses the saved one.
  const mode = useSyncExternalStore(subscribe, read, () => 'simple' as SessionMode);
  const setMode = (m: SessionMode) => {
    try {
      window.localStorage.setItem(KEY, m);
    } catch {
      /* not remembered */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [mode, setMode];
}

export function SessionModeToggle({ mode, onChange }: { mode: SessionMode; onChange: (m: SessionMode) => void }) {
  return (
    <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="View">
      {(
        [
          ['simple', 'Simple', 'The essentials, step by step'],
          ['advanced', 'Advanced', 'Everything at once, with every tool'],
        ] as const
      ).map(([m, label, hint]) => (
        <Tip key={m} label={hint}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => onChange(m)}
            className={cn('rounded-md px-3 py-1 text-sm transition-colors', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {label}
          </button>
        </Tip>
      ))}
    </div>
  );
}
