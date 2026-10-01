import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import Semester from '@/models/Semester';
import { getCapstoneActor, isAdmin, isCoordinatorFor } from '@/lib/capstoneAuth';
import { computeSessionGrades } from '@/lib/capstoneGrades';
import { courseCode, groupsReport, rosterReport } from '@/lib/capstoneTranscript';
import { frameFor, groupExtras } from '@/lib/capstoneTranscriptData';

export const runtime = 'nodejs';

// GET /api/capstone/sessions/[id]/transcript?scope=roster|groups[&track=A][&groupId=...]
// A printable grade report for a session: every student (roster) or group by group.
// Coordinator/admin only - it shows every student's grade.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    await dbConnect();
    const session = await CapstoneSession.findById(id);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!isAdmin(actor) && !isCoordinatorFor(actor, session.department)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const sp = request.nextUrl.searchParams;
    const scope = sp.get('scope') === 'groups' ? 'groups' : 'roster';
    const track = (sp.get('track') || '').toUpperCase();
    const groupId = sp.get('groupId') || '';
    if (track && !['A', 'B', 'C'].includes(track)) return NextResponse.json({ error: 'track must be A, B or C' }, { status: 400 });
    if (groupId && !mongoose.Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const filter: Record<string, unknown> = {};
    if (track) filter.track = track;
    if (groupId) filter._id = groupId;
    const [{ groups }, semester] = await Promise.all([
      computeSessionGrades(session, filter),
      Semester.findById(session.semesterId).select('name').lean<{ name?: string }>(),
    ]);
    const sorted = [...groups].sort((a, b) => a.track.localeCompare(b.track) || a.groupNumber - b.groupNumber);
    const semesterName = semester?.name || '';
    const what =
      groupId && sorted[0]
        ? `${courseCode(session.department, sorted[0].track)} Group ${sorted[0].groupNumber}`
        : track
          ? courseCode(session.department, track)
          : 'All tracks';
    const frame = await frameFor(session.department, scope === 'groups' ? 'Capstone Group Results' : 'Capstone Grade Sheet', `${semesterName} · ${what}`);

    let html: string;
    if (scope === 'groups') {
      const extras = await groupExtras(sorted.map((g) => g.groupId));
      html = groupsReport(
        frame,
        sorted.map((g) => ({ grades: g, extra: extras.get(g.groupId) || { evaluators: [] } }))
      );
    } else {
      html = rosterReport(frame, sorted);
    }
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/capstone/sessions/[id]/transcript error:', error);
    return NextResponse.json({ error: 'Failed to build the grade report' }, { status: 500 });
  }
}
