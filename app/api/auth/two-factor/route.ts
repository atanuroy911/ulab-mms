import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, isStudentOnlySessionUser } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import { checkRateLimit, getRequestIp } from '@/lib/rateLimit';
import { confirmSetup, consumeSecondFactor, replaceBackupCodes, startSetup, turnOff, twoFactorStatus } from '@/lib/userTwoFactor';

// A teacher's own authenticator 2FA.
//   GET                                     status
//   POST { action: 'setup' }                a secret to scan (inactive until confirmed)
//   POST { action: 'enable', code }         confirm; returns backup codes once
//   POST { action: 'backup-codes', code }   new backup codes
//   POST { action: 'disable', code }        turn it off
// Changing an active 2FA always needs a current code, so a session left open on a shared
// computer can't quietly switch it off.

async function me() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; email?: string | null } | undefined;
  if (!user?.id || isStudentOnlySessionUser(user as never)) return null;
  await dbConnect();
  return { id: user.id, email: user.email || 'teacher' };
}

export async function GET() {
  const user = await me();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Same shape as the admin panel's 2FA status, so one screen serves both.
  return NextResponse.json({ ...(await twoFactorStatus(user.id)), sessionVerified: true, personal: false });
}

export async function POST(request: NextRequest) {
  try {
    const user = await me();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!checkRateLimit(`user-2fa:${user.id}:${getRequestIp(request)}`, 10, 15 * 60 * 1000).allowed) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }
    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    const status = await twoFactorStatus(user.id);

    if (action === 'setup') {
      if (status.enabled) return NextResponse.json({ error: 'Two-factor sign-in is already on.' }, { status: 400 });
      return NextResponse.json(await startSetup(user.id, user.email));
    }
    if (action === 'enable') {
      const codes = await confirmSetup(user.id, code);
      if (!codes) return NextResponse.json({ error: 'Wrong code. Check the time on your phone and try again.' }, { status: 400 });
      return NextResponse.json({ enabled: true, backupCodes: codes });
    }
    if (!status.enabled) return NextResponse.json({ error: 'Two-factor sign-in is not on.' }, { status: 400 });
    if (!(await consumeSecondFactor(user.id, code))) {
      return NextResponse.json({ error: 'Wrong code. Enter the current code from your authenticator app.' }, { status: 400 });
    }
    if (action === 'backup-codes') return NextResponse.json({ backupCodes: await replaceBackupCodes(user.id) });
    if (action === 'disable') {
      await turnOff(user.id);
      return NextResponse.json({ enabled: false });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('POST /api/auth/two-factor error:', error);
    return NextResponse.json({ error: 'Two-factor update failed' }, { status: 500 });
  }
}
