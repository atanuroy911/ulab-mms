'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { GOOGLE_AUTH_ERROR_MESSAGES } from '@/lib/googleAccount';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason') || searchParams.get('error') || '';
  const message = GOOGLE_AUTH_ERROR_MESSAGES[reason] || 'Something went wrong while signing in with Google. Please try again.';

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Image src="/ulab.svg" alt="ULAB Logo" width={100} height={100} className="drop-shadow-lg" priority />
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />
              <CardTitle>Sign-in Failed</CardTitle>
            </div>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-3 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
              {message}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2">
            <Button asChild className="w-full">
              <Link href="/auth/signin">Back to Sign In</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/settings">Back to Settings</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={null}>
      <AuthErrorContent />
    </Suspense>
  );
}
