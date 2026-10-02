import CapstoneGroup, { type ICapstoneGroup } from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneMarkSubmission from '@/models/CapstoneMarkSubmission';
import StudentAccount from '@/models/StudentAccount';
import User from '@/models/User';
import WeeklyJournalEntry, { type IWeeklyJournalEntry } from '@/models/WeeklyJournalEntry';
import '@/models/Semester';
import { sendMail, mailShell, esc } from '@/lib/mail';
import { markingPlanForSession } from '@/lib/capstoneMarkingPlan';
import { groupJournalStatus, type GroupJournalStatus } from '@/lib/capstoneJournalStatus';
import { recordStudentNotifications, studentEmails } from '@/lib/studentNotify';

/**
 * The weekly-journal review cycle's server side (states in lib/capstoneJournalStatus.ts):
 *
 *   student saves a week   -> nothing yet. When the LAST active member of the group has
 *                             submitted that week, the supervisor gets ONE email for the
 *                             group's week (CapstoneGroup.journalWeeksNotified). Edits send
 *                             nothing. Emailed on their own: a resubmission of a week a
 *                             coordinator reopened, and a first entry for a week already
 *                             announced (a member who joined later).
 *   supervisor reviews     -> one pass: feedback is emailed to the student and the entry locks
 *   supervisor closes a    -> for a week never written, so the group can still finish
 *     missing week
 *   coordinator reopens    -> unlocks a closed entry; the student is told
 *   every member's weeks   -> the coordinators are emailed once that this group's journal is
 *     closed + journal marks  done and its marks are in (CapstoneGroup.journalCompletedAt).
 *     in                      Reopening anything clears that, so finishing again re-notifies.
 *
 * Emails never fail the request that triggered them - the action already happened.
 */


const baseUrl = () => process.env.NEXTAUTH_URL || '';

function button(href: string, label: string) {
  return `<p style="margin: 24px 0;">
    <a href="${esc(href)}" style="display: inline-block; background: #3b82f6; color: white; text-decoration: none;
       padding: 10px 22px; border-radius: 6px; font-weight: 600;">${esc(label)}</a>
  </p>`;
}

function quote(text: string) {
  return `<div style="margin: 12px 0; padding: 12px 14px; border-left: 3px solid #3b82f6; background: #f3f4f6;
    white-space: pre-wrap; font-size: 14px;">${esc(text)}</div>`;
}

async function safeSend(to: string | undefined | null, subject: string, html: string) {
  if (!to) return false;
  try {
    const result = await sendMail({ to, subject, html });
    return result.ok;
  } catch (err) {
    console.error('journal email failed:', err);
    return false;
  }
}

async function courseLabel(sessionId: unknown, track: string) {
  const session = await CapstoneSession.findById(sessionId).populate('semesterId', 'name').select('department semesterId');
  const semester =
    session && typeof session.semesterId === 'object' && session.semesterId !== null
      ? (session.semesterId as unknown as { name?: string }).name
      : '';
  return `${session?.department || ''} Capstone ${track}${semester ? ` (${semester})` : ''}`;
}

const excerpt = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** One student's week on its own: a reopened week resubmitted, or a late joiner's first entry. */
async function emailSingleEntry(group: ICapstoneGroup, entry: IWeeklyJournalEntry, verb: string) {
  const [supervisor, student, course] = await Promise.all([
    User.findById(group.supervisorId).select('name email').lean<{ name?: string; email?: string }>(),
    StudentAccount.findById(entry.studentAccountId).select('name studentId').lean<{ name?: string; studentId?: string }>(),
    courseLabel(group.sessionId, group.track),
  ]);
  if (!supervisor?.email) return;
  const who = `${student?.name || 'A student'}${student?.studentId ? ` (${student.studentId})` : ''}`;
  const ok = await safeSend(
    supervisor.email,
    `[ULAB MMS] Journal ${verb}: ${student?.name || 'Student'} - Week ${entry.weekNumber}`,
    mailShell(`
      <p>Dear ${esc(supervisor.name || 'Supervisor')},</p>
      <p><strong>${esc(who)}</strong> ${verb} their <strong>Week ${entry.weekNumber}</strong> journal for
        <strong>${esc(group.projectTitle)}</strong> (${esc(course)}, Group ${group.groupNumber}).</p>
      ${quote(excerpt(entry.workDone, 1200))}
      <p>Give your feedback once you've read it. Your feedback is final: the student is emailed it and can no
        longer edit that week.</p>
      ${button(`${baseUrl()}/capstone/groups/${group._id}?student=${entry.studentAccountId}`, 'Review journal')}
    `)
  );
  if (ok) await WeeklyJournalEntry.updateOne({ _id: entry._id }, { $set: { supervisorNotifiedAt: new Date() } });
}

