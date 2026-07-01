import { NextResponse } from 'next/server';
import { isCredentialsLoginEnabled } from '@/lib/authSettings';

// Public: the sign-in/sign-up pages need to know this before a user is authenticated.
export async function GET() {
  try {
    const credentialsLoginEnabled = await isCredentialsLoginEnabled();
    return NextResponse.json({ credentialsLoginEnabled });
  } catch (error) {
    console.error('Error loading auth settings:', error);
    // Fail open on the enabled side so a transient DB error doesn't lock everyone out of email/password.
    return NextResponse.json({ credentialsLoginEnabled: true });
  }
}
