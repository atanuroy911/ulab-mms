'use client';

import { useEffect, useState } from 'react';
import { Chrome, X } from 'lucide-react';
import { resolveExtensionId, URMS_EXTENSION_STORE_URL } from '@/lib/urmsExtensionImport';

const STORAGE_KEY = 'mms-chrome-extension-promo-dismissed';

export default function ChromeExtensionPromo() {
  // Default to hidden until the localStorage + extension-detection checks
  // resolve, to avoid a flash of the badge for users who don't need it.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (localStorage.getItem(STORAGE_KEY) === 'true') return;

    resolveExtensionId().then((id) => {
      if (!cancelled && !id) setVisible(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-6 z-40 hidden sm:flex items-center gap-1 rounded-full border bg-background/95 backdrop-blur shadow-lg p-1 animate-in fade-in slide-in-from-bottom-2 group">
      <a
        href={URMS_EXTENSION_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-0 rounded-full py-1.5 pl-1.5 pr-1.5 text-xs font-medium transition-all duration-300 ease-out group-hover:gap-2 group-hover:bg-muted group-hover:pl-2 group-hover:pr-3"
      >
        <Chrome className="h-4 w-4 text-blue-500 shrink-0" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 ease-out group-hover:max-w-[12rem] group-hover:opacity-100">
          Get our Chrome Extension
        </span>
      </a>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss Chrome extension promo"
        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
