import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/mongodb';
import CapstoneMarks from '@/models/CapstoneMarks';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await dbConnect();

    // Fetch report marks grouped by group
    const marks = await CapstoneMarks.find({ submissionType: 'report' })
      .populate('studentId', 'name studentId')
      .populate('groupId', 'groupName')
      .populate('supervisorId', 'name email')
      .populate('submittedBy', 'name email')
      .sort({ createdAt: -1 });

    // Transform to display format
    const files = marks.map((mark: any) => ({
      _id: mark._id,
      filename: `${mark.groupId?.groupName || 'Group'}-report-marks-${mark.createdAt.toISOString()}`,
      originalName: `${mark.groupId?.groupName || 'Group'}-report-marks-${mark.createdAt.toISOString()}.xlsx`,
      uploadedBy: mark.submittedBy || mark.supervisorId,
      createdAt: mark.createdAt,
      studentName: mark.studentId?.name,
      marks: mark.reportMarks,
      comments: mark.reportComments,
    }));

    return NextResponse.json({ files });
  } catch (error: any) {
    console.error('GET /api/capstone/report-marks-files error:', error);
    return NextResponse.json({ error: 'Failed to fetch report marks files' }, { status: 500 });
  }
}
