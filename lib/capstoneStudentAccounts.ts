import StudentAccount from '@/models/StudentAccount';
import type { IStudentAccount } from '@/models/StudentAccount';

/**
 * Resolving capstone group members to StudentAccount records.
 *
 * Shared by group creation and single-member add so the two can't drift on how a name or
 * email is applied - that divergence is exactly how you end up with a cohort where half the
 * students have emails and half don't, depending on which screen added them.
 */

export interface MemberInput {
  studentId: string;
  name?: string;
  email?: string;
}

export interface ResolvedMember {
  account: IStudentAccount;
  studentIdText: string;
}

export interface ResolveWarning {
  studentId: string;
  message: string;
}

/**
 * Parses the member payload, accepting both the current shape
 * (`members: [{ studentId, name, email }]`) and the older
 * (`memberStudentIds: string[]` + `memberNames: Record<id, name>`).
 *
 * Kept tolerant of both because the older shape is still what an in-flight client bundle
 * will be sending right after a deploy.
 */
export function parseMemberInputs(body: Record<string, unknown>): MemberInput[] {
  if (Array.isArray(body?.members)) {
    const seen = new Set<string>();
    const out: MemberInput[] = [];
    for (const raw of body.members as Array<Record<string, unknown>>) {
      const studentId = typeof raw?.studentId === 'string' ? raw.studentId.trim() : '';
      if (!studentId || seen.has(studentId)) continue;
      seen.add(studentId);
      out.push({
        studentId,
        name: typeof raw?.name === 'string' ? raw.name.trim() : undefined,
        email: typeof raw?.email === 'string' ? raw.email.trim().toLowerCase() : undefined,
      });
    }
    return out;
  }

  const ids = Array.isArray(body?.memberStudentIds)
    ? (body.memberStudentIds as unknown[]).map((s) => String(s).trim()).filter(Boolean)
    : [];
  const names = (body?.memberNames || {}) as Record<string, string>;
  const seen = new Set<string>();
  return ids
    .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
    .map((studentId) => ({ studentId, name: names[studentId] }));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Finds or creates a StudentAccount per member, filling in any name/email supplied.
 *
 * Enrichment is fill-the-blanks only. An account that already carries a real name or email -
 * typically because that student has actually signed in, so those values are verified - is
 * never overwritten by coordinator-typed or URMS-scraped data. The one exception is a
 * placeholder name, which is the student ID itself: that is not information, so a real name
 * replaces it.
 *
 * Warnings are returned rather than thrown: one member with a duplicated email must not
 * block the other four from being added to the group.
 */
export async function resolveMembers(
  members: MemberInput[],
  department: string
): Promise<{ resolved: ResolvedMember[]; warnings: ResolveWarning[] }> {
  const resolved: ResolvedMember[] = [];
  const warnings: ResolveWarning[] = [];

  for (const member of members) {
    const { studentId, name, email } = member;

    const validEmail = email && EMAIL_RE.test(email) ? email : undefined;
    if (email && !validEmail) {
      warnings.push({ studentId, message: `"${email}" is not a valid email address, so it was skipped.` });
    }

    let account = await StudentAccount.findOne({ studentId });

    if (!account) {
      // A duplicate email on a DIFFERENT student would violate the unique index and throw.
      // Check first so the member is still created, just without the email.
      let emailToUse = validEmail;
      if (emailToUse) {
        const clash = await StudentAccount.findOne({ email: emailToUse });
        if (clash) {
          warnings.push({
            studentId,
            message: `${emailToUse} is already registered to student ${clash.studentId}, so it was not applied.`,
          });
          emailToUse = undefined;
        }
      }

      account = await StudentAccount.create({
        studentId,
        // Falling back to the ID keeps `name` (a required field) satisfied and is visibly a
        // placeholder, so a later lookup knows it can replace it.
        name: name || studentId,
        ...(emailToUse ? { email: emailToUse } : {}),
        department,
      });
      resolved.push({ account, studentIdText: studentId });
      continue;
    }

    const updates: Record<string, string> = {};

    // Placeholder names (name === studentId) carry no information, so a real one wins.
    if (name && (!account.name || account.name === account.studentId)) {
      updates.name = name;
    }

    if (validEmail && !account.email) {
      const clash = await StudentAccount.findOne({ email: validEmail, _id: { $ne: account._id } });
      if (clash) {
        warnings.push({
          studentId,
          message: `${validEmail} is already registered to student ${clash.studentId}, so it was not applied.`,
        });
      } else {
        updates.email = validEmail;
      }
    } else if (validEmail && account.email && account.email !== validEmail) {
      warnings.push({
        studentId,
        message: `Already has the email ${account.email}, so ${validEmail} was not applied.`,
      });
    }

    if (Object.keys(updates).length > 0) {
      Object.assign(account, updates);
      await account.save();
    }

    resolved.push({ account, studentIdText: studentId });
  }

  return { resolved, warnings };
}
