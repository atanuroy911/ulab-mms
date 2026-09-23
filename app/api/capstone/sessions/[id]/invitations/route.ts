import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import CapstoneSession from '@/models/CapstoneSession';
import User from '@/models/User';
import '@/models/Semester';
import { getCapstoneActor, canManageDepartment } from '@/lib/capstoneAuth';
import { isAllowedTeacherEmail } from '@/lib/authSettings';
import { isPlausibleEmail } from '@/lib/mail';
import { inviteUser } from '@/lib/userInvites';

export const runtime = 'nodejs';

// POST /api/capstone/sessions/[id]/invitations
// Body: { name, email, role: 'supervisor' | 'evaluator', projectTitle? }
// Invites someone without an account so they can be picked as a supervisor/evaluator right
// away. If the email already belongs to a registered user, that user is returned as-is and
// no email is sent; if it belongs to a pending invite, the invite is re-sent with a fresh link.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCapstoneActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = body?.role === 'evaluator' ? 'evaluator' : 'supervisor';
    const projectTitle = typeof body?.projectTitle === 'string' ? body.projectTitle.trim() : undefined;

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!isPlausibleEmail(email)) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    // Sign-in only accepts @ulab.edu.bd addresses, so an invite to any other domain would
    // create an account its owner could never use.

    await dbConnect();

    if (!(await isAllowedTeacherEmail(email))) {
      return NextResponse.json({ error: 'Only @ulab.edu.bd addresses can be invited' }, { status: 400 });
    }

    const session = await CapstoneSession.findById(id).populate('semesterId', 'name');
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (!canManageDepartment(actor, session.department)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // "Web Admin has added you" reads oddly to a new colleague - the email falls back to
    // "The capstone coordinator has" for the system account.
    const inviter = actor.systemAccount
      ? null
      : await User.findById(actor.userId).select('name').lean<{ name?: string }>();
    const result = await inviteUser({
      name,
      email,
      invitedBy: actor.userId,
      context: {
        role,
        department: session.department,
        semesterName:
          typeof session.semesterId === 'object' && session.semesterId !== null
            ? (session.semesterId as unknown as { name?: string }).name
            : undefined,
        projectTitle,
        inviterName: inviter?.name,
      },
    });

    const user = {
      _id: String(result.user._id),
      name: result.user.name,
      email: result.user.email,
      invitePending: !!result.user.invitePending,
    };
    if (result.status === 'existing') {
      return NextResponse.json({ status: 'existing', user });
    }
    return NextResponse.json({ status: result.status, user, emailSent: result.emailSent }, { status: 201 });
  } catch (error) {
    console.error('POST /api/capstone/sessions/[id]/invitations error:', error);
    return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 });
  }
}
