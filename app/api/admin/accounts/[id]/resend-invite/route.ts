import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { resendInvite } from '@/lib/userInvites';

export const runtime = 'nodejs';

// POST /api/admin/accounts/[id]/resend-invite
// Emails a fresh invitation link to an account that was invited but never activated. The
// previous link stops working.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await verifyAdminAccess(request);
    if (!access.ok) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const inviter = access.userId
      ? await User.findById(access.userId).select('name').lean<{ name?: string }>()
      : null;
    const result = await resendInvite(id, access.userId, { inviterName: inviter?.name });
    if (!result) {
      return NextResponse.json(
        { error: 'This account has no pending invitation - it may already be activated.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ emailSent: result.emailSent, email: result.user.email });
  } catch (error) {
    console.error('POST /api/admin/accounts/[id]/resend-invite error:', error);
    return NextResponse.json({ error: 'Failed to resend invitation' }, { status: 500 });
  }
}
