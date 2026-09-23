import {
  LayoutDashboard,
  Archive,
  FileStack,
  Settings,
  GraduationCap,
  Workflow,
  CalendarRange,
} from 'lucide-react';
import type { SidebarItem } from '@/app/components/AdminSidebar';

/**
 * The teacher-side navigation, grouped so Class and Capstone read as two areas of the app
 * rather than a flat list. Capstone's sub-pages are listed here (instead of only being
 * reachable from inside capstone) so a coordinator can jump straight to sessions or the
 * grading editor from anywhere.
 */
export const teacherSidebarItems: SidebarItem[] = [
  { title: 'My Courses', href: '/dashboard', icon: LayoutDashboard, group: 'Class' },
  { title: 'Archived', href: '/dashboard/archived', icon: Archive, group: 'Class' },

  { title: 'My Groups', href: '/capstone', icon: GraduationCap, group: 'Capstone' },
  { title: 'Sessions', href: '/capstone/sessions', icon: CalendarRange, group: 'Capstone' },
  { title: 'Grading Schemes', href: '/capstone/grading-schemes', icon: Workflow, group: 'Capstone' },

  { title: 'Resources', href: '/resources', icon: FileStack },
  { title: 'Settings', href: '/settings', icon: Settings },
];
