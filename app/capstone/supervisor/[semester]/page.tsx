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

const CATEGORIES = [
  { code: 'CSE4098A', color: 'bg-blue-100 dark:bg-blue-900', textColor: 'text-blue-600 dark:text-blue-400', buttonColor: 'bg-blue-600 hover:bg-blue-700' },
  { code: 'CSE4098B', color: 'bg-purple-100 dark:bg-purple-900', textColor: 'text-purple-600 dark:text-purple-400', buttonColor: 'bg-purple-600 hover:bg-purple-700' },
  { code: 'CSE4098C', color: 'bg-green-100 dark:bg-green-900', textColor: 'text-green-600 dark:text-green-400', buttonColor: 'bg-green-600 hover:bg-green-700' },
  { code: 'CSE499', color: 'bg-orange-100 dark:bg-orange-900', textColor: 'text-orange-600 dark:text-orange-400', buttonColor: 'bg-orange-600 hover:bg-orange-700' },
];

export default function SemesterPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const semester = params?.semester as string;
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
        title={`${semester} - Capstone Courses`}
        subtitle="Select a course to submit marks"
        gradient="blue"
        logoHref="/capstone/supervisor"
        actions={[
          { key: 'back', label: 'Back', icon: ArrowLeft, href: '/capstone/supervisor', variant: 'outline', alwaysShowLabel: true },
        ]}
      />

      <div className="max-w-6xl mx-auto p-4 pt-8">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Select Course - {semester}</h2>
          <p className="text-muted-foreground">
            Choose a capstone course to view and submit marks
          </p>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {CATEGORIES.map((category) => (
            <Card key={category.code} className="hover:shadow-lg transition-shadow border-2 hover:border-blue-500">
              <CardHeader>
                <div className={`w-12 h-12 rounded-lg ${category.color} flex items-center justify-center mb-4`}>
                  <span className={`text-lg font-bold ${category.textColor}`}>
                    {category.code.charAt(category.code.length - 1)}
                  </span>
                </div>
                <CardTitle className="text-lg">{category.code}</CardTitle>
                <CardDescription>
                  Capstone {category.code === 'CSE499' ? 'Final Project' : `Section ${category.code.slice(-1)}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Submit marks for {category.code} capstone students
                </p>
                
                {/* Buttons for Weekly Journal, Peer, and Report */}
                <div className="space-y-2">
                {/* Buttons for Weekly Journal, Peer, and Report */}
                <Button 
                  asChild 
                  className={`w-full ${category.buttonColor}`}
                >
                  <Link href={`/capstone/supervisor/${semester}/${category.code}/weekly-journal`}>
                    Weekly Journal
                  </Link>
                </Button>
                <Button 
                  asChild 
                  className={`w-full ${category.buttonColor}`}
                >
                  <Link href={`/capstone/supervisor/${semester}/${category.code}/peer`}>
                    Peer
                  </Link>
                </Button>
                {(category.code === 'CSE4098C' || category.code === 'CSE499') && (
                  <Button 
                    asChild 
                    className={`w-full ${category.buttonColor}`}
                  >
                    <Link href={`/capstone/supervisor/${semester}/${category.code}/poster`}>
                      Poster Marks
                    </Link>
                  </Button>
                )}
                <Button 
                  asChild 
                  className={`w-full ${category.buttonColor}`}
                >
                  <Link href={`/capstone/supervisor/${semester}/${category.code}/report`}>
                    Report
                  </Link>
                </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
