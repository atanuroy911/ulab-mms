import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import CapstoneGroup from '@/models/CapstoneGroup';
import StudentAccount from '@/models/StudentAccount';
import Semester from '@/models/Semester';
import { getCapstoneActor, isAdmin, isCoordinatorFor } from '@/lib/capstoneAuth';
import { computeSessionGrades } from '@/lib/capstoneGrades';
import { componentsOf, studentReport, type StudentTerm } from '@/lib/capstoneTranscript';
import { termRank } from '@/lib/studentPortal';
import { frameFor } from '@/lib/capstoneTranscriptData';

export const runtime = 'nodejs';

// GET /api/capstone/students/[studentAccountId]/transcript
// One student's capstone grade report: every capstone part they took, by term. Coordinators
// see the terms in departments they coordinate; admins see all.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ studentAccountId: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { studentAccountId } = await params;
    if (!mongoose.Types.ObjectId.isValid(studentAccountId)) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    await dbConnect();

    const student = await StudentAccount.findById(studentAccountId)
      .select('studentId name program department')
      .lean<{ studentId: string; name: string; program?: string; department?: string }>();
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // Groups the student is still a member of - a withdrawn membership has no grade.
    const groups = await CapstoneGroup.find({ members: { $elemMatch: { studentAccountId, removedAt: null } } })
      .select('sessionId track supervisorId supervisorLabel')
      .lean();
    const sessions = await CapstoneSession.find({ _id: { $in: groups.map((g) => g.sessionId) } });
    const visible = sessions.filter((s) => isAdmin(actor) || isCoordinatorFor(actor, s.department));
    if (!isAdmin(actor) && !visible.length && !(student.department && isCoordinatorFor(actor, student.department))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const semesters = await Semester.find({ _id: { $in: visible.map((s) => s.semesterId) } })
      .select('name')
      .lean<Array<{ _id: unknown; name: string }>>();
    const semName = new Map(semesters.map((s) => [String(s._id), s.name]));

    const terms: StudentTerm[] = [];
    for (const s of visible) {
      const mine = groups.filter((g) => String(g.sessionId) === String(s._id));
      const { groups: graded } = await computeSessionGrades(s, { _id: { $in: mine.map((g) => g._id) } });
      for (const g of graded) {
        const member = g.members.find((m) => m.studentAccountId === studentAccountId);
        if (!member) continue;
        terms.push({
          semesterName: semName.get(String(s.semesterId)) || '',
          sessionStatus: s.status,
          track: g.track,
          groupNumber: g.groupNumber,
          projectTitle: g.projectTitle,
          supervisorName: g.supervisorName || groups.find((x) => String(x._id) === g.groupId)?.supervisorLabel || null,
          components: componentsOf(g),
          member,
        });
      }
    }
    // Oldest term first, as a transcript reads; within a term, A before B before C.
    const rankOf = (name: string) => {
      const [sem, year] = name.split(' ');
      return termRank(sem, Number(year));
    };
    terms.sort((a, b) => rankOf(a.semesterName) - rankOf(b.semesterName) || a.track.localeCompare(b.track));

    const department = visible[0]?.department || student.department || 'CSE';
    const frame = await frameFor(department, 'Capstone Grade Report');
    const program = student.program || (department === 'CSE' ? 'BSc in Computer Science and Engineering' : null);
    const html = studentReport(frame, { studentId: student.studentId, name: student.name, program }, terms);
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/capstone/students/[studentAccountId]/transcript error:', error);
    return NextResponse.json({ error: 'Failed to build the grade report' }, { status: 500 });
  }
}
