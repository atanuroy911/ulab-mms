import {
  LayoutDashboard,
  BookOpen,
  FolderOpen,
  GraduationCap,
  Calendar,
  Users,
  ClipboardList,
  DatabaseBackup,
  Building2,
  Wrench,
  Workflow,
} from 'lucide-react';
import type { SidebarItem } from '@/app/components/AdminSidebar';

/**
 * The /admin panel's navigation. Shared so capstone pages opened from the admin panel (the
 * grading-scheme editor, the grades page) keep the admin navigation instead of switching to
 * the teacher sidebar, whose pages the admin login can't open.
 */
export const adminSidebarItems: SidebarItem[] = [
  {
    title: 'Overview',
    href: '/admin/dashboard?tab=overview',
    icon: LayoutDashboard,
  },
  {
    title: 'Account Manager',
    href: '/admin/dashboard?tab=accounts',
    icon: Users,
  },
  {
    title: 'Departments',
    href: '/admin/dashboard?tab=departments',
    icon: Building2,
  },
  {
    title: 'Course Management',
    href: '/admin/dashboard?tab=courses',
    icon: BookOpen,
  },
  {
    title: 'Resources',
    href: '/admin/dashboard?tab=resources',
    icon: FolderOpen,
  },
  {
    title: 'Semester Management',
    href: '/admin/dashboard?tab=semesters',
    icon: Calendar,
  },
  {
    title: 'Capstone Management',
    href: '/admin/dashboard?tab=capstone',
    icon: GraduationCap,
  },
  {
    title: 'Grading Schemes',
    href: '/admin/dashboard?tab=grading-schemes',
    icon: Workflow,
  },
  {
    title: 'Rubric Management',
    href: '/admin/dashboard?tab=rubrics',
    icon: ClipboardList,
  },
  {
    title: 'Backup & Restore',
    href: '/admin/dashboard?tab=backup',
    icon: DatabaseBackup,
  },
  {
    title: 'Developer Settings',
    href: '/admin/dashboard?tab=developer',
    icon: Wrench,
  },
];
