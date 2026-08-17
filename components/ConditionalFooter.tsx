'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// Auth pages show their own "Made at ULAB..." credit line inside the brand
// panel instead — showing the global footer there too would duplicate it
// below the fold.
const HIDDEN_ON = ['/auth/signin', '/auth/signup', '/admin/signin'];

export default function ConditionalFooter({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (HIDDEN_ON.includes(pathname)) return null;
  return <>{children}</>;
}