/**
 * A student saved a week. The supervisor hears about a week once, when the group's last
 * active member has submitted it - one email for the whole group, not one per student.
 * Members whose week was closed as not submitted count as done. Edits send nothing.
 */
export async function notifySupervisorOfEntry(group: ICapstoneGroup, entry: IWeeklyJournalEntry, firstSubmission: boolean) {
  try {
    if (!group.supervisorId) return;
    const week = entry.weekNumber;

    // A week a coordinator reopened: its resubmission goes to the supervisor on its own.
    if (entry.reopenedAt && !entry.supervisorNotifiedAt) {
      await emailSingleEntry(group, entry, 'resubmitted');
      return;
    }

    const fresh = await CapstoneGroup.findById(group._id).select('members journalWeeksNotified').lean();
    if (!fresh) return;
    if ((fresh.journalWeeksNotified || []).includes(week)) {
      // Already announced: only a first entry is news (a member who joined after that).
      if (firstSubmission) await emailSingleEntry(group, entry, 'submitted');
      return;
    }

    const memberIds = fresh.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId));
    const entries = await WeeklyJournalEntry.find({ sessionId: group.sessionId, studentAccountId: { $in: memberIds }, weekNumber: week })
      .select('studentAccountId workDone submittedAt supervisorReviewedAt')
      .lean();
    const byStudent = new Map(entries.map((e) => [String(e.studentAccountId), e]));
    const done = (id: string) => {
      const e = byStudent.get(id);
      return !!e && (!!e.submittedAt || !!e.supervisorReviewedAt);
    };
    if (memberIds.length === 0 || !memberIds.every(done)) return;

    // Claim the week: one email per group per week, even when the last two save at once.
    const claimed = await CapstoneGroup.updateOne({ _id: group._id, journalWeeksNotified: { $ne: week } }, { $addToSet: { journalWeeksNotified: week } });
    if (claimed.modifiedCount !== 1) return;

    const [supervisor, students, course] = await Promise.all([
      User.findById(group.supervisorId).select('name email').lean<{ name?: string; email?: string }>(),
      StudentAccount.find({ _id: { $in: memberIds } }).select('name studentId').lean(),
      courseLabel(group.sessionId, group.track),
    ]);
    if (!supervisor?.email) return;
    const nameOf = new Map(students.map((st) => [String(st._id), st]));
    const waiting = memberIds.filter((id) => byStudent.get(id)?.submittedAt && !byStudent.get(id)?.supervisorReviewedAt);
    const rows = memberIds
      .map((id) => {
        const e = byStudent.get(id)!;
        const st = nameOf.get(id);
        const who = `${esc(st?.name || 'Student')}${st?.studentId ? ` (${esc(st.studentId)})` : ''}`;
        const state = !e.submittedAt ? 'closed as not submitted' : e.supervisorReviewedAt ? 'already reviewed' : 'waiting for your review';
        return `<p style="margin:14px 0 4px"><strong>${who}</strong> - ${state}</p>${e.submittedAt && !e.supervisorReviewedAt ? quote(excerpt(e.workDone || '', 600)) : ''}`;
      })
      .join('');
    const ok = await safeSend(
      supervisor.email,
      `[ULAB MMS] Week ${week} journals are in: Group ${group.groupNumber} - ${group.projectTitle}`,
      mailShell(`
        <p>Dear ${esc(supervisor.name || 'Supervisor')},</p>
        <p>Every member of <strong>${esc(group.projectTitle)}</strong> (${esc(course)}, Group ${group.groupNumber}) has
          submitted their <strong>Week ${week}</strong> journal. ${waiting.length === 1 ? '1 entry is' : `${waiting.length} entries are`} waiting for your review.</p>
        ${rows}
        <p>Your feedback is final: each student is emailed it and can no longer edit that week.</p>
        ${button(`${baseUrl()}/capstone/groups/${group._id}?tab=journal`, 'Review journals')}
      `)
    );
    if (ok) {
      await WeeklyJournalEntry.updateMany(
        { sessionId: group.sessionId, studentAccountId: { $in: waiting }, weekNumber: week },
        { $set: { supervisorNotifiedAt: new Date() } }
      );
    } else {
      // Not sent: release the week so the next save tries again.
      await CapstoneGroup.updateOne({ _id: group._id }, { $pull: { journalWeeksNotified: week } });
    }
  } catch (err) {
    console.error('notifySupervisorOfEntry failed:', err);
  }
}

