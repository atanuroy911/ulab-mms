import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Student from '@/models/Student';
import StudentAccount from '@/models/StudentAccount';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';
import GradingScheme from '@/models/GradingScheme';
import User from '@/models/User';
import '@/models/Semester';
import { getCapstoneActor, isAdmin } from '@/lib/capstoneAuth';
import { isPastSession, statusLabel } from '@/lib/capstoneStatus';
import { PEOPLE_ONLY } from '@/lib/webAdminAccount';

// GET /api/search?q=...
// Records for the global search (Ctrl/Cmd+K), strictly scoped to what the caller can open:
//  - courses and their students: the teacher's own courses only (courses are per teacher)
//  - capstone groups and capstone students: groups they grade; plus their departments'
//    groups for coordinators, and every group for admins
//  - capstone sessions and grading schemes: coordinators (own departments) and admins
//  - user accounts: admins only
// Every link lands on the exact place (a view, tab, dialog or pre-filled search).

export interface SearchResult {
  id: string;
  kind: 'course' | 'student' | 'group' | 'capstoneStudent' | 'session' | 'scheme' | 'user';
  title: string;
  subtitle: string;
  href: string;
}

const LIMIT = 6;

function pattern(q: string): RegExp {
  return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export async function GET(request: NextRequest) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 80);
    if (q.length < 2) return NextResponse.json({ results: [] });
    const re = pattern(q);

    await dbConnect();

    const admin = isAdmin(actor);
    const coordinatorDepts = actor.coordinatorDepartments || [];
    const manager = admin || (actor.roles.includes('coordinator') && coordinatorDepts.length > 0);
    // The /admin panel login alone has no courses; its capstone links go through the panel.
    const person = !actor.systemAccount;
    const sessionsHref = person ? '/capstone/sessions' : '/admin/dashboard?tab=capstone';
    const results: SearchResult[] = [];

    // ── Own courses and their students ─────────────────────────────────────────────────
    if (person && mongoose.Types.ObjectId.isValid(actor.userId)) {
      const userId = new mongoose.Types.ObjectId(actor.userId);
      const courses = await Course.find({ userId, $or: [{ code: re }, { name: re }, { section: re }] })
        .select('code name section semester year isArchived')
        .sort({ isArchived: 1, year: -1 })
        .limit(LIMIT)
        .lean();
      for (const c of courses) {
        results.push({
          id: String(c._id),
          kind: 'course',
          title: `${c.code} - ${c.name}`,
          subtitle: `${c.semester} ${c.year} · Section ${c.section}${c.isArchived ? ' · archived' : ''}`,
          href: `/course/${c._id}`,
        });
      }

      const ownCourses = await Course.find({ userId }).select('_id code section').lean();
      if (ownCourses.length > 0) {
        const courseById = new Map(ownCourses.map((c) => [String(c._id), c]));
        const students = await Student.find({
          courseId: { $in: ownCourses.map((c) => c._id) },
          $or: [{ studentId: re }, { name: re }],
        })
          .select('studentId name courseId')
          .limit(LIMIT)
          .lean();
        for (const st of students) {
          const course = courseById.get(String(st.courseId));
          results.push({
            id: String(st._id),
            kind: 'student',
            title: `${st.name} (${st.studentId})`,
            subtitle: course ? `Student in ${course.code} · Section ${course.section}` : 'Student',
            href: `/course/${st.courseId}?view=students&student=${encodeURIComponent(st.studentId)}`,
          });
        }
      }
    }

    // ── Capstone groups the caller can open ────────────────────────────────────────────
    const groupScope: Record<string, unknown>[] = [];
    if (person) {
      groupScope.push({ supervisorId: actor.userId }, { evaluators: { $elemMatch: { evaluatorId: actor.userId, unassignedAt: null } } });
    }
    let sessionFilter: Record<string, unknown> | null = null;
    if (admin) sessionFilter = {};
    else if (manager) sessionFilter = { department: { $in: coordinatorDepts } };
    if (sessionFilter) {
      const managedSessions = await CapstoneSession.find(sessionFilter).select('_id').lean();
      if (managedSessions.length) groupScope.push({ sessionId: { $in: managedSessions.map((s) => s._id) } });
    }

    if (groupScope.length > 0) {
      const matchingAccounts = await StudentAccount.find({ $or: [{ studentId: re }, { name: re }] })
        .select('_id studentId name')
        .limit(50)
        .lean();
      const accountById = new Map(matchingAccounts.map((a) => [String(a._id), a]));

      const groups = await CapstoneGroup.find({
        $and: [
          { $or: groupScope },
          {
            $or: [
              { projectTitle: re },
              ...(matchingAccounts.length
                ? [{ members: { $elemMatch: { studentAccountId: { $in: matchingAccounts.map((a) => a._id) }, removedAt: null } } }]
                : []),
            ],
          },
        ],
      })
        .select('track groupNumber projectTitle members sessionId')
        .limit(LIMIT * 2)
        .lean();

      // Finished semesters' groups still match, but are labelled and listed after current ones.
      const sessionStatus = new Map(
        (await CapstoneSession.find({ _id: { $in: [...new Set(groups.map((g) => String(g.sessionId)))] } }).select('status').lean()).map(
          (x) => [String(x._id), x.status]
        )
      );
      const isPast = (g: (typeof groups)[number]) => isPastSession(sessionStatus.get(String(g.sessionId)));
      groups.sort((a, b) => Number(isPast(a)) - Number(isPast(b)));

      for (const g of groups) {
        const label = `Capstone ${g.track} #${g.groupNumber}${isPast(g) ? ' · Past semester' : ''}`;
        if (re.test(g.projectTitle) && results.filter((r) => r.kind === 'group').length < LIMIT) {
          results.push({ id: String(g._id), kind: 'group', title: g.projectTitle, subtitle: label, href: `/capstone/groups/${g._id}` });
        }
        for (const m of g.members) {
          if (m.removedAt) continue;
          const account = accountById.get(String(m.studentAccountId));
          if (!account || results.filter((r) => r.kind === 'capstoneStudent').length >= LIMIT) continue;
          results.push({
            id: `${g._id}:${account._id}`,
            kind: 'capstoneStudent',
            title: `${account.name} (${account.studentId})`,
            subtitle: `${label} · ${g.projectTitle}`,
            href: `/capstone/groups/${g._id}?student=${account._id}`,
          });
        }
      }
    }

    // ── Sessions and grading schemes (coordinators / admins) ───────────────────────────
    if (manager && sessionFilter) {
      const sessions = await CapstoneSession.find(sessionFilter)
        .populate('semesterId', 'name')
        .select('department status semesterId title')
        .lean();
      for (const s of sessions) {
        const semester = (s.semesterId as unknown as { name?: string } | null)?.name || '';
        const text = `${s.department} capstone ${semester} ${s.title || ''}`;
        if (!re.test(text) || results.filter((r) => r.kind === 'session').length >= LIMIT) continue;
        results.push({
          id: String(s._id),
          kind: 'session',
          title: `${s.department} Capstone${semester ? ` - ${semester}` : ''}`,
          subtitle: `Capstone session · ${statusLabel(s.status)}`,
          href: `${sessionsHref}${sessionsHref.includes('?') ? '&' : '?'}session=${s._id}`,
        });
      }

      const schemes = await GradingScheme.find({
        ...(admin ? {} : { department: { $in: coordinatorDepts } }),
        $or: [{ name: re }, { department: re }],
      })
        .select('name department track currentVersion')
        .limit(LIMIT)
        .lean();
      for (const sc of schemes) {
        results.push({
          id: String(sc._id),
          kind: 'scheme',
          title: sc.name,
          subtitle: `Grading scheme · ${sc.department}${sc.track ? ` · Capstone ${sc.track}` : ''} · ${sc.currentVersion ? `v${sc.currentVersion}` : 'draft'}`,
          href: `/capstone/grading-schemes/${sc._id}`,
        });
      }
    }

    // ── Accounts (admins) ──────────────────────────────────────────────────────────────
    if (admin) {
      const users = await User.find({ ...PEOPLE_ONLY, $or: [{ name: re }, { email: re }] })
        .select('name email roles invitePending')
        .limit(LIMIT)
        .lean();
      for (const u of users) {
        results.push({
          id: String(u._id),
          kind: 'user',
          title: u.name,
          subtitle: `${u.email} · ${(u.roles || ['teacher']).join(', ')}${u.invitePending ? ' · invited' : ''}`,
          href: `/admin/dashboard?tab=accounts&q=${encodeURIComponent(u.email)}`,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('GET /api/search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
