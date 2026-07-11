import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';
import CapstoneMarks from '@/models/CapstoneMarks';
import mongoose from 'mongoose';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await dbConnect();

    const { groupId, marks } = await request.json();
    if (!groupId || !Array.isArray(marks)) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    if (!mongoose.Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: 'Invalid group id' }, { status: 400 });

    const group = await CapstoneGroup.findById(groupId).populate('studentIds').populate('courseId').populate('supervisorId');
    if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });

    const saved: any[] = [];
    for (const m of marks) {
      const studentId = m._id;
      const value = Number(m.marks ?? 0);
      if (!mongoose.Types.ObjectId.isValid(studentId)) continue;

      let doc = await CapstoneMarks.findOne({ studentId, groupId, supervisorId: group.supervisorId, courseId: group.courseId, submissionType: 'report' });
      if (!doc) {
        doc = new CapstoneMarks({ studentId, groupId, supervisorId: group.supervisorId, courseId: group.courseId, submittedBy: session.user.id });
      }
      doc.reportMarks = value;
      doc.submissionType = 'report';
      doc.submittedBy = new mongoose.Types.ObjectId(session.user.id);
      await doc.save();
      saved.push({ studentId, value });
    }

    return NextResponse.json({ ok: true, savedCount: saved.length });
  } catch (error: any) {
    console.error('POST /api/capstone/submit-report-marks error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
