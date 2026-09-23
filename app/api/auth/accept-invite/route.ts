import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/mongodb';
import { isCredentialsLoginEnabled } from '@/lib/authSettings';
import { findValidInvite, clearInvite } from '@/lib/userInvites';

export const runtime = 'nodejs';

// GET ?email=&token= - checks an invite link before showing the set-up form.
export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email') || '';
    const token = request.nextUrl.searchParams.get('token') || '';
    await dbConnect();

    const user = await findValidInvite(email, token);
    if (!user) {
      return NextResponse.json(
        { error: 'This invitation link is invalid, expired, or has already been used.' },
        { status: 400 }
      );
    }
    return NextResponse.json({
      name: user.name,
      email: user.email,
      credentialsLoginEnabled: await isCredentialsLoginEnabled(),
    });
  } catch (error) {
    console.error('GET /api/auth/accept-invite error:', error);
    return NextResponse.json({ error: 'Failed to check invitation' }, { status: 500 });
  }
}

// POST { email, token, name, password, confirmPassword } - activates the invited account.
export async function POST(request: NextRequest) {
  try {
    const { email, token, name, password, confirmPassword } = await request.json().catch(() => ({}));

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }

    await dbConnect();

    if (!(await isCredentialsLoginEnabled())) {
      return NextResponse.json(
        { error: 'Email/password sign-in is disabled. Use "Continue with Google" to activate your account.' },
        { status: 403 }
      );
    }

    const user = await findValidInvite(String(email || ''), String(token || ''));
    if (!user) {
      return NextResponse.json(
        { error: 'This invitation link is invalid, expired, or has already been used.' },
        { status: 400 }
      );
    }

    // The inviter typed the name; let the person correct their own.
    if (typeof name === 'string' && name.trim()) user.name = name.trim();
    user.password = await bcrypt.hash(password, 10);
    clearInvite(user);
    await user.save();

    return NextResponse.json({ message: 'Account activated', email: user.email });
  } catch (error) {
    console.error('POST /api/auth/accept-invite error:', error);
    return NextResponse.json({ error: 'Failed to activate account' }, { status: 500 });
  }
}
