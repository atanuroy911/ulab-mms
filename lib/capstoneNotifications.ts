/**
 * Capstone-specific email notification helpers.
 * Uses lib/mail.ts (Gmail SMTP via nodemailer) — that module is already configured
 * with EMAIL_USER / EMAIL_PASSWORD from .env.local.
 */
import { sendMail, mailShell, esc } from '@/lib/mail';

interface Recipient {
  name: string;
  email: string;
}

interface SessionInfo {
  _id: string;
  department: string;
  semesterName?: string;
}

interface GroupInfo {
  _id: string;
  projectTitle: string;
  track: string;
}

/**
 * Sends a "please submit your marks" email to a list of supervisors and evaluators.
 * Called from POST /api/capstone/sessions/[id]/request-marks.
 *
 * Returns { sent, failed } counts. Never throws.
 */
export async function sendMarkRequestEmails(
  session: SessionInfo,
  recipients: Recipient[],
  baseUrl: string
): Promise<{ sent: number; failed: number }> {
  if (recipients.length === 0) return { sent: 0, failed: 0 };

  const semLabel = session.semesterName ? ` — ${session.semesterName}` : '';
  const subject = `[ULAB MMS] Action Required: Please submit your capstone marks (${esc(session.department)}${semLabel})`;

  const body = mailShell(`
    <p>Dear Faculty Member,</p>
    <p>
      The coordinator for the <strong>${esc(session.department)}${semLabel}</strong> capstone
      has requested that you submit your evaluation marks.
    </p>
    <p>
      Please log in to the ULAB Marks Management System and navigate to
      <strong>Capstone → My Groups</strong> to submit your report, presentation, weekly journal,
      and peer marks as applicable.
    </p>
    <p style="margin: 24px 0;">
      <a href="${esc(baseUrl)}/capstone"
         style="display: inline-block; background: #3b82f6; color: white; text-decoration: none;
                padding: 10px 22px; border-radius: 6px; font-weight: 600;">
        Go to My Capstone Groups
      </a>
    </p>
    <p>
      If you have already submitted your marks, you may disregard this email.
    </p>
    <p>Thank you,<br/>ULAB MMS Automated Notifications</p>
  `);

  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    const result = await sendMail({ to: r.email, subject, html: body });
    if (result.ok) sent++;
    else {
      failed++;
      console.warn(`sendMarkRequestEmails: failed to send to ${r.email}: ${result.error}`);
    }
  }

  return { sent, failed };
}

/**
 * Sends an evaluation-mode-opened email to a specific evaluator being assigned.
 * Called when a coordinator assigns a new evaluator to a group.
 */
export async function sendEvaluatorAssignedEmail(
  recipient: Recipient,
  group: GroupInfo,
  session: SessionInfo,
  baseUrl: string
): Promise<void> {
  const semLabel = session.semesterName ? ` (${session.semesterName})` : '';
  const subject = `[ULAB MMS] You have been assigned as an evaluator — ${esc(group.projectTitle)}`;

  const body = mailShell(`
    <p>Dear ${esc(recipient.name)},</p>
    <p>
      You have been assigned as an <strong>evaluator</strong> for the following capstone group:
    </p>
    <table style="margin: 16px 0; border-collapse: collapse; width: 100%; max-width: 400px;">
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280; font-size: 14px;">Project:</td>
          <td style="padding: 6px 0; font-weight: 600; font-size: 14px;">${esc(group.projectTitle)}</td></tr>
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280; font-size: 14px;">Track:</td>
          <td style="padding: 6px 0; font-size: 14px;">Track ${esc(group.track)}</td></tr>
      <tr><td style="padding: 6px 12px 6px 0; color: #6b7280; font-size: 14px;">Department:</td>
          <td style="padding: 6px 0; font-size: 14px;">${esc(session.department)}${semLabel}</td></tr>
    </table>
    <p>
      Please use the link below to view the group's report and submit your evaluation marks
      when the assessment period opens.
    </p>
    <p style="margin: 24px 0;">
      <a href="${esc(baseUrl)}/capstone/groups/${esc(group._id)}"
         style="display: inline-block; background: #3b82f6; color: white; text-decoration: none;
                padding: 10px 22px; border-radius: 6px; font-weight: 600;">
        View Group &amp; Submit Marks
      </a>
    </p>
    <p>Thank you,<br/>ULAB MMS Automated Notifications</p>
  `);

  await sendMail({ to: recipient.email, subject, html: body });
}
