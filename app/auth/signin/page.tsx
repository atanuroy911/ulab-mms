'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { notify } from '@/app/utils/notifications';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, Lock, Mail, LogIn } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { GOOGLE_AUTH_ERROR_MESSAGES } from '@/lib/googleAccount';
import { AuthShell } from '@/app/auth/components/AuthShell';

export default function SignIn() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState(
    () => GOOGLE_AUTH_ERROR_MESSAGES[searchParams.get('reason') || ''] || ''
  );
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [credentialsLoginEnabled, setCredentialsLoginEnabled] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/auth/settings');
        const data = await res.json();
        if (res.ok) setCredentialsLoginEnabled(data.credentialsLoginEnabled);
      } catch {
        // keep the default (enabled) on error
      } finally {
        setSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  const handleGoogleSignIn = () => {
    setGoogleLoading(true);
    signIn('google', { callbackUrl: '/dashboard' });
  };

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        notify.auth.signInError(result.error);
      } else {
        notify.auth.signInSuccess();
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err) {
      const errorMsg = 'An error occurred. Please try again.';
      setError(errorMsg);
      notify.auth.signInError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Logo and Title — shown on mobile / tablet, brand panel covers this on desktop */}
        <div className="space-y-4 text-center lg:hidden">
          <div className="flex justify-center">
            <Image
              src="/ulab.svg"
              alt="ULAB Logo"
              width={90}
              height={90}
              className="drop-shadow-lg"
              priority
            />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Marks Management System
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              University of Liberal Arts Bangladesh
            </p>
          </div>
        </div>

        {/* Sign In Card */}
        <Card className="border-border/60 shadow-xl shadow-blue-500/5 dark:shadow-black/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Sign In</CardTitle>
                <CardDescription>
                  Enter your credentials to access your account
                </CardDescription>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      className="hover:bg-purple-100 dark:hover:bg-purple-900/20"
                    >
                      <Link href="/admin/signin">
                        <Lock className="h-5 w-5 text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400" />
                        <span className="sr-only">Admin Access</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Admin Access</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            {!settingsLoaded || credentialsLoginEnabled ? (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-75 fill-mode-backwards">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="yourname@ulab.edu.bd"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        required
                        disabled={loading}
                        className="pl-9"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Use your @ulab.edu.bd email</p>
                  </div>

                  <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150 fill-mode-backwards">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={formData.password}
                        onChange={(e) =>
                          setFormData({ ...formData, password: e.target.value })
                        }
                        required
                        disabled={loading}
                        className="pl-9 pr-10"
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
                  </div>

                  <Button
                    type="submit"
                    className="w-full gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white transition-transform hover:from-blue-500 hover:to-cyan-500 hover:scale-[1.01] active:scale-[0.99] animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 fill-mode-backwards"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4" />
                        Sign In
                      </>
                    )}
                  </Button>
                </form>

                <div className="text-right">
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm text-primary hover:underline font-medium"
                  >
                    Forgot Password?
                  </Link>
                </div>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="mb-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Email/password sign-in is currently disabled. Please continue with Google below.
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full transition-transform hover:scale-[1.01] active:scale-[0.99]"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirecting to Google...
                </>
              ) : (
                'Continue with Google (@ulab.edu.bd)'
              )}
            </Button>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <div className="text-sm text-center text-muted-foreground">
              Don't have an account?{' '}
              <Link
                href="/auth/signup"
                className="text-primary hover:underline font-medium"
              >
                Sign Up
              </Link>
            </div>
          </CardFooter>
        </Card>

        {/* Student Check Marks */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              or
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full transition-transform hover:scale-[1.01] active:scale-[0.99]"
          asChild
        >
          <Link href="/student/check-marks">
            📊 Check Marks (Student)
          </Link>
        </Button>
      </div>
    </AuthShell>
  );
}
