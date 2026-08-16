'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft, FolderOpen, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { AppHeader } from '@/app/components/AppHeader';

export default function AdminPortal() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    
    // Check if admin is unlocked via localStorage
    const adminPassword = localStorage.getItem('adminPassword');
    if (!adminPassword) {
      setLoading(false);
      setIsAdminUnlocked(false);
      return;
    }

    setIsAdminUnlocked(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mounted && !isAdminUnlocked && !loading) {
      router.push('/dashboard');
    }
  }, [mounted, isAdminUnlocked, loading, router]);

  if (!mounted) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdminUnlocked) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title="Admin Portal"
        subtitle="Management & Resources"
        actions={[
          { key: 'dashboard', label: 'Back to Dashboard', icon: ArrowLeft, href: '/dashboard', variant: 'outline', alwaysShowLabel: true },
        ]}
      />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-6 pt-8">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Welcome to Admin Portal</h2>
          <p className="text-muted-foreground">
            Manage system resources and capstone student groups
          </p>
        </div>

        {/* Portal Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Resource Manager Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <FolderOpen className="h-6 w-6 text-blue-600" />
                <CardTitle>Resource Manager</CardTitle>
              </div>
              <CardDescription>
                Upload, organize, and manage system resources
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create folders, upload files, and manage all shared resources in the system.
              </p>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>✓ Upload files and documents</li>
                <li>✓ Create and organize folders</li>
                <li>✓ Manage file access</li>
                <li>✓ Version control integration</li>
              </ul>
            </CardContent>
          </Card>

          {/* Capstone Management Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <GraduationCap className="h-6 w-6 text-purple-600" />
                <CardTitle>Capstone Management</CardTitle>
              </div>
              <CardDescription>
                Create and manage capstone student groups
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create capstone groups, assign supervisors and evaluators, track progress.
              </p>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>✓ Create student groups (3-5 students)</li>
                <li>✓ Organize by course (4 capstone courses)</li>
                <li>✓ Assign supervisors and evaluators</li>
                <li>✓ Track group progress and status</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Quick Access Section */}
        <div className="mt-8 space-y-4">
          <h3 className="text-lg font-semibold">Quick Access</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button asChild variant="outline" className="h-12">
              <Link href="/admin/dashboard">
                <FolderOpen className="h-4 w-4 mr-2" />
                Go to Resources Manager
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12">
              <Link href="/admin/dashboard?tab=capstone">
                <GraduationCap className="h-4 w-4 mr-2" />
                Go to Capstone Management
              </Link>
            </Button>
          </div>
        </div>

        {/* Info Section */}
        <Alert className="mt-8">
          <AlertDescription>
            <strong>Admin Features:</strong> You have full access to system administration tools. 
            These features allow you to manage resources and oversee capstone project management across the system.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