/** Tell the student their week was reviewed, closed as not submitted, or reopened. */
export async function notifyStudentOfDecision(
  group: ICapstoneGroup,
  entry: { studentAccountId: unknown; weekNumber: number; supervisorComment?: string },
  kind: 'reviewed' | 'missed' | 'reopened',
  actorName: string
) {
  try {
    const [student, course] = await Promise.all([
      StudentAccount.findById(entry.studentAccountId).select('studentId name email').lean<{ studentId?: string; name?: string; email?: string }>(),
      courseLabel(group.sessionId, group.track),
    ]);
    if (!student?.studentId) return;
    // An address from a course roster when the account has none (URMS imports, manual adds).
    const to = student.email || (await studentEmails([student.studentId])).get(student.studentId.toLowerCase());

    const link = button(`${baseUrl()}/student/dashboard/capstone`, 'Open my weekly journal');
    const feedback = entry.supervisorComment?.trim() ? `<p>Feedback:</p>${quote(entry.supervisorComment)}` : '';
    const content =
      kind === 'reviewed'
        ? {
            subject: `[ULAB MMS] Feedback on your Week ${entry.weekNumber} journal`,
            body: `<p>${esc(actorName)} reviewed your <strong>Week ${entry.weekNumber}</strong> journal for
                <strong>${esc(group.projectTitle)}</strong> (${esc(course)}).</p>${feedback}
                <p>This week is now closed and can no longer be edited.</p>`,
          }
        : kind === 'missed'
          ? {
              subject: `[ULAB MMS] Week ${entry.weekNumber} journal closed as not submitted`,
              body: `<p>${esc(actorName)} closed your <strong>Week ${entry.weekNumber}</strong> journal for
                  <strong>${esc(group.projectTitle)}</strong> (${esc(course)}) as <strong>not submitted</strong>.</p>${feedback}
                  <p>If you believe this is a mistake, contact your supervisor.</p>`,
            }
          : {
              subject: `[ULAB MMS] Week ${entry.weekNumber} journal reopened`,
              body: `<p>${esc(actorName)} reopened your <strong>Week ${entry.weekNumber}</strong> journal for
                  <strong>${esc(group.projectTitle)}</strong> (${esc(course)}). You can edit and save it again;
                  your supervisor will be notified.</p>`,
            };

    const emailed = to ? await safeSend(to, content.subject, mailShell(`<p>Dear ${esc(student.name || 'Student')},</p>${content.body}${link}`)) : false;
    // The portal copy - the only one for students with no email on file.
    await recordStudentNotifications(
      'journal',
      [
        {
          studentId: student.studentId,
          title: content.subject.replace(/^\[ULAB MMS\]\s*/, ''),
          body:
            kind === 'reviewed'
              ? `${actorName} reviewed it.${entry.supervisorComment?.trim() ? ` Feedback: ${entry.supervisorComment.trim()}` : ''}`
              : kind === 'missed'
                ? `${actorName} closed it as not submitted.${entry.supervisorComment?.trim() ? ` ${entry.supervisorComment.trim()}` : ''}`
                : `${actorName} reopened it - you can edit and save it again.`,
          href: '/student/dashboard/capstone',
        },
      ],
      emailed ? new Set([student.studentId.toLowerCase()]) : new Set()
    );
  } catch (err) {
    console.error('notifyStudentOfDecision failed:', err);
  }
}

/** The session fields the journal status needs; pass one already loaded to skip a round trip. */
export type JournalSessionInfo = {
  journalWeekCount?: number;
  tracks?: Array<{ track: string; gradingSchemeId?: unknown; gradingSchemeVersion?: number | null }>;
};

/**
 * Where a routine that does DB work first and email second hands off the email part. Routes
 * pass Next's `after`, so the response doesn't wait on the mail server; left out, the work
 * is awaited in place (scripts, tests).
 */
export type Scheduler = (task: () => Promise<unknown>) => void;

async function runOrSchedule(task: () => Promise<unknown>, schedule?: Scheduler) {
  if (schedule) schedule(task);
  else await task();
}

/** The group's journal-mark submissions (the supervisor's weeklyJournal marks). */
export function journalMarksQuery(group: ICapstoneGroup) {
  return CapstoneMarkSubmission.find({
    groupId: group._id,
    component: 'weeklyJournal',
    submitterRole: 'supervisor',
    status: 'submitted',
  })
    .select('studentAccountId rawScore')
    .lean();
}

/** The status from data the caller already has - no database access except the scheme. */
export async function journalStatusFrom(
  group: ICapstoneGroup,
  session: JournalSessionInfo | null | undefined,
  entries: Array<{ studentAccountId: unknown; weekNumber: number; submittedAt?: Date | null; supervisorReviewedAt?: Date | null }>,
  marks: Array<{ studentAccountId: unknown; rawScore: number }>
): Promise<GroupJournalStatus> {
  const plan = await markingPlanForSession(session, group.track);
  return groupJournalStatus({
    weekCount: session?.journalWeekCount || 0,
    memberIds: group.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId)),
    entries: entries.map((e) => ({ ...e, studentAccountId: String(e.studentAccountId) })),
    journalMarks: new Map(marks.map((m) => [String(m.studentAccountId), m.rawScore])),
    marksRequired: plan.supervisor.some((r) => r.component === 'weeklyJournal'),
  });
}

