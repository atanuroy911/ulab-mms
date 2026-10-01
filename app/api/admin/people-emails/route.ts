import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Student from '@/models/Student';
import StudentAccount from '@/models/StudentAccount';
import User from '@/models/User';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { actAsAllowed } from '@/lib/studentViewAs';

// Everyone the system can email, and who it can't yet.
//   GET   every student (by ID, across course rosters and capstone accounts) and staff member,
//         with the best known email
//   POST  { entries: [{ studentId, email }] } fills missing student emails (e.g. from URMS)
// Admin only.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  const access = await verifyAdminAccess(request);
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
  await dbConnect();
  const [rosters, accounts, staff] = await Promise.all([
    Student.find({}).select('studentId name email withdrawn courseId').lean(),
    StudentAccount.find({}).select('studentId name email').lean(),
    User.find({ systemAccount: { $ne: true } }).select('name email roles').lean(),
  ]);

  const people = new Map<string, { studentId: string; name: string; email: string | null; courses: number; capstone: boolean }>();
  const key = (id: string) => id.trim().toLowerCase();
  for (const a of accounts) {
    people.set(key(a.studentId), { studentId: a.studentId, name: a.name, email: a.email || null, courses: 0, capstone: true });
  }
  for (const r of rosters) {
    const k = key(r.studentId);
    const p = people.get(k) || { studentId: r.studentId, name: r.name, email: null, courses: 0, capstone: false };
    p.courses += 1;
    if (!p.email && r.email) p.email = r.email;
    people.set(k, p);
  }
  const students = [...people.values()].sort((a, b) => a.studentId.localeCompare(b.studentId));
  return NextResponse.json({
    students,
    staff: staff.map((u) => ({ name: u.name, email: u.email, roles: u.roles?.length ? u.roles : ['teacher'] })),
    summary: {
      students: students.length,
      studentsWithEmail: students.filter((s) => s.email).length,
      staff: staff.length,
    },
    actAsEnabled: await actAsAllowed(),
  });
}

export async function POST(request: NextRequest) {
  const access = await verifyAdminAccess(request);
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const entries: Array<{ studentId: string; email: string }> = Array.isArray(body?.entries) ? body.entries : [];
  if (!entries.length || entries.length > 5000) return NextResponse.json({ error: 'Send between 1 and 5000 entries' }, { status: 400 });
  await dbConnect();

  const result = { updated: 0, alreadySet: 0, invalid: [] as string[], unknown: [] as string[], conflicts: [] as string[] };
  for (const e of entries) {
    const studentId = String(e?.studentId || '').trim();
    const email = String(e?.email || '').trim().toLowerCase();
    if (!studentId || !EMAIL.test(email)) {
      result.invalid.push(studentId || email || '(blank)');
      continue;
    }
    const [account, rosterCount] = await Promise.all([
      StudentAccount.findOne({ studentId }).select('email'),
      Student.countDocuments({ studentId }),
    ]);
    if (!account && rosterCount === 0) {
      result.unknown.push(studentId);
      continue;
    }
    // Emails are unique per student account - never hand one student's address to another.
    const holder = await StudentAccount.findOne({ email, studentId: { $ne: studentId } }).select('studentId').lean();
    if (holder) {
      result.conflicts.push(`${studentId} (${email} belongs to ${holder.studentId})`);
      continue;
    }
    let changed = false;
    if (account) {
      if (account.email === email) result.alreadySet++;
      else if (!account.email) {
        account.email = email;
        await account.save();
        changed = true;
      } else {
        // An address the student signed in with is not overwritten by a list.
        result.alreadySet++;
      }
    }
    const roster = await Student.updateMany({ studentId, $or: [{ email: { $exists: false } }, { email: null }, { email: '' }] }, { $set: { email } });
    if (roster.modifiedCount) changed = true;
    if (changed) result.updated++;
  }
  return NextResponse.json(result);
}
