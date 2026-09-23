'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query from React.
 *
 * Returns `false` on the server and on the first client render, then the real value after
 * hydration. That ordering matters: reading `window.matchMedia` during render would make the
 * server and client markup disagree and trip a hydration mismatch, so the first paint is
 * always the "not matching" branch and the effect corrects it immediately.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const list = window.matchMedia(query);
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Tailwind's breakpoints, so components don't hand-write pixel values that can drift. */
export const BREAKPOINTS = {
  md: '(min-width: 768px)',
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
} as const;
