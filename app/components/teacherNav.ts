import { LayoutDashboard, Archive, FileStack, Settings } from 'lucide-react';
import type { SidebarItem } from '@/app/components/AdminSidebar';

export const teacherSidebarItems: SidebarItem[] = [
  { title: 'My Courses', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Archived', href: '/dashboard/archived', icon: Archive },
  { title: 'Resources', href: '/resources', icon: FileStack },
  { title: 'Settings', href: '/settings', icon: Settings },
];
