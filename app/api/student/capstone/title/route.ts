import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import { isPastSession } from '@/lib/capstoneStatus';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneSession from '@/models/CapstoneSession';

// Students may rename their project in any track, until the session is finished.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const anyUser = session?.user as any;
    if (!anyUser?.studentSession || !anyUser.studentAccountId) {
      return NextResponse.json({ error: 'Please sign in with your student Google account' }, { status: 401 });
    }
    const studentAccountId = anyUser.studentAccountId;

    const body = await request.json().catch(() => ({}));
    const groupId = typeof body?.groupId === 'string' ? body.groupId : '';
    const projectTitle = typeof body?.projectTitle === 'string' ? body.projectTitle.trim() : '';

    if (!groupId || !projectTitle) {
      return NextResponse.json({ error: 'groupId and projectTitle are required' }, { status: 400 });
    }

    await dbConnect();

    const group = await CapstoneGroup.findById(groupId);
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const isActiveMember = group.members.some(
      (m) => String(m.studentAccountId) === studentAccountId && !m.removedAt
    );
    if (!isActiveMember) {
      return NextResponse.json({ error: 'You are not an active member of this group' }, { status: 403 });
    }
    // Any track, until the session is finished (setting up or running).
    const capstoneSession = await CapstoneSession.findById(group.sessionId).select('status');
    if (!capstoneSession || isPastSession(capstoneSession.status)) {
      return NextResponse.json({ error: 'The project title can no longer be changed - this session is finished' }, { status: 409 });
    }

    group.projectTitle = projectTitle;
    await group.save();

    return NextResponse.json(group);
  } catch (error: any) {
    console.error('POST /api/student/capstone/title error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update title' }, { status: 500 });
  }
}
