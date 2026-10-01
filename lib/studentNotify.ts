import StudentAccount from '@/models/StudentAccount';
import Student from '@/models/Student';
import StudentNotification from '@/models/StudentNotification';
import { esc, mailShell, sendMail } from '@/lib/mail';

// One way to tell students something: a copy in their portal (always) and an email (when we
// know an address). Emails come from the student's account (their portal sign-in or an
// imported workbook) or, failing that, any course roster row that has one (captured when
// they used attendance check-in, Check Marks or the project page).

export interface StudentMessage {
  studentId: string;
  title: string;
  /** Plain text for the portal; also the email's body unless `emailHtml` is given. */
  body: string;
  /** A portal path, e.g. /student/dashboard/courses/<id>. */
  href?: string | null;
  /** Subject when it differs from the title. */
  subject?: string;
  /** Rich email body (inside the standard shell); defaults to the body text. */
  emailHtml?: string;
}

/** Gmail SMTP accepts a burst, but spacing large sends keeps us clear of its limits. */
const EMAIL_GAP_MS = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const baseUrl = () => process.env.NEXTAUTH_URL || '';

/** Best known email per student ID (lower-cased keys). */
export async function studentEmails(studentIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(studentIds.map((s) => s.trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  // IDs are matched exactly (in any letter case) - fast on the studentId index.
  const variants = (list: string[]) => [...new Set(list.flatMap((id) => [id, id.toLowerCase(), id.toUpperCase()]))];
  const accounts = await StudentAccount.find({ studentId: { $in: variants(ids) }, email: { $type: 'string' } }).select('studentId email').lean();
  for (const a of accounts) if (a.email) out.set(a.studentId.toLowerCase(), a.email);
  const missing = ids.filter((id) => !out.has(id.toLowerCase()));
  if (missing.length) {
    const rows = await Student.find({ studentId: { $in: variants(missing) }, email: { $type: 'string', $ne: '' } })
      .select('studentId email updatedAt')
      .sort({ updatedAt: -1 })
      .lean();
    for (const r of rows) {
      const k = r.studentId.toLowerCase();
      if (!out.has(k) && r.email) out.set(k, r.email);
    }
  }
  return out;
}

function defaultEmailHtml(m: StudentMessage) {
  const link = m.href
    ? `<p style="margin:24px 0;"><a href="${esc(baseUrl() + m.href)}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 22px;border-radius:6px;font-weight:600;">Open in the student portal</a></p>
       <p style="font-size:13px;color:#6b7280;">Sign in with your ULAB student Google account.</p>`
    : '';
  return `<p>${esc(m.body).replace(/\n/g, '<br />')}</p>${link}`;
}

/** Saves portal copies only (for callers that already sent their own email). */
export async function recordStudentNotifications(kind: string, messages: StudentMessage[], emailedIds: Set<string> = new Set()) {
  if (!messages.length) return;
  await StudentNotification.insertMany(
    messages.map((m) => ({
      studentId: m.studentId.toLowerCase(),
      kind,
      title: m.title,
      body: m.body,
      href: m.href ?? null,
      emailed: emailedIds.has(m.studentId.toLowerCase()),
    }))
  );
}

/**
 * Tells each student: a portal copy for everyone, an email for those with an address.
 * Never throws - a notification problem must not undo the action that caused it.
 */
export async function notifyStudents(kind: string, messages: StudentMessage[], opts: { email?: boolean } = {}) {
  const result = { notified: 0, emailed: 0, noEmail: 0, failed: 0 };
  try {
    if (!messages.length) return result;
    const emails = opts.email === false ? new Map<string, string>() : await studentEmails(messages.map((m) => m.studentId));
    const emailed = new Set<string>();
    for (const m of messages) {
      const to = emails.get(m.studentId.toLowerCase());
      if (!to) {
        if (opts.email !== false) result.noEmail++;
        continue;
      }
      if (emailed.size > 0) await sleep(EMAIL_GAP_MS);
      const sent = await sendMail({ to, subject: `[ULAB MMS] ${m.subject || m.title}`, html: mailShell(m.emailHtml ?? defaultEmailHtml(m)) });
      if (sent.ok) emailed.add(m.studentId.toLowerCase());
      else result.failed++;
    }
    await recordStudentNotifications(kind, messages, emailed);
    result.notified = messages.length;
    result.emailed = emailed.size;
  } catch (err) {
    console.error(`notifyStudents(${kind}) failed:`, err);
  }
  return result;
}
