'use client';

import { signIn } from 'next-auth/react';

export type StudentGoogleProvider = 'google-student' | 'google-checkin' | 'google-project' | 'google-marks';

/**
 * Starts a STUDENT Google sign-in (portal, marks, attendance check-in, project).
 *
 * Normally sends hd=ulab.edu.bd so Google's chooser only offers ULAB accounts. While an admin
 * has listed student test addresses in Developer Settings, it is left off so an outside test
 * account can be picked. Either way the server only admits @ulab.edu.bd or those exact
 * addresses (isAllowedStudentEmail in lib/authSettings.ts).
 */
export async function signInStudentWithGoogle(provider: StudentGoogleProvider, callbackUrl: string) {
  let testSignIn = false;
  try {
    const res = await fetch('/api/auth/settings');
    if (res.ok) testSignIn = (await res.json()).devStudentTestSignIn === true;
  } catch {
    // Can't tell - keep the ULAB-only picker, the safe default.
  }
  return signIn(provider, { callbackUrl }, testSignIn ? undefined : { hd: 'ulab.edu.bd' });
}