/** Everything the journal status needs for one group, read fresh from the database. */
export async function loadGroupJournalStatus(group: ICapstoneGroup, preloadedSession?: JournalSessionInfo | null): Promise<GroupJournalStatus> {
  const memberIds = group.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId));
  const [session, entries, marks] = await Promise.all([
    preloadedSession ?? CapstoneSession.findById(group.sessionId).select('journalWeekCount tracks').lean<JournalSessionInfo>(),
    // By session, not group: a student's journal follows them if they move groups.
    WeeklyJournalEntry.find({ sessionId: group.sessionId, studentAccountId: { $in: memberIds } })
      .select('studentAccountId weekNumber submittedAt supervisorReviewedAt')
      .lean(),
    journalMarksQuery(group),
  ]);
  return journalStatusFrom(group, session, entries, marks);
}

/** Coordinators to tell: the session's own, else the department's. */
async function coordinatorRecipients(sessionId: unknown) {
  const session = await CapstoneSession.findById(sessionId).select('coordinatorIds department').lean<{
    coordinatorIds?: unknown[];
    department: string;
  }>();
  if (!session) return [];
  const query = session.coordinatorIds?.length
    ? { _id: { $in: session.coordinatorIds } }
    : { roles: 'coordinator', coordinatorDepartments: session.department };
  return User.find(query).select('name email').lean<Array<{ name?: string; email?: string }>>();
}

/**
 * Re-checks whether this group's journal is done and records the transition. Call after
 * anything that can change it: a review, a closed or reopened week, journal marks, a member
 * added or removed, the session's week count. Returns the fresh status.
 */
export async function syncJournalCompletion(
  groupId: unknown,
  options: { schedule?: Scheduler; session?: JournalSessionInfo | null; group?: ICapstoneGroup } = {}
): Promise<GroupJournalStatus | null> {
  try {
    // A group the caller loaded in this same request is fresh enough: the transition itself
    // is claimed atomically below, so a stale journalCompletedAt can't cause a double email.
    const group = options.group ?? (await CapstoneGroup.findById(groupId));
    if (!group) return null;
    const status = await loadGroupJournalStatus(group, options.session);

    if (!status.complete) {
      if (group.journalCompletedAt) await CapstoneGroup.updateOne({ _id: group._id }, { $set: { journalCompletedAt: null } });
      return status;
    }

    // Claim the transition atomically so two simultaneous last reviews can't both email.
    const claimed = await CapstoneGroup.findOneAndUpdate(
      { _id: group._id, journalCompletedAt: null },
      { $set: { journalCompletedAt: new Date() } },
      { new: true }
    );
    if (!claimed) return status;

    await runOrSchedule(() => notifyCoordinatorsComplete(group, status), options.schedule);
    return status;
  } catch (err) {
    console.error('syncJournalCompletion failed:', err);
    return null;
  }
}

async function notifyCoordinatorsComplete(group: ICapstoneGroup, status: GroupJournalStatus) {
  try {
    const [supervisor, students, recipients, course] = await Promise.all([
      User.findById(group.supervisorId).select('name').lean<{ name?: string }>(),
      StudentAccount.find({ _id: { $in: status.members.map((m) => m.studentAccountId) } }).select('name studentId').lean(),
      coordinatorRecipients(group.sessionId),
      courseLabel(group.sessionId, group.track),
    ]);
    const nameOf = new Map(students.map((s) => [String(s._id), s]));
    const rows = status.members
      .map((m) => {
        const s = nameOf.get(m.studentAccountId);
        return `<tr>
          <td style="padding: 4px 10px 4px 0;">${esc(s?.studentId || '')}</td>
          <td style="padding: 4px 10px 4px 0;">${esc(s?.name || '')}</td>
          <td style="padding: 4px 10px 4px 0; text-align: center;">${m.reviewed}</td>
          <td style="padding: 4px 10px 4px 0; text-align: center;">${m.missed}</td>
          ${status.marksRequired ? `<td style="padding: 4px 0; text-align: center; font-weight: 600;">${m.mark ?? '-'}</td>` : ''}
        </tr>`;
      })
      .join('');

    const html = mailShell(`
      <p>Dear Coordinator,</p>
      <p>The weekly journal for <strong>${esc(group.projectTitle)}</strong> (${esc(course)}, Group ${group.groupNumber})
        is complete. ${esc(supervisor?.name || 'The supervisor')} has closed all ${status.weekCount} weeks for every
        member${status.marksRequired ? ' and entered the weekly journal marks' : ''}.</p>
      <table style="margin: 12px 0; border-collapse: collapse; font-size: 14px;">
        <tr style="color: #6b7280; text-align: left;">
          <th style="padding: 4px 10px 4px 0;">ID</th><th style="padding: 4px 10px 4px 0;">Name</th>
          <th style="padding: 4px 10px 4px 0;">Reviewed</th><th style="padding: 4px 10px 4px 0;">Not submitted</th>
          ${status.marksRequired ? '<th style="padding: 4px 0;">Journal mark</th>' : ''}
        </tr>
        ${rows}
      </table>
      ${button(`${baseUrl()}/capstone/groups/${group._id}`, 'View group')}
    `);
    const subject = `[ULAB MMS] Weekly journal complete: Group ${group.groupNumber} - ${group.projectTitle}`;
    const results = await Promise.all(recipients.map((r) => safeSend(r.email, subject, html)));
    if (recipients.length === 0) console.warn(`syncJournalCompletion: no coordinator to notify for group ${group._id}`);
    else if (!results.some(Boolean)) console.warn(`syncJournalCompletion: could not email any coordinator for group ${group._id}`);
  } catch (err) {
    console.error('notifyCoordinatorsComplete failed:', err);
  }
}

