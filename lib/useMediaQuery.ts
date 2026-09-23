'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query from React.
 *
 * Uses useSyncExternalStore so the value is right on the FIRST render of any component that
 * mounts after the app has loaded (every client-side page change). The old useState+useEffect
 * version always rendered `false` first and corrected itself a frame later, which made the
 * sidebar visibly collapse and slide open again on every page.
 *
 * During hydration of a fresh page load React uses the server snapshot (`false`) so server
 * and client markup agree, then switches to the real value - so that one-time adjustment
 * only happens when someone first lands on the site.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && !!window.matchMedia ? window.matchMedia(query).matches : false),
    () => false
  );
}

/** Tailwind's breakpoints, so components don't hand-write pixel values that can drift. */
export const BREAKPOINTS = {
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
} as const;
