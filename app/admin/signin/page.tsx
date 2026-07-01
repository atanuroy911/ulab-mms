'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { notify } from '@/app/utils/notifications';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AdminSignIn() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requireSetup, setRequireSetup] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Try to sign in
      const response = await fetch('/api/admin/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.requireSetup) {
        // Need to set up password first
        setRequireSetup(true);
        setError('');
      } else if (response.ok) {
        // Successful login
        notify.success('Welcome Admin! Signed in successfully');
        router.push('/admin/dashboard');
        router.refresh();
      } else {
        const errorMsg = data.error || 'Authentication failed';
        setError(errorMsg);
        notify.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = 'An error occurred. Please try again.';
      setError(errorMsg);
      notify.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/admin/setup-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Successful setup
        notify.success('Admin password set successfully! Welcome!');
        router.push('/admin/dashboard');
        router.refresh();
      } else {
        const errorMsg = data.error || 'Failed to set password';
        setError(errorMsg);
        notify.error(errorMsg);
      }
    } catch (err) {
      const errorMsg = 'An error occurred. Please try again.';
      setError(errorMsg);
      notify.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Theme Toggle - Fixed Position */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      
      <div className="max-w-md w-full space-y-8">
        {/* Logo and Title */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="relative inline-block">
              <Image
                src="/ulab.svg"
                alt="ULAB Logo"
                width={120}
                height={120}
                className="drop-shadow-lg"
                priority
              />
              <div className="absolute bottom-0 right-0 z-10 translate-x-1/3 translate-y-1/3 rounded-full bg-primary p-2 text-primary-foreground ring-4 ring-background">
                <Shield className="h-6 w-6" />
              </div>
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Admin Portal
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Marks Management System
            </p>
          </div>
        </div>

        {/* Sign In Card */}
        <Card>
          <CardHeader>
            <CardTitle>
              {requireSetup ? 'Set Up Admin Password' : 'Admin Sign In'}
            </CardTitle>
            <CardDescription>
              {requireSetup 
                ? 'Create your admin password to secure the system'
                : 'Enter your admin password to access the portal'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requireSetup && (
              <Alert className="mb-4">
                <AlertDescription>
                  No password found. Please create a secure password (minimum 8 characters).
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            <form onSubmit={requireSetup ? handleSetupPassword : handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  value="admin"
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">
                  {requireSetup ? 'New Password' : 'Password'}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={requireSetup ? "Create a secure password" : "Enter admin password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="pr-10"
                    minLength={requireSetup ? 8 : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    <span className="sr-only">
                      {showPassword ? "Hide password" : "Show password"}
                    </span>
                  </Button>
                </div>
                {requireSetup && (
                  <p className="text-xs text-muted-foreground">
                    Must be at least 8 characters long
                  </p>
                )}
              </div>

              {requireSetup && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Retype your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={loading}
                      className="pr-10"
                      minLength={8}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      disabled={loading}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      <span className="sr-only">
                        {showConfirmPassword ? "Hide password" : "Show password"}
                      </span>
                    </Button>
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    {requireSetup ? 'Setting up...' : 'Signing in...'}
                  </>
                ) : (
                  requireSetup ? 'Set Password & Continue' : 'Sign In'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Back to Teacher Login */}
        <div className="text-center">
          <Link
            href="/auth/signin"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            ← Back to Teacher Login
          </Link>
        </div>
      </div>
    </div>
  );
}
