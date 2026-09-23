import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import Course from '@/models/Course';
import Student from '@/models/Student';
import { isPlausibleEmail } from '@/lib/mail';

// Persists the { studentId, email } pairs the ULAB Faculty Companion extension scraped
// from URMS (see lib/urmsExtensionImport.ts's connectAndStartEmailSync). Only touches
// students already enrolled in this course - the extension itself never talks to MMS's
// database directly, it just hands back what it scraped.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const emails = Array.isArray(body?.emails) ? body.emails : [];

    if (emails.length === 0) {
      return NextResponse.json({ error: 'No emails provided' }, { status: 400 });
    }

    await dbConnect();

    const course = await Course.findOne({ _id: id, userId: session.user.id });
    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    let updated = 0;
    for (const entry of emails) {
      const studentId = typeof entry?.studentId === 'string' ? entry.studentId.trim() : '';
      const emailRaw = typeof entry?.email === 'string' ? entry.email.trim().toLowerCase() : '';
      if (!studentId || !isPlausibleEmail(emailRaw)) continue;
      const email = emailRaw;

      const result = await Student.updateOne({ studentId, courseId: id }, { email });
      if (result.matchedCount > 0) updated += 1;
    }

    return NextResponse.json({ updated, received: emails.length });
  } catch (error: any) {
    console.error('POST /api/courses/[id]/sync-emails error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
