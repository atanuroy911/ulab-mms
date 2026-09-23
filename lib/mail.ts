// Shared Gmail SMTP sender, used for every transactional email the app sends (password
// reset, account creation, grade notifications, etc). Configured via the same EMAIL_USER /
// EMAIL_PASSWORD Google App Password pair originally set up for forgot-password.
//
// Import this lazily (inline `await import('@/lib/mail')`) from any route that sends mail -
// nodemailer needs the Node.js runtime, so routes that use it must not declare
// `export const runtime = 'edge'`.

// No @types/nodemailer in this repo (matches the original forgot-password route, which
// also loaded it via a plain `require`) - typed as `any` deliberately.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer: any = require('nodemailer');

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text fallback; auto-derived from `html` (tags stripped) if omitted. */
  text?: string;
}

let cachedTransporter: any | null | undefined;

/** Returns null (rather than throwing) when EMAIL_USER/EMAIL_PASSWORD aren't configured. */
function getTransporter() {
  if (cachedTransporter !== undefined) return cachedTransporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    cachedTransporter = null;
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
  return cachedTransporter;
}

/** True when EMAIL_USER/EMAIL_PASSWORD are configured, so callers can decide whether to even try. */
export function isMailConfigured(): boolean {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
}

/**
 * Sends an email via Gmail SMTP. Never throws - returns `{ ok: false }` on any failure
 * (missing config, SMTP error) so a mail failure never breaks the caller's primary action
 * (e.g. a password reset must still succeed even if the email can't be delivered).
 */
export async function sendMail({ to, subject, html, text }: SendMailOptions): Promise<{ ok: boolean; error?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[mail] EMAIL_USER/EMAIL_PASSWORD not configured - would have sent "${subject}" to ${to}`);
    }
    return { ok: false, error: 'Email is not configured' };
  }

  try {
    await transporter.sendMail({
      from: `ULAB MMS <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
    return { ok: true };
  } catch (error: any) {
    console.error('sendMail failed:', error?.message || error);
    return { ok: false, error: error?.message || 'Failed to send email' };
  }
}

/**
 * Escapes a string for safe interpolation into an HTML email body. Every route that builds
 * mail HTML from user-controlled data (student names, course titles, exam names, comments,
 * etc) must run each interpolated value through this - unescaped interpolation lets a
 * student/teacher-controlled name or title inject markup into an email another person reads.
 */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Basic but strict email shape check - not RFC 5322, just good enough to reject garbage. */
export function isPlausibleEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Wraps a body in the shared branded HTML shell used by every notification email. */
export function mailShell(bodyHtml: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
      <div style="padding: 20px 0; border-bottom: 2px solid #3b82f6;">
        <span style="font-size: 18px; font-weight: 700; color: #3b82f6;">ULAB Marks Management System</span>
      </div>
      <div style="padding: 24px 0;">
        ${bodyHtml}
      </div>
      <div style="padding: 16px 0; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
        This is an automated message from the ULAB Marks Management System. Please do not reply to this email.
      </div>
    </div>
  `;
}
