'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { AppHeader } from '@/app/components/AppHeader';

const SUBCATEGORIES = [
  { name: 'Peer Review', code: 'peer', color: 'bg-blue-100 dark:bg-blue-900', textColor: 'text-blue-600 dark:text-blue-400' },
  { name: 'Report', code: 'report', color: 'bg-purple-100 dark:bg-purple-900', textColor: 'text-purple-600 dark:text-purple-400' },
  { name: 'Weekly Journal', code: 'weekly-journal', color: 'bg-green-100 dark:bg-green-900', textColor: 'text-green-600 dark:text-green-400' },
];

export default function CategoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const semester = params?.semester as string;
  const category = params?.category as string;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      setLoading(false);
    }
  }, [status, router]);

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title={category.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}
        subtitle={`Semester: ${semester}`}
        logoHref={`/capstone/supervisor/${semester}`}
        actions={[
          { key: 'back', label: 'Back', icon: ArrowLeft, href: `/capstone/supervisor/${semester}`, variant: 'ghost', alwaysShowLabel: true },
        ]}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SUBCATEGORIES.map((item, index) => (
            <Link key={index} href={`/capstone/supervisor/${semester}/${category}/${item.code}`}>
              <Card className={`cursor-pointer transition-all hover:shadow-lg ${item.color}`}>
                <CardHeader>
                  <CardTitle className={item.textColor}>{item.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">View {item.name.toLowerCase()} details</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