// ── The four state changes ──────────────────────────────────────────────────────────────
//
// Each is a single conditional write, so the lock holds under races: two requests can't
// both win, and a student's save can never overwrite a reviewed week. Where an upsert's
// filter misses because the entry exists in a state that forbids the change, Mongo tries to
// insert a second (session, student, week) entry and the unique index rejects it (E11000),
// which is reported as a conflict. Notifications and the completion check are the caller's.

export type JournalOpResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

/** Student writes or edits a week. `firstSubmission` says whether the supervisor hears "submitted" or "updated". */
export async function saveStudentEntry(
  group: ICapstoneGroup,
  studentAccountId: string,
  weekNumber: number,
  fields: { workDone: string; periodStart?: Date | null; periodEnd?: Date | null },
  options: { mustBeNew?: boolean } = {}
): Promise<JournalOpResult<{ entry: IWeeklyJournalEntry; firstSubmission: boolean }>> {
  const previous = await WeeklyJournalEntry.findOne({ sessionId: group.sessionId, studentAccountId, weekNumber })
    .select('submittedAt supervisorReviewedAt')
    .lean();
  if (previous?.supervisorReviewedAt) {
    return {
      ok: false,
      status: 409,
      error: previous.submittedAt
        ? `Week ${weekNumber} has been reviewed by your supervisor and can no longer be edited.`
        : `Your supervisor closed Week ${weekNumber} as not submitted, so it can no longer be written.`,
    };
  }
  // A "new entry" for a week that already has one (written from another tab or device) is a
  // stale screen, not an edit - refuse rather than silently replace what was written.
  if (options.mustBeNew && previous?.submittedAt) {
    return { ok: false, status: 409, error: `Week ${weekNumber} already has an entry. Refresh to see it - you can edit it from there.` };
  }
  try {
    const entry = await WeeklyJournalEntry.findOneAndUpdate(
      { sessionId: group.sessionId, studentAccountId, weekNumber, supervisorReviewedAt: null },
      {
        $set: {
          groupId: group._id,
          periodStart: fields.periodStart ?? null,
          periodEnd: fields.periodEnd ?? null,
          workDone: fields.workDone.trim(),
          submittedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { ok: true, value: { entry: entry!, firstSubmission: !previous?.submittedAt } };
  } catch (err) {
    if (isDuplicateKey(err)) {
      return { ok: false, status: 409, error: `Week ${weekNumber} was just reviewed by your supervisor and can no longer be edited.` };
    }
    throw err;
  }
}

/** Supervisor's one pass on a submitted week: feedback (may be empty) and the lock. */
export async function reviewEntry(
  group: ICapstoneGroup,
  entryId: string,
  feedback: string,
  reviewerId: string
): Promise<JournalOpResult<IWeeklyJournalEntry>> {
  const memberIds = group.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId));
  const entry = await WeeklyJournalEntry.findOneAndUpdate(
    {
      _id: entryId,
      sessionId: group.sessionId,
      studentAccountId: { $in: memberIds },
      submittedAt: { $ne: null },
      supervisorReviewedAt: null,
    },
    { $set: { supervisorComment: feedback, supervisorReviewedAt: new Date(), supervisorId: reviewerId, studentNotifiedAt: null } },
    { new: true }
  );
  if (!entry) return { ok: false, status: 409, error: 'This entry was already reviewed, or no longer exists. Refresh to see it.' };
  return { ok: true, value: entry };
}

/** Supervisor closes a week the student never wrote. */
export async function closeMissedWeek(
  group: ICapstoneGroup,
  studentAccountId: string,
  weekNumber: number,
  feedback: string,
  reviewerId: string
): Promise<JournalOpResult<IWeeklyJournalEntry>> {
  const memberIds = group.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId));
  if (!memberIds.includes(studentAccountId)) {
    return { ok: false, status: 400, error: 'That student is not an active member of this group' };
  }
  try {
    const entry = await WeeklyJournalEntry.findOneAndUpdate(
      { sessionId: group.sessionId, studentAccountId, weekNumber, submittedAt: null, supervisorReviewedAt: null },
      {
        $set: { groupId: group._id, supervisorComment: feedback, supervisorReviewedAt: new Date(), supervisorId: reviewerId, studentNotifiedAt: null },
        $setOnInsert: { workDone: '' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { ok: true, value: entry! };
  } catch (err) {
    if (isDuplicateKey(err)) {
      return { ok: false, status: 409, error: `The student has submitted Week ${weekNumber} (or it was already closed). Refresh to review it.` };
    }
    throw err;
  }
}

/**
 * Coordinator unlocks a closed week. A reviewed week goes back to "awaiting review" with its
 * text kept; a week closed as not submitted had nothing in it, so it is removed.
 */
export async function reopenEntry(
  group: ICapstoneGroup,
  entryId: string,
  reopenerId: string
): Promise<JournalOpResult<IWeeklyJournalEntry>> {
  const existing = await WeeklyJournalEntry.findOne({ _id: entryId, sessionId: group.sessionId, supervisorReviewedAt: { $ne: null } });
  if (!existing) return { ok: false, status: 409, error: 'This entry is not closed' };
  if (!existing.submittedAt) {
    await WeeklyJournalEntry.deleteOne({ _id: existing._id, submittedAt: null });
  } else {
    await WeeklyJournalEntry.updateOne(
      { _id: existing._id, supervisorReviewedAt: { $ne: null } },
      {
        $set: {
          supervisorReviewedAt: null,
          supervisorComment: '',
          reopenedAt: new Date(),
          reopenedBy: reopenerId,
          // The student's next save emails the supervisor straight away.
          supervisorNotifiedAt: null,
        },
      }
    );
  }
  return { ok: true, value: existing };
}


/**
 * Supervisor (or coordinator) fixes a mistake in place: the student's text of a written
 * week, and/or the response on a closed week. Nothing is reopened or re-sent;
 * `correctedAt` / `correctedBy` are stamped so the record (and the PDF) shows the edit.
 */
export async function correctEntry(
  group: ICapstoneGroup,
  entryId: string,
  correctorId: string,
  fields: { workDone?: string; supervisorComment?: string }
): Promise<JournalOpResult<IWeeklyJournalEntry>> {
  if (fields.workDone === undefined && fields.supervisorComment === undefined) {
    return { ok: false, status: 400, error: 'Nothing to correct' };
  }
  const memberIds = group.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId));
  const existing = await WeeklyJournalEntry.findOne({ _id: entryId, sessionId: group.sessionId, studentAccountId: { $in: memberIds } })
    .select('submittedAt supervisorReviewedAt')
    .lean();
  if (!existing) return { ok: false, status: 404, error: 'Entry not found. Refresh to see the journal as it is now.' };
  const set: Record<string, unknown> = { correctedAt: new Date(), correctedBy: correctorId };
  if (fields.workDone !== undefined) {
    if (!existing.submittedAt) return { ok: false, status: 409, error: 'The student never wrote this week, so there is no text to correct.' };
    if (!fields.workDone.trim()) return { ok: false, status: 400, error: 'The entry cannot be empty. To remove it, delete the entry instead.' };
    set.workDone = fields.workDone.trim();
  }
  if (fields.supervisorComment !== undefined) {
    if (!existing.supervisorReviewedAt) return { ok: false, status: 409, error: 'This week has no response yet - review it instead.' };
    set.supervisorComment = fields.supervisorComment.trim();
  }
  const entry = await WeeklyJournalEntry.findOneAndUpdate({ _id: entryId }, { $set: set }, { new: true });
  if (!entry) return { ok: false, status: 404, error: 'Entry not found. Refresh to see the journal as it is now.' };
  return { ok: true, value: entry };
}

