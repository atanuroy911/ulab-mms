'use client';

import { Wrench } from 'lucide-react';
import { useSession } from 'next-auth/react';
import type { SidebarItem } from '@/app/components/AdminSidebar';
import { teacherSidebarItems } from '@/app/components/teacherNav';

/**
 * The teacher sidebar for the signed-in user. Every teacher page used to pass the static
 * list itself, so role-specific entries (Developer Settings for admins) appeared on some pages
 * and silently vanished on others. Use this instead of `teacherSidebarItems` directly.
 */
export function useTeacherNavItems(): SidebarItem[] {
  const { data: session } = useSession();
  const roles = (session?.user as { roles?: string[] } | undefined)?.roles || [];
  return roles.includes('admin')
    ? [...teacherSidebarItems, { title: 'Developer Settings', href: '/dashboard/developer', icon: Wrench }]
    : teacherSidebarItems;
}
