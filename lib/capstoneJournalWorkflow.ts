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

/**
 * The weekly-journal review cycle's server side (states in lib/capstoneJournalStatus.ts):
 *
 *   student saves a week   -> the supervisor is emailed (first save always; later edits at
 *                             most every UPDATE_EMAIL_GAP_MS, so a student fixing typos
 *                             doesn't flood their inbox)
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

export const UPDATE_EMAIL_GAP_MS = 30 * 60 * 1000;

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

/** Student saved a week: tell the supervisor, unless they were told about this entry very recently. */
export async function notifySupervisorOfEntry(group: ICapstoneGroup, entry: IWeeklyJournalEntry, firstSubmission: boolean) {
  try {
    const last = entry.supervisorNotifiedAt ? new Date(entry.supervisorNotifiedAt).getTime() : 0;
    if (!firstSubmission && Date.now() - last < UPDATE_EMAIL_GAP_MS) return;

    const [supervisor, student, course] = await Promise.all([
      User.findById(group.supervisorId).select('name email').lean<{ name?: string; email?: string }>(),
      StudentAccount.findById(entry.studentAccountId).select('name studentId').lean<{ name?: string; studentId?: string }>(),
      courseLabel(group.sessionId, group.track),
    ]);
    if (!supervisor?.email) return;

    const who = `${student?.name || 'A student'}${student?.studentId ? ` (${student.studentId})` : ''}`;
    const verb = firstSubmission ? 'submitted' : 'updated';
    const ok = await safeSend(
      supervisor.email,
      `[ULAB MMS] Journal ${verb}: ${student?.name || 'Student'} - Week ${entry.weekNumber}`,
      mailShell(`
        <p>Dear ${esc(supervisor.name || 'Supervisor')},</p>
        <p><strong>${esc(who)}</strong> ${verb} their <strong>Week ${entry.weekNumber}</strong> journal for
          <strong>${esc(group.projectTitle)}</strong> (${esc(course)}, Group ${group.groupNumber}).</p>
        ${quote(entry.workDone.length > 1200 ? `${entry.workDone.slice(0, 1200)}…` : entry.workDone)}
        <p>Give your feedback once you've read it. Your feedback is final: the student is emailed it and can no
          longer edit that week.</p>
        ${button(`${baseUrl()}/capstone/groups/${group._id}?student=${entry.studentAccountId}`, 'Review journal')}
      `)
    );
    if (ok) await WeeklyJournalEntry.updateOne({ _id: entry._id }, { $set: { supervisorNotifiedAt: new Date() } });
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
      StudentAccount.findById(entry.studentAccountId).select('name email').lean<{ name?: string; email?: string }>(),
      courseLabel(group.sessionId, group.track),
    ]);
    if (!student?.email) return;

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

    await safeSend(student.email, content.subject, mailShell(`<p>Dear ${esc(student.name || 'Student')},</p>${content.body}${link}`));
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
    StudentAccount.find({ _id: { $in: [...byStudent.keys()] } }).select('name email').lean(),
    courseLabel(group.sessionId, group.track),
  ]);

  let sent = 0;
  for (const student of students) {
    const weeks = byStudent.get(String(student._id)) || [];
    if (!student.email || weeks.length === 0) continue;
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
      student.email,
      subject,
      mailShell(`
        <p>Dear ${esc(student.name || 'Student')},</p>
        <p>${esc(reviewerName)} reviewed your weekly journal for <strong>${esc(group.projectTitle)}</strong> (${esc(course)}).
          Reviewed weeks are closed and can no longer be edited.</p>
        ${rows}
        ${button(`${baseUrl()}/student/dashboard/capstone`, 'Open my weekly journal')}
      `)
    );
    if (ok) sent++;
    else {
      // Not delivered: owe it again so the next flush retries.
      await WeeklyJournalEntry.updateMany({ _id: { $in: weeks.map((w) => w._id) }, studentNotifiedAt: claim }, { $set: { studentNotifiedAt: null } });
    }
  }
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