/**
 * Supervisor (or coordinator) takes back a response given by mistake. A reviewed week goes
 * back to "waiting for review" (the student's text is kept, and they may edit it again); a
 * week closed as not submitted goes back to "not written". No email is sent.
 */
export async function retractResponse(group: ICapstoneGroup, entryId: string, correctorId: string): Promise<JournalOpResult<IWeeklyJournalEntry>> {
  const memberIds = group.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId));
  const existing = await WeeklyJournalEntry.findOne({
    _id: entryId,
    sessionId: group.sessionId,
    studentAccountId: { $in: memberIds },
    supervisorReviewedAt: { $ne: null },
  });
  if (!existing) return { ok: false, status: 409, error: 'This week has no response to remove. Refresh to see it as it is now.' };
  if (!existing.submittedAt) {
    await WeeklyJournalEntry.deleteOne({ _id: existing._id, submittedAt: null });
  } else {
    await WeeklyJournalEntry.updateOne(
      { _id: existing._id, supervisorReviewedAt: { $ne: null } },
      {
        $set: { supervisorReviewedAt: null, supervisorComment: '', supervisorId: null, correctedAt: new Date(), correctedBy: correctorId },
        $unset: { studentNotifiedAt: 1 },
      }
    );
  }
  return { ok: true, value: existing };
}

