'use client';

import { signIn } from 'next-auth/react';

/**
 * Starts the teacher "Continue with Google" flow.
 *
 * Google's `hd` parameter makes the account chooser offer only @ulab.edu.bd accounts. It used
 * to be fixed on the provider at server start, so the admin "allow any email domain" developer
 * setting could relax the server-side check but Google still refused every non-ULAB account.
 * It is now sent per sign-in: always, unless that developer setting is on.
 *
 * `hd` is only a hint to Google - the real domain check is the signIn callback in
 * app/api/auth/[...nextauth]/route.ts, which applies the same setting.
 */
export async function signInWithGoogle(callbackUrl: string) {
  let anyDomain = false;
  try {
    const res = await fetch('/api/auth/settings');
    if (res.ok) anyDomain = (await res.json()).devAllowAnyEmailDomain === true;
  } catch {
    // Can't tell - keep the ULAB-only picker, the safe default.
  }
  return signIn('google', { callbackUrl }, anyDomain ? undefined : { hd: 'ulab.edu.bd' });
}
