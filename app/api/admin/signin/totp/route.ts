import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';
import { checkRateLimit, getRequestIp } from '@/lib/rateLimit';
import { decryptSecret, matchBackupCode, verifyCode } from '@/lib/adminTotp';
import { hasPendingSecondFactor, setAdminSession } from '@/lib/adminSession';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

/** Second step of the shared admin login: an authenticator code, or a one-time backup code. */
export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(`admin-totp:${getRequestIp(request)}`, MAX_ATTEMPTS, WINDOW_MS);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }
    if (!(await hasPendingSecondFactor(request))) {
      return NextResponse.json({ error: 'Your sign-in expired. Enter the password again.', restart: true }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!code) return NextResponse.json({ error: 'Enter the code from your authenticator app' }, { status: 400 });

    await dbConnect();
    const settings = await AdminSettings.findOne();
    if (!settings?.totpEnabled || !settings.totpSecretEnc) {
      return NextResponse.json({ error: 'Two-factor sign-in is not set up. Enter the password again.', restart: true }, { status: 400 });
    }

    let usedBackup = false;
    const step = verifyCode(decryptSecret(settings.totpSecretEnc), code, settings.totpLastStep ?? -1);
    if (step !== null) {
      // Atomic, so two requests racing with the same code can't both get in.
      const claimed = await AdminSettings.updateOne({ _id: settings._id, totpLastStep: { $lt: step } }, { $set: { totpLastStep: step } });
      if (claimed.modifiedCount !== 1) return NextResponse.json({ error: 'That code was already used. Wait for the next one.' }, { status: 401 });
    } else {
      const i = await matchBackupCode(code, settings.totpBackupHashes || []);
      if (i < 0) return NextResponse.json({ error: 'Wrong code. Check the time on your phone and try again.' }, { status: 401 });
      const claimed = await AdminSettings.updateOne({ _id: settings._id }, { $pull: { totpBackupHashes: settings.totpBackupHashes[i] } });
      if (claimed.modifiedCount !== 1) return NextResponse.json({ error: 'That backup code was already used.' }, { status: 401 });
      usedBackup = true;
    }

    const response = NextResponse.json({
      success: true,
      usedBackup,
      backupCodesLeft: usedBackup ? (settings.totpBackupHashes?.length || 1) - 1 : settings.totpBackupHashes?.length || 0,
    });
    await setAdminSession(response, { mfa: true });
    return response;
  } catch (error) {
    console.error('Admin TOTP sign-in error:', error);
    return NextResponse.json({ error: 'Sign-in failed' }, { status: 500 });
  }
}