/**
 * Supervisor (or coordinator) deletes a week written by mistake (wrong week, wrong text) -
 * whatever its state; a response on it goes with it. The week is then "not written" again,
 * so the student can write it afresh.
 */
export async function deleteEntry(
  group: ICapstoneGroup,
  entryId: string
): Promise<JournalOpResult<{ weekNumber: number; studentAccountId: string }>> {
  const memberIds = group.members.filter((m) => !m.removedAt).map((m) => String(m.studentAccountId));
  const existing = await WeeklyJournalEntry.findOneAndDelete({
    _id: entryId,
    sessionId: group.sessionId,
    studentAccountId: { $in: memberIds },
  }).lean();
  if (!existing) return { ok: false, status: 404, error: 'Entry not found. Refresh to see the journal as it is now.' };
  return { ok: true, value: { weekNumber: existing.weekNumber, studentAccountId: String(existing.studentAccountId) } };
}

/** A portal note (no email) when the supervisor changed a student's journal. */
export async function noteJournalChange(studentAccountId: string, weekNumber: number, what: 'corrected' | 'deleted' | 'retracted', actorName: string) {
  try {
    const account = await StudentAccount.findById(studentAccountId).select('studentId').lean<{ studentId?: string }>();
    if (!account?.studentId) return;
    const body =
      what === 'deleted'
        ? `${actorName} deleted your Week ${weekNumber} journal entry. You can write that week again.`
        : what === 'retracted'
          ? `${actorName} took back the response on your Week ${weekNumber} journal entry. It is waiting for review again.`
          : `${actorName} corrected your Week ${weekNumber} journal entry.`;
    await recordStudentNotifications('capstone-journal', [{ studentId: account.studentId, title: `Week ${weekNumber} journal ${what}`, body, href: '/student/dashboard/capstone' }]);
  } catch (err) {
    console.error('noteJournalChange failed:', err);
  }
}

// ── Student feedback emails, as one digest per student ──────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Gap between two emails: Gmail answers a burst with "421 too many connections". */
const EMAIL_GAP_MS = 1200;

/**
 * Emails each student ONE message covering every week of theirs that was reviewed or closed
 * and not yet emailed about. Weeks are claimed before sending, so two flushes at once never
 * email the same week twice. Emails go one after another, never in parallel.
 */
