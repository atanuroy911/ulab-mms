'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ClipboardList, GraduationCap, LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function StudentDashboardPage() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/75 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4">
          <div className="h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
                <Image src="/ulab.svg" alt="ULAB Logo" width={26} height={26} />
              </span>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold truncate">Student Dashboard</h1>
                <p className="text-xs text-muted-foreground truncate">{session?.user?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: '/student/signin' })}>
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto p-4 pt-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Welcome{session?.user?.name ? `, ${session.user.name.split(' (')[0]}` : ''}</h2>
          <p className="text-muted-foreground">What would you like to do?</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/student/check-marks">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50 h-full">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <ClipboardList className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Check Marks</CardTitle>
                <CardDescription>View your marks and attendance across all your courses</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/student/dashboard/capstone">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-primary/50 h-full">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <GraduationCap className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Capstone</CardTitle>
                <CardDescription>Your group, project title, and weekly journal</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
