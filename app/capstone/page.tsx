'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft, User, BarChart3 } from 'lucide-react';
import Image from 'next/image';
import { AppHeader } from '@/app/components/AppHeader';

export default function CapstonePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
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
        title="Capstone Marks Management"
        subtitle="Submit capstone project marks"
        gradient="blue"
        actions={[
          { key: 'dashboard', label: 'Back to Dashboard', icon: ArrowLeft, href: '/dashboard', variant: 'outline', alwaysShowLabel: true },
        ]}
      />

      <div className="max-w-6xl mx-auto p-4 pt-8">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Submit Capstone Marks</h2>
          <p className="text-muted-foreground">
            Select your role and submit marks for capstone projects
          </p>
        </div>

        {/* Submit Marks Section */}
        <div>
          <div className="mb-6">
            <h3 className="text-2xl font-bold mb-2">Submit Marks</h3>
            <p className="text-muted-foreground">
              Select your role and submit marks for capstone projects
            </p>
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Supervisor Option */}
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-500">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center mb-4">
                  <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-xl">Submit as Supervisor</CardTitle>
                <CardDescription>
                  Submit marks for students you are supervising
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-6">
                  As a supervisor, you can evaluate and submit marks for your capstone students based on their project work, presentation, and overall performance.
                </p>
                <Button 
                  asChild 
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  <Link href="/capstone/supervisor">
                    Submit as Supervisor
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Evaluator Option */}
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-purple-500">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle className="text-xl">Submit as Evaluator</CardTitle>
                <CardDescription>
                  Submit evaluation marks for assigned capstone projects
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-6">
                  As an evaluator, you can assess and submit marks for assigned capstone projects based on the evaluation criteria and rubric.
                </p>
                <Button 
                  asChild 
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  <Link href="/capstone/evaluator">
                    Submit as Evaluator
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
