'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import CapstoneManagement from '@/app/admin/dashboard/components/CapstoneManagement';
import { AppHeader } from '@/app/components/AppHeader';

export default function CapstonePortal() {
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
        title="Capstone Management Portal"
        subtitle="Create and manage capstone student groups"
        actions={[
          { key: 'dashboard', label: 'Back to Dashboard', icon: ArrowLeft, href: '/dashboard', variant: 'outline', alwaysShowLabel: true },
        ]}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6 pt-8">
        <CapstoneManagement />
      </div>
    </div>
  );
}
