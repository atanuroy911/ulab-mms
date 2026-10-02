'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/** How far down a page has to be scrolled before the button shows. */
const SHOW_AFTER_PX = 400;

/**
 * "Back to top", stacked just above the site-wide bug-report button (BugReportButton: fixed
 * bottom-6 right-6, 48px). Some pages scroll the window, others an inner panel (the teacher
 * dashboard's main area), so it follows whichever element was scrolled last and scrolls that.
 */
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  const target = useRef<Element | Window | null>(null);

  useEffect(() => {
    const onScroll = (e: Event) => {
      const el = e.target;
      const isDoc = el === document || el === document.documentElement || el === document.body;
      const top = isDoc ? window.scrollY : (el as Element).scrollTop;
      // A small scrolling list (a dropdown, a dialog) isn't "the page".
      if (!isDoc && (el as Element).clientHeight < window.innerHeight * 0.5) return;
      target.current = isDoc ? window : (el as Element);
      setVisible(top > SHOW_AFTER_PX);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  const toTop = () => {
    const t = target.current || window;
    t.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      title="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={cn(
        // Centred over the 48px bug button: right-6 + 4px, and 12px above it.
        'fixed bottom-[5.25rem] right-7 z-50 flex h-10 w-10 items-center justify-center rounded-full border bg-background/95 text-foreground shadow-lg backdrop-blur transition-all duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
      )}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
