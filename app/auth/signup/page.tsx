'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { notify } from '@/app/utils/notifications';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, Mail, Lock, User, UserPlus } from 'lucide-react';
import { GOOGLE_AUTH_ERROR_MESSAGES } from '@/lib/googleAccount';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthShell } from '@/app/auth/components/AuthShell';

export default function SignUp() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState(
    () => GOOGLE_AUTH_ERROR_MESSAGES[searchParams.get('reason') || ''] || ''
  );
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [credentialsLoginEnabled, setCredentialsLoginEnabled] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

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

  const handleGoogleSignUp = () => {
    setGoogleLoading(true);
    signIn('google', { callbackUrl: '/dashboard' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      // Show success notification and redirect to sign in page
      notify.auth.signUpSuccess();
      router.push('/auth/signin');
    } catch (err) {
      setError('An error occurred. Please try again.');
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

        {/* Sign Up Card */}
        <Card className="border-border/60 shadow-xl shadow-blue-500/5 dark:shadow-black/40">
          <CardHeader>
            <CardTitle>Create an Account</CardTitle>
            <CardDescription>
              Enter your information to create your account
            </CardDescription>
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
                    <Label htmlFor="name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="name"
                        type="text"
                        placeholder="Enter your full name"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        required
                        disabled={loading}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100 fill-mode-backwards">
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
                        placeholder="At least 6 characters"
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

                  <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 fill-mode-backwards">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="Re-enter your password"
                        value={formData.confirmPassword}
                        onChange={(e) =>
                          setFormData({ ...formData, confirmPassword: e.target.value })
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
                    className="w-full gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white transition-transform hover:from-blue-500 hover:to-cyan-500 hover:scale-[1.01] active:scale-[0.99] animate-in fade-in slide-in-from-bottom-2 duration-500 delay-[250ms] fill-mode-backwards"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Sign Up
                      </>
                    )}
                  </Button>
                </form>

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
                Email/password sign-up is currently disabled. Please continue with Google below.
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full transition-transform hover:scale-[1.01] active:scale-[0.99]"
              onClick={handleGoogleSignUp}
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
              Already have an account?{' '}
              <Link
                href="/auth/signin"
                className="text-primary hover:underline font-medium"
              >
                Sign In
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </AuthShell>
  );
}
