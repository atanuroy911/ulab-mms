'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Users, BookOpen, Calendar, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Stats {
  courses: number;
  accounts: number;
  semesters: number;
}

const STAT_CARDS = [
  { key: 'courses', label: 'Courses', href: '/admin/dashboard?tab=courses', icon: BookOpen, gradient: 'from-blue-600 to-cyan-600' },
  { key: 'accounts', label: 'Accounts', href: '/admin/dashboard?tab=accounts', icon: Users, gradient: 'from-purple-600 to-pink-600' },
  { key: 'semesters', label: 'Semesters', href: '/admin/dashboard?tab=semesters', icon: Calendar, gradient: 'from-emerald-600 to-teal-600' },
] as const;

export default function OverviewSection() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [coursesRes, accountsRes, semestersRes] = await Promise.all([
          fetch('/api/admin/courses'),
          fetch('/api/admin/accounts'),
          fetch('/api/admin/semesters'),
        ]);
        const [coursesData, accountsData, semestersData] = await Promise.all([
          coursesRes.json(),
          accountsRes.json(),
          semestersRes.json(),
        ]);
        setStats({
          courses: (coursesData.courses || []).length,
          accounts: (accountsData.accounts || []).length,
          semesters: Array.isArray(semestersData) ? semestersData.length : 0,
        });
      } catch (error) {
        console.error('Error loading overview stats:', error);
      }
    };
    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Overview</h2>
        <p className="text-sm mt-1 text-muted-foreground">System-wide stats at a glance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {STAT_CARDS.map((stat, i) => (
          <Link key={stat.key} href={stat.href}>
            <Card
              className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards"
              style={{ animationDelay: `${i * 75}ms`, animationDuration: '400ms' }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-white ${stat.gradient}`}>
                  <stat.icon className="h-4 w-4" />
                </span>
              </CardHeader>
              <CardContent>
                {stats ? (
                  <div className="text-2xl font-bold">{stats[stat.key]}</div>
                ) : (
                  <Skeleton className="h-8 w-12" />
                )}
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  Manage
                  <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150 fill-mode-backwards">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            Quick Access
          </CardTitle>
          <CardDescription>
            Jump to the section you need using the sidebar, or the cards above.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
