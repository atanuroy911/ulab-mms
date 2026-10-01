import QRCode from 'qrcode';
import User from '@/models/User';
import { decryptSecret, encryptSecret, matchBackupCode, newBackupCodes, newSecret, otpauthUri, verifyCode } from '@/lib/adminTotp';

// Personal authenticator 2FA for teacher accounts. The same codes as the shared admin login
// (lib/adminTotp.ts), stored on the User. Asked for on password sign-in; Google sign-in relies
// on the Google account's own security.

const SECRET_FIELDS = '+totpSecretEnc +totpPendingEnc +totpLastStep +totpBackupHashes';

export async function twoFactorStatus(userId: string) {
  const u = await User.findById(userId).select('totpEnabled totpEnabledAt +totpBackupHashes').lean();
  return { enabled: !!u?.totpEnabled, enabledAt: u?.totpEnabledAt ?? null, backupCodesLeft: u?.totpBackupHashes?.length ?? 0 };
}

/**
 * Checks an authenticator code (or a one-time backup code) for this user and uses it up, so
 * it can't be used again. Atomic: two sign-ins racing with the same code can't both pass.
 */
export async function consumeSecondFactor(userId: string, code: string): Promise<'ok' | 'backup' | false> {
  const u = await User.findById(userId).select(SECRET_FIELDS + ' totpEnabled');
  if (!u?.totpEnabled || !u.totpSecretEnc) return false;
  const step = verifyCode(decryptSecret(u.totpSecretEnc), code, u.totpLastStep ?? -1);
  if (step !== null) {
    const r = await User.updateOne({ _id: userId, totpLastStep: { $lt: step } }, { $set: { totpLastStep: step } });
    return r.modifiedCount === 1 ? 'ok' : false;
  }
  const i = await matchBackupCode(code, u.totpBackupHashes || []);
  if (i < 0) return false;
  const r = await User.updateOne({ _id: userId }, { $pull: { totpBackupHashes: u.totpBackupHashes![i] } });
  return r.modifiedCount === 1 ? 'backup' : false;
}

/** A new secret to scan; not active until confirmed with a code. */
export async function startSetup(userId: string, accountLabel: string) {
  const secret = newSecret();
  await User.updateOne({ _id: userId }, { $set: { totpPendingEnc: encryptSecret(secret) } });
  const uri = otpauthUri(secret, accountLabel);
  return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 240, errorCorrectionLevel: 'M' }) };
}

/** Confirms the scan with a code from it; returns the backup codes (shown once), or null. */
export async function confirmSetup(userId: string, code: string): Promise<string[] | null> {
  const u = await User.findById(userId).select(SECRET_FIELDS);
  if (!u?.totpPendingEnc) return null;
  const step = verifyCode(decryptSecret(u.totpPendingEnc), code);
  if (step === null) return null;
  const { codes, hashes } = await newBackupCodes();
  await User.updateOne(
    { _id: userId },
    { $set: { totpEnabled: true, totpSecretEnc: u.totpPendingEnc, totpPendingEnc: null, totpLastStep: step, totpBackupHashes: hashes, totpEnabledAt: new Date() } }
  );
  return codes;
}

export async function replaceBackupCodes(userId: string): Promise<string[]> {
  const { codes, hashes } = await newBackupCodes();
  await User.updateOne({ _id: userId }, { $set: { totpBackupHashes: hashes } });
  return codes;
}

export async function turnOff(userId: string) {
  await User.updateOne(
    { _id: userId },
    { $set: { totpEnabled: false, totpSecretEnc: null, totpPendingEnc: null, totpBackupHashes: [], totpEnabledAt: null, totpLastStep: -1 } }
  );
}
