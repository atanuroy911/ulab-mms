'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';
import { AppHeader } from '@/app/components/AppHeader';

interface Semester {
  _id: string;
  name: string;
  description: string;
  startDate?: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const COLORS = [
  { color: 'bg-amber-100 dark:bg-amber-900', textColor: 'text-amber-600 dark:text-amber-400', buttonColor: 'bg-amber-600 hover:bg-amber-700' },
  { color: 'bg-green-100 dark:bg-green-900', textColor: 'text-green-600 dark:text-green-400', buttonColor: 'bg-green-600 hover:bg-green-700' },
  { color: 'bg-blue-100 dark:bg-blue-900', textColor: 'text-blue-600 dark:text-blue-400', buttonColor: 'bg-blue-600 hover:bg-blue-700' },
  { color: 'bg-purple-100 dark:bg-purple-900', textColor: 'text-purple-600 dark:text-purple-400', buttonColor: 'bg-purple-600 hover:bg-purple-700' },
];

export default function SupervisorCapstone() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [semesters, setSemesters] = useState<Semester[]>([]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      fetchSemesters();
    }
  }, [status, router]);

  const fetchSemesters = async () => {
    try {
      const response = await fetch('/api/semesters');
      if (!response.ok) throw new Error('Failed to fetch semesters');
      const data = await response.json();
      setSemesters(data);
    } catch (error) {
      console.error('Error fetching semesters:', error);
      toast.error('Failed to load semesters');
    } finally {
      setLoading(false);
    }
  };

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
        title="Supervisor - Capstone Marks"
        subtitle="Select a semester to submit marks"
        gradient="blue"
        logoHref="/capstone"
        actions={[
          { key: 'back', label: 'Back', icon: ArrowLeft, href: '/capstone', variant: 'outline', alwaysShowLabel: true },
        ]}
      />

      <div className="max-w-6xl mx-auto p-4 pt-8">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Select Semester</h2>
          <p className="text-muted-foreground">
            Choose a semester to view and submit capstone marks
          </p>
        </div>

        {/* Semesters Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {semesters.length > 0 ? (
            semesters.map((semester, index) => {
              const color = COLORS[index % COLORS.length];
              return (
                <Card key={semester._id} className="hover:shadow-lg transition-shadow border-2 hover:border-blue-500">
                  <CardHeader>
                    <div className={`w-12 h-12 rounded-lg ${color.color} flex items-center justify-center mb-4`}>
                      <span className={`text-lg font-bold ${color.textColor}`}>
                        {semester.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <CardTitle className="text-lg">{semester.name}</CardTitle>
                    <CardDescription>
                      {semester.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      View and submit marks for {semester.name} capstone courses
                    </p>
                    
                    {/* Button to View Courses */}
                    <Button 
                      asChild 
                      className={`w-full ${color.buttonColor}`}
                    >
                      <Link href={`/capstone/supervisor/${semester.name}`}>
                        View Courses
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card className="md:col-span-2">
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">
                  No semesters available. Please contact the administrator.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
