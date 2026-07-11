import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import dbConnect from '@/lib/mongodb';
import CapstoneGroup from '@/models/CapstoneGroup';

import { ADMIN_JWT_SECRET as SECRET } from '@/lib/adminAuth';

// Verify admin token
async function verifyAdminToken(request: NextRequest): Promise<boolean> {
  try {
    const token = request.cookies.get('admin-token')?.value;
    if (!token) return false;

    const { payload } = await jwtVerify(token, SECRET);
    return payload.type === 'admin';
  } catch (error) {
    return false;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; evaluatorId: string }> }
) {
  try {
    const isAdmin = await verifyAdminToken(request);

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await dbConnect();

    const { id, evaluatorId } = await params;

    const group = await CapstoneGroup.findById(id);
    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 }
      );
    }

    // Remove evaluator assignment
    group.evaluatorAssignments = group.evaluatorAssignments.filter(
      (assignment) => assignment.evaluatorId.toString() !== evaluatorId
    );

    await group.save();

    const updatedGroup = await CapstoneGroup.findById(group._id)
      .populate({
        path: 'studentIds',
        select: 'name studentId email',
      })
      .populate({
        path: 'supervisorId',
        select: 'name email',
      })
      .populate({
        path: 'evaluatorAssignments.evaluatorId',
        select: 'name email',
      })
      .populate({
        path: 'courseId',
        select: 'name code',
      });

    return NextResponse.json(updatedGroup);
  } catch (error: any) {
    console.error('Error removing evaluator assignment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove evaluator assignment' },
      { status: 500 }
    );
  }
}