export async function flushStudentFeedbackEmails(group: ICapstoneGroup, reviewerName: string): Promise<{ students: number; weeks: number }> {
  const memberIds = group.members.filter((m) => !m.removedAt).map((m) => m.studentAccountId);
  const owed = await WeeklyJournalEntry.find({
    sessionId: group.sessionId,
    studentAccountId: { $in: memberIds },
    supervisorReviewedAt: { $ne: null },
    studentNotifiedAt: { $type: 'null' },
  })
    .select('_id')
    .lean();
  if (owed.length === 0) return { students: 0, weeks: 0 };

  // A distinct claim time per flush: only the weeks this call claimed carry it.
  const claim = new Date(Date.now() + Math.floor(Math.random() * 1000));
  await WeeklyJournalEntry.updateMany({ _id: { $in: owed.map((o) => o._id) }, studentNotifiedAt: { $type: 'null' } }, { $set: { studentNotifiedAt: claim } });
  const mine = await WeeklyJournalEntry.find({ _id: { $in: owed.map((o) => o._id) }, studentNotifiedAt: claim })
    .select('studentAccountId weekNumber submittedAt supervisorComment')
    .sort({ weekNumber: 1 })
    .lean();
  if (mine.length === 0) return { students: 0, weeks: 0 };

  const byStudent = new Map<string, typeof mine>();
  for (const e of mine) {
    const k = String(e.studentAccountId);
    if (!byStudent.has(k)) byStudent.set(k, []);
    byStudent.get(k)!.push(e);
  }
  const [students, course] = await Promise.all([
    StudentAccount.find({ _id: { $in: [...byStudent.keys()] } }).select('studentId name email').lean(),
    courseLabel(group.sessionId, group.track),
  ]);
  const rosterEmails = await studentEmails(students.filter((st) => !st.email).map((st) => st.studentId));
  const portal: Array<{ studentId: string; title: string; body: string; href: string }> = [];
  const emailedIds = new Set<string>();

  let sent = 0;
  for (const student of students) {
    const weeks = byStudent.get(String(student._id)) || [];
    if (weeks.length === 0) continue;
    portal.push({
      studentId: student.studentId,
      title: weeks.length === 1 ? `Feedback on your Week ${weeks[0].weekNumber} journal` : `Feedback on ${weeks.length} weeks of your journal`,
      body: `${reviewerName} reviewed ${weeks.map((w) => `Week ${w.weekNumber}`).join(', ')}.`,
      href: '/student/dashboard/capstone',
    });
    const to = student.email || rosterEmails.get(student.studentId.toLowerCase());
    if (!to) continue;
    const rows = weeks
      .map((w) => {
        const status = w.submittedAt ? 'Reviewed' : 'Closed as not submitted';
        const fb = w.supervisorComment?.trim() ? quote(w.supervisorComment) : '<p style="margin:4px 0 12px;color:#6b7280;">No comment.</p>';
        return `<p style="margin:16px 0 4px;"><strong>Week ${w.weekNumber}</strong> - ${status}</p>${fb}`;
      })
      .join('');
    const subject =
      weeks.length === 1
        ? `[ULAB MMS] Feedback on your Week ${weeks[0].weekNumber} journal`
        : `[ULAB MMS] Feedback on ${weeks.length} weeks of your journal`;
    if (sent > 0) await sleep(EMAIL_GAP_MS);
    const ok = await safeSend(
      to,
      subject,
      mailShell(`
        <p>Dear ${esc(student.name || 'Student')},</p>
        <p>${esc(reviewerName)} reviewed your weekly journal for <strong>${esc(group.projectTitle)}</strong> (${esc(course)}).
          Reviewed weeks are closed and can no longer be edited.</p>
        ${rows}
        ${button(`${baseUrl()}/student/dashboard/capstone`, 'Open my weekly journal')}
      `)
    );
    if (ok) {
      sent++;
      emailedIds.add(student.studentId.toLowerCase());
    } else {
      // Not delivered: owe it again so the next flush retries.
      await WeeklyJournalEntry.updateMany({ _id: { $in: weeks.map((w) => w._id) }, studentNotifiedAt: claim }, { $set: { studentNotifiedAt: null } });
    }
  }
  await recordStudentNotifications('journal', portal, emailedIds);
  return { students: sent, weeks: mine.length };
}

/**
 * Tells a newly assigned supervisor they now have the group, including how many journal
 * entries are already waiting for them. Invited people who haven't signed up yet are skipped:
 * their invitation email already covers it.
 */
export async function notifyNewSupervisor(group: ICapstoneGroup, actorName: string, previousName?: string | null) {
  try {
    const memberIds = group.members.filter((m) => !m.removedAt).map((m) => m.studentAccountId);
    const [supervisor, course, waiting] = await Promise.all([
      User.findById(group.supervisorId).select('name email invitePending').lean<{ name?: string; email?: string; invitePending?: boolean }>(),
      courseLabel(group.sessionId, group.track),
      WeeklyJournalEntry.countDocuments({
        sessionId: group.sessionId,
        studentAccountId: { $in: memberIds },
        submittedAt: { $ne: null },
        supervisorReviewedAt: null,
      }),
    ]);
    if (!supervisor?.email || supervisor.invitePending) return;

    const handover = previousName ? ` It was previously supervised by ${esc(previousName)}.` : '';
    const pending =
      waiting > 0
        ? `<p><strong>${waiting} journal entr${waiting === 1 ? 'y is' : 'ies are'} waiting for your review.</strong></p>`
        : '';
    await safeSend(
      supervisor.email,
      `[ULAB MMS] You are now the supervisor of ${group.projectTitle || 'a capstone group'}`,
      mailShell(`
        <p>Dear ${esc(supervisor.name || 'Faculty member')},</p>
        <p>${esc(actorName)} made you the <strong>supervisor</strong> of <strong>${esc(group.projectTitle || 'Untitled project')}</strong>
          (${esc(course)}, Group ${group.groupNumber}), with ${memberIds.length} student${memberIds.length === 1 ? '' : 's'}.${handover}</p>
        <p>From now on you review the group's weekly journals and give the supervisor marks. Feedback and marks
          given before the change are kept.</p>
        ${pending}
        ${button(`${baseUrl()}/capstone/groups/${group._id}`, 'Open the group')}
      `)
    );
  } catch (err) {
    console.error('notifyNewSupervisor failed:', err);
  }
}
