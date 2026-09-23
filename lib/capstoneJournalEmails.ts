import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import StudentAccount from '@/models/StudentAccount';
import User from '@/models/User';
import WeeklyJournalEntry from '@/models/WeeklyJournalEntry';
import '@/models/Semester';
import { sendMail, mailShell, esc } from '@/lib/mail';

/**
 * Weekly-journal emails to capstone students.
 *
 *  - 'added':    sent once when a student is added to a group (the coordinator ticks
 *                "Save & email" in the dialog) - tells them their group and how the journal works.
 *  - 'reminder': sent by the group's supervisor (or a coordinator) - "please keep your
 *                journal up to date", with each student's own submitted/total weeks.
 *
 * The journal is per person (one entry per student per week, matching the department's
 * docx template), so progress is counted per student, not per group.
 */

export type JournalEmailKind = 'added' | 'reminder';

export interface JournalEmailResult {
  sent: number;
  failed: number;
  /** Students with no email on record - they could not be emailed at all. */
  noEmail: Array<{ studentId: string; name: string }>;
}

/** Minimum gap between two reminders to the same group, so a double-click can't send twice. */
export const REMINDER_COOLDOWN_MS = 10 * 60 * 1000;

export async function sendGroupJournalEmails(
  groupId: string,
  kind: JournalEmailKind,
  options: { studentAccountIds?: string[]; senderName?: string } = {}
): Promise<JournalEmailResult> {
  const group = await CapstoneGroup.findById(groupId);
  if (!group) return { sent: 0, failed: 0, noEmail: [] };

  const session = await CapstoneSession.findById(group.sessionId).populate('semesterId', 'name');
  const supervisor = await User.findById(group.supervisorId).select('name').lean<{ name?: string }>();

  const activeIds = group.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId));
  const targetIds = options.studentAccountIds?.length
    ? activeIds.filter((id) => options.studentAccountIds!.includes(id))
    : activeIds;
  const students = await StudentAccount.find({ _id: { $in: targetIds } }).select('studentId name email').lean();

  // Submitted weeks per student, for the reminder's progress line.
  const entries = await WeeklyJournalEntry.find({
    groupId: group._id,
    studentAccountId: { $in: targetIds },
    submittedAt: { $ne: null },
  })
    .select('studentAccountId')
    .lean();
  const submittedBy = new Map<string, number>();
  for (const e of entries) {
    const id = String(e.studentAccountId);
    submittedBy.set(id, (submittedBy.get(id) || 0) + 1);
  }

  const semesterName =
    session && typeof session.semesterId === 'object' && session.semesterId !== null
      ? (session.semesterId as unknown as { name?: string }).name
      : undefined;
  const totalWeeks = session?.journalWeekCount || 0;
  const baseUrl = process.env.NEXTAUTH_URL || '';
  const journalUrl = `${baseUrl}/student/dashboard/capstone`;

  const result: JournalEmailResult = { sent: 0, failed: 0, noEmail: [] };
  for (const student of students) {
    if (!student.email) {
      result.noEmail.push({ studentId: student.studentId, name: student.name });
      continue;
    }
    const submitted = submittedBy.get(String(student._id)) || 0;
    const { subject, html } = buildEmail(kind, {
      studentName: student.name,
      projectTitle: group.projectTitle,
      track: group.track,
      groupNumber: group.groupNumber,
      department: session?.department || '',
      semesterName,
      supervisorName: supervisor?.name,
      senderName: options.senderName,
      submitted,
      totalWeeks,
      journalUrl,
    });
    const sent = await sendMail({ to: student.email, subject, html });
    if (sent.ok) result.sent += 1;
    else result.failed += 1;
  }

  if (kind === 'reminder' && result.sent > 0) {
    group.lastJournalReminderAt = new Date();
    await group.save();
  }
  return result;
}

function buildEmail(
  kind: JournalEmailKind,
  d: {
    studentName: string;
    projectTitle: string;
    track: string;
    groupNumber: number;
    department: string;
    semesterName?: string;
    supervisorName?: string;
    senderName?: string;
    submitted: number;
    totalWeeks: number;
    journalUrl: string;
  }
) {
  const course = `${esc(d.department)} Capstone ${esc(d.track)}${d.semesterName ? ` (${esc(d.semesterName)})` : ''}`;
  const button = `
    <p style="margin: 24px 0;">
      <a href="${esc(d.journalUrl)}"
         style="display: inline-block; background: #3b82f6; color: white; text-decoration: none;
                padding: 10px 22px; border-radius: 6px; font-weight: 600;">
        Open My Weekly Journal
      </a>
    </p>
    <p style="font-size: 13px; color: #6b7280;">Sign in with your ULAB student Google account.</p>`;

  if (kind === 'added') {
    return {
      subject: `[ULAB MMS] You've been added to a capstone group - ${d.projectTitle}`,
      html: mailShell(`
        <p>Dear ${esc(d.studentName)},</p>
        <p>You have been added to a group for <strong>${course}</strong>:</p>
        <table style="margin: 12px 0; border-collapse: collapse;">
          <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Project</td><td style="font-weight: 600;">${esc(d.projectTitle)}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Group</td><td>Track ${esc(d.track)} #${d.groupNumber}</td></tr>
          ${d.supervisorName ? `<tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">Supervisor</td><td>${esc(d.supervisorName)}</td></tr>` : ''}
        </table>
        <p>Every week, write a short <strong>weekly journal</strong> entry of the work you did. Each
          student keeps their own journal${d.totalWeeks ? ` for ${d.totalWeeks} weeks` : ''}, and your
          supervisor reviews it - it counts towards your grade.</p>
        ${button}
      `),
    };
  }

  const progress = d.totalWeeks
    ? `You have submitted <strong>${d.submitted} of ${d.totalWeeks}</strong> weekly journal entries so far.`
    : `You have submitted <strong>${d.submitted}</strong> weekly journal entr${d.submitted === 1 ? 'y' : 'ies'} so far.`;
  return {
    subject: `[ULAB MMS] Reminder: update your capstone weekly journal`,
    html: mailShell(`
      <p>Dear ${esc(d.studentName)},</p>
      <p>${d.senderName ? `${esc(d.senderName)} is` : 'Your supervisor is'} reminding you to keep your
        weekly journal up to date for <strong>${esc(d.projectTitle)}</strong> (${course}).</p>
      <p>${progress}</p>
      ${button}
    `),
  };
}
