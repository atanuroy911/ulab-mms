'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, LogOut, Settings, LayoutDashboard, BookOpen, FolderOpen, GraduationCap, Calendar, Users, ClipboardList, DatabaseBackup } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AdminSidebar, SidebarItem } from '@/app/components/AdminSidebar';
import { notify } from '@/app/utils/notifications';
import OverviewSection from './components/OverviewSection';
import CourseManagement from './components/CourseManagement';
import ResourcesManager from './components/ResourcesManager';
import CapstoneManagement from './components/CapstoneManagement';
import SemesterManagement from './components/SemesterManagement';
import AccountManagement from './components/AccountManagement';
import RubricManagement from './components/RubricManagement';
import BackupManagement from './components/BackupManagement';

const sidebarItems: SidebarItem[] = [
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
    title: 'Rubric Management',
    href: '/admin/dashboard?tab=rubrics',
    icon: ClipboardList,
  },
  {
    title: 'Backup & Restore',
    href: '/admin/dashboard?tab=backup',
    icon: DatabaseBackup,
  },
];

function AdminDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    checkAuth();
  }, [router]);

  useEffect(() => {
    const tab = searchParams.get('tab') || 'overview';
    setActiveTab(tab);
  }, [searchParams]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/admin/verify');
      if (response.ok) {
        setAuthenticated(true);
      } else {
        router.push('/admin/signin');
      }
    } catch (err) {
      router.push('/admin/signin');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/admin/signout', { method: 'POST' });
      notify.auth.signOutSuccess();
      router.push('/admin/signin');
    } catch (err) {
      console.error('Sign out error:', err);
      notify.error('Failed to sign out');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <div className="h-dvh flex overflow-hidden">
      {/* Sidebar */}
      <AdminSidebar items={sidebarItems} title="Admin Portal" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation Bar */}
        <nav className="border-b bg-background sticky top-0 z-30">
          <div className="h-16 flex items-center justify-between gap-3 px-4 sm:px-6 pl-16 md:pl-6">
            <div className="flex items-center gap-3 min-w-0">
              <Image
                src="/ulab.svg"
                alt="ULAB Logo"
                width={36}
                height={36}
                className="drop-shadow-lg shrink-0"
              />
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold truncate">Admin Dashboard</h1>
                <p className="text-xs text-muted-foreground truncate">Marks Management System</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <ThemeToggle />
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/settings">
                  <Settings className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Settings</span>
                </Link>
              </Button>
              <Button variant="destructive" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </nav>

        {/* Content Area */}
        <main className="flex-1 p-6 overflow-auto">
          {activeTab === 'overview' && <OverviewSection />}
          {activeTab === 'accounts' && <AccountManagement />}
          {activeTab === 'courses' && <CourseManagement />}
          {activeTab === 'resources' && <ResourcesManager />}
          {activeTab === 'semesters' && <SemesterManagement />}
          {activeTab === 'capstone' && <CapstoneManagement />}
          {activeTab === 'rubrics' && <RubricManagement />}
          {activeTab === 'backup' && <BackupManagement />}
        </main>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/admin/verify');
        if (response.ok) {
          setAuthenticated(true);
        } else {
          router.push('/admin/signin');
        }
      } catch (err) {
        router.push('/admin/signin');
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <AdminDashboardContent />
    </Suspense>
  );
}
