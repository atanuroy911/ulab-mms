import crypto from 'crypto';
import User, { IUser } from '@/models/User';
import { sendMail, mailShell, esc } from '@/lib/mail';

/**
 * Invitations for people who don't have an account yet (e.g. a supervisor or evaluator a
 * coordinator wants to assign before they've registered).
 *
 * An invite creates a real User straight away - groups reference supervisors/evaluators by
 * User id, so the person can be assigned immediately - but marks it `invitePending` with no
 * password and no Google link, so nobody can sign in as it. The emailed link carries a
 * random token (only its SHA-256 is stored, as with password resets) that lets the owner of
 * the inbox set a password. Signing in with Google as that email, registering normally, or
 * resetting the password also activates it, since each of those proves the same thing.
 */

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export interface InviteContext {
  /** Omitted for a resend from the admin Account Manager, which has no capstone context. */
  role?: 'supervisor' | 'evaluator';
  department?: string;
  semesterName?: string;
  projectTitle?: string;
  inviterName?: string;
}

export type InviteResult =
  | { status: 'existing'; user: IUser }
  | { status: 'invited' | 'reinvited'; user: IUser; emailSent: boolean };

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Returns the existing registered user for this email untouched, or creates (or refreshes)
 * a pending invite and emails the link. Refreshing issues a new token, so an older link
 * stops working - "resend" never leaves two valid links around.
 */
export async function inviteUser(
  params: { name: string; email: string; invitedBy: string | null; context: InviteContext }
): Promise<InviteResult> {
  const email = params.email.trim().toLowerCase();
  const existing = await User.findOne({ email });
  if (existing && !existing.invitePending) return { status: 'existing', user: existing };

  const token = crypto.randomBytes(32).toString('hex');
  const user =
    existing ??
    new User({
      name: params.name.trim(),
      email,
      roles: ['teacher'],
      invitePending: true,
      invitedBy: params.invitedBy,
    });
  user.inviteTokenHash = hashToken(token);
  user.inviteTokenExpiry = new Date(Date.now() + INVITE_TTL_MS);
  await user.save();

  const emailSent = await sendInviteEmail(user, token, params.context);
  return { status: existing ? 'reinvited' : 'invited', user, emailSent };
}

async function sendInviteEmail(user: IUser, token: string, ctx: InviteContext): Promise<boolean> {
  const baseUrl = process.env.NEXTAUTH_URL || '';
  const link = `${baseUrl}/auth/accept-invite?token=${token}&email=${encodeURIComponent(user.email)}`;
  const semLabel = ctx.semesterName ? ` (${esc(ctx.semesterName)})` : '';
  const roleLabel = ctx.role === 'supervisor' ? 'a supervisor' : 'an evaluator';
  const who = ctx.inviterName ? `${esc(ctx.inviterName)} has` : 'The capstone coordinator has';

  // With capstone context (session invite) say exactly what they were added to; without it
  // (a resend from Account Manager) keep it general.
  const intro = ctx.department
    ? `${who} added you as <strong>${roleLabel}</strong> for the <strong>${esc(ctx.department)} capstone${semLabel}</strong>
        on the ULAB Marks Management System${ctx.projectTitle ? `, for the project <strong>${esc(ctx.projectTitle)}</strong>` : ''}.`
    : `You have been invited to the ULAB Marks Management System to supervise and evaluate capstone projects.`;

  const result = await sendMail({
    to: user.email,
    subject: ctx.department
      ? `[ULAB MMS] You're invited to evaluate ${esc(ctx.department)} capstone projects`
      : `[ULAB MMS] Your invitation to the Marks Management System`,
    html: mailShell(`
      <p>Dear ${esc(user.name)},</p>
      <p>${intro}</p>
      <p>You don't have an account yet. Set one up with the button below - it takes a minute - and
        you'll then find your groups under <strong>Capstone</strong> to review reports and submit marks.</p>
      <p style="margin: 24px 0;">
        <a href="${esc(link)}"
           style="display: inline-block; background: #3b82f6; color: white; text-decoration: none;
                  padding: 10px 22px; border-radius: 6px; font-weight: 600;">
          Set Up My Account
        </a>
      </p>
      <p style="font-size: 13px; color: #6b7280;">
        This link expires in 14 days. You can also sign in with your ULAB Google account using this
        email address. If you weren't expecting this, you can ignore this email.
      </p>
    `),
  });
  return result.ok;
}

/** Finds the pending invite a link points at, or null if the link is wrong or expired. */
export async function findValidInvite(email: string, token: string) {
  if (!email || !token) return null;
  return User.findOne({
    email: email.trim().toLowerCase(),
    invitePending: true,
    inviteTokenHash: hashToken(token),
    inviteTokenExpiry: { $gt: new Date() },
  });
}

/** Marks an invited account as activated. Caller saves. */
export function clearInvite(user: IUser) {
  user.invitePending = false;
  user.inviteTokenHash = null;
  user.inviteTokenExpiry = null;
}

/**
 * Re-sends a pending invite with a fresh link (the old one stops working). Returns null when
 * the user doesn't exist or has already activated their account.
 */
export async function resendInvite(userId: string, invitedBy: string | null, context: InviteContext = {}) {
  const user = await User.findById(userId).select('name email invitePending');
  if (!user || !user.invitePending) return null;
  const result = await inviteUser({ name: user.name, email: user.email, invitedBy, context });
  return result.status === 'existing' ? null : result;
}
