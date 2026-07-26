'use client';

import { useEffect, useState } from 'react';
import { Chrome, X } from 'lucide-react';

const STORAGE_KEY = 'mms-chrome-extension-promo-dismissed';
const EXTENSION_URL =
  'https://chromewebstore.google.com/detail/ulab-faculty-companion/ajpnbeaggcpfdidjpmlioakibolcfnho';

export default function ChromeExtensionPromo() {
  // Default to hidden until the localStorage check resolves, to avoid a
  // flash of the badge for users who already dismissed it.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== 'true') {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-6 z-40 flex items-center gap-1 rounded-full border bg-background/95 backdrop-blur shadow-lg pl-1 pr-1 py-1 animate-in fade-in slide-in-from-bottom-2">
      <a
        href={EXTENSION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-full pl-2 pr-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
      >
        <Chrome className="h-4 w-4 text-blue-500 shrink-0" />
        <span className="hidden sm:inline whitespace-nowrap">Get our Chrome Extension</span>
        <span className="sm:hidden">Extension</span>
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
