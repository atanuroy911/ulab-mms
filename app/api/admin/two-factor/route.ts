import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import dbConnect from '@/lib/mongodb';
import AdminSettings from '@/models/AdminSettings';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { setAdminSession } from '@/lib/adminSession';
import { checkRateLimit, getRequestIp } from '@/lib/rateLimit';
import { decryptSecret, encryptSecret, newBackupCodes, newSecret, otpauthUri, verifyCode } from '@/lib/adminTotp';

// Authenticator 2FA for the shared admin login.
//   GET                          status
//   POST { action: 'setup' }     a new secret to scan (not active until confirmed)
//   POST { action: 'enable', code }        confirm the scan; returns the backup codes once
//   POST { action: 'backup-codes', code }  replace the backup codes
//   POST { action: 'disable', code }       turn it off
// Once it's on, changing it needs a 2FA-verified session plus a fresh code. An admin-role
// account (a real person) may turn it off without a code - the way back if the phone is lost.

export async function GET(request: NextRequest) {
  const access = await verifyAdminAccess(request);
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
  await dbConnect();
  const s = await AdminSettings.findOne().select('totpEnabled totpEnabledAt totpBackupHashes').lean();
  return NextResponse.json({
    enabled: !!s?.totpEnabled,
    enabledAt: s?.totpEnabledAt ?? null,
    backupCodesLeft: s?.totpBackupHashes?.length ?? 0,
    sessionVerified: access.verified,
    personal: access.via === 'role',
  });
}

export async function POST(request: NextRequest) {
  try {
    const access = await verifyAdminAccess(request);
    if (!access.ok) return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    const rateLimit = checkRateLimit(`admin-2fa-manage:${getRequestIp(request)}`, 10, 15 * 60 * 1000);
    if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    const code = typeof body?.code === 'string' ? body.code.trim() : '';

    await dbConnect();
    const settings = await AdminSettings.findOne();
    if (!settings) return NextResponse.json({ error: 'Admin settings not found' }, { status: 404 });

    // With 2FA on, only a verified session can change it, and it must show a current code.
    const needsCode = async () => {
      if (!access.verified) return 'Sign in with your authenticator code first.';
      const step = verifyCode(decryptSecret(settings.totpSecretEnc!), code, settings.totpLastStep ?? -1);
      if (step === null) return 'Wrong code. Enter the current code from your authenticator app.';
      settings.totpLastStep = step;
      return null;
    };

    if (action === 'setup') {
      if (settings.totpEnabled && !access.verified) {
        return NextResponse.json({ error: 'Sign in with your authenticator code first.' }, { status: 403 });
      }
      const secret = newSecret();
      settings.totpPendingEnc = encryptSecret(secret);
      await settings.save();
      const uri = otpauthUri(secret);
      return NextResponse.json({
        secret: secret.replace(/(.{4})/g, '$1 ').trim(),
        uri,
        qr: await QRCode.toDataURL(uri, { margin: 1, width: 240, errorCorrectionLevel: 'M' }),
      });
    }

    if (action === 'enable') {
      if (!settings.totpPendingEnc) return NextResponse.json({ error: 'Start the setup again.' }, { status: 400 });
      if (settings.totpEnabled && !access.verified) {
        return NextResponse.json({ error: 'Sign in with your authenticator code first.' }, { status: 403 });
      }
      const pending = decryptSecret(settings.totpPendingEnc);
      const step = verifyCode(pending, code);
      if (step === null) return NextResponse.json({ error: 'Wrong code. Check the time on your phone and try again.' }, { status: 400 });
      const { codes, hashes } = await newBackupCodes();
      settings.totpSecretEnc = settings.totpPendingEnc;
      settings.totpPendingEnc = null;
      settings.totpEnabled = true;
      settings.totpEnabledAt = new Date();
      settings.totpLastStep = step;
      settings.totpBackupHashes = hashes;
      await settings.save();
      const response = NextResponse.json({ enabled: true, backupCodes: codes });
      // They just proved the code, so this session counts as verified.
      if (access.via === 'shared') await setAdminSession(response, { mfa: true });
      return response;
    }

    if (!settings.totpEnabled || !settings.totpSecretEnc) return NextResponse.json({ error: 'Two-factor sign-in is not on.' }, { status: 400 });

    if (action === 'backup-codes') {
      const problem = await needsCode();
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      const { codes, hashes } = await newBackupCodes();
      settings.totpBackupHashes = hashes;
      await settings.save();
      return NextResponse.json({ backupCodes: codes });
    }

    if (action === 'disable') {
      // A real admin account may switch it off without a code (lost phone recovery).
      const personalAdmin = access.via === 'role';
      if (!personalAdmin) {
        const problem = await needsCode();
        if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      }
      settings.totpEnabled = false;
      settings.totpSecretEnc = null;
      settings.totpPendingEnc = null;
      settings.totpBackupHashes = [];
      settings.totpEnabledAt = null;
      await settings.save();
      console.warn(`[admin-2fa] Shared admin 2FA turned off by ${access.userId ? `user ${access.userId}` : 'the shared admin login'}`);
      return NextResponse.json({ enabled: false });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Admin 2FA error:', error);
    return NextResponse.json({ error: 'Two-factor update failed' }, { status: 500 });
  }
}
